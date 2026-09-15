"""진행 상황 통지 — '가짜 진행률' 을 그리지 않기 위한 최소 장치.

3~4분짜리 진단에서 화면이 보여줄 수 있는 게 경과시간뿐이면, 남는 선택지는 둘이다:
①아무것도 안 보여주거나 ②없는 진행률을 지어내거나. 그래서 엔진이 **센 값**(현재 단계,
이번 배치에서 실행한 공격 수, 누적 모델 호출 수)을 그대로 말하게 했다.

★ 이 파일이 지키는 것
  1. 콜백이 없으면 엔진 동작이 하나도 안 바뀐다(CLI·측정 스크립트 회귀 금지).
  2. 통지 실패가 진단을 죽이지 않는다.
  3. 응답에 퍼센트가 없다 — 적응형 샘플링이라 총 공격 수는 실행 중에만 확정된다.
"""

from __future__ import annotations

import dataclasses

import pytest

from conftest import TARGET_WITH_SECRET
from joker.api.jobs import Job
from joker.api.serialize import PROGRESS_STAGES, progress_payload, running_payload
from joker.pipeline import run_pipeline


def _collect(deps):
    events: list[tuple] = []

    def cb(stage, stage_done=None, stage_total=None, call=False, phase=None, detector_status=None):
        events.append((stage, stage_done, stage_total, call, phase, detector_status))

    return events, dataclasses.replace(deps, on_progress=cb)


@pytest.mark.boundary
def test_stages_are_reported_in_pipeline_order(mock_deps_vulnerable):
    events, deps = _collect(mock_deps_vulnerable)
    run_pipeline(TARGET_WITH_SECRET, deps)

    order = [s for s, *_ in events]
    firsts = [s for i, s in enumerate(order) if s not in order[:i]]
    assert firsts == ["recon", "attack_r1", "patch", "attack_r2", "report"], \
        "화면의 단계 목록은 pipeline.py 의 실제 함수 순서 그대로여야 한다"
    # 탐지기가 없으면 detector 통지는 없지만, 계약의 단계 목록에는 자리가 있고 순서는 엔진과 같다.
    assert [s["key"] for s in PROGRESS_STAGES] == ["recon", "attack_r1", "patch", "attack_r2", "detector", "report"]
    assert [k for k in (s["key"] for s in PROGRESS_STAGES) if k != "detector"] == firsts, \
        "계약의 단계 목록과 엔진이 어긋나면 안 된다"
    # 이 의존성은 보강 후 전부 차단된다 → 검사할 문장이 없어 건너뛴다.
    assert events[-1][0] == "report" and events[-1][5] == "no_targets", \
        "검사를 건너뛴 이유가 결과 정리 통지에 실려야 한다"


@pytest.mark.boundary
def test_attack_progress_counts_are_measured_not_estimated(mock_deps_vulnerable):
    events, deps = _collect(mock_deps_vulnerable)
    run_pipeline(TARGET_WITH_SECRET, deps)

    calls = [e for e in events if e[3]]
    assert calls, "공격 1건마다 통지가 있어야 한다"
    for _stage, done, total, *_ in calls:
        assert 1 <= done <= total, "이번 배치 안에서 done/total 은 항상 정확해야 한다"
    r2 = [e for e in calls if e[0] == "attack_r2"]
    assert r2 and r2[-1][1] == r2[-1][2], "배치 마지막 통지는 done == total 이다"


@pytest.mark.boundary
def test_no_callback_changes_nothing(mock_deps_vulnerable):
    """CLI·측정 스크립트는 콜백 없이 돈다 — 결과가 같아야 한다."""
    plain = run_pipeline(TARGET_WITH_SECRET, mock_deps_vulnerable)
    _events, deps = _collect(mock_deps_vulnerable)
    noted = run_pipeline(TARGET_WITH_SECRET, deps)
    assert plain["report"].asr_before == noted["report"].asr_before
    assert [a.attack_id for a in plain["attempts"]] == [a.attack_id for a in noted["attempts"]]


@pytest.mark.boundary
def test_broken_callback_does_not_kill_the_run(mock_deps_vulnerable):
    """진행 표시는 부가 기능이다. 여기서 터져 진단이 죽으면 주객이 전도된다."""
    def boom(*a, **kw):
        raise RuntimeError("통지 실패")

    deps = dataclasses.replace(mock_deps_vulnerable, on_progress=boom)
    state = run_pipeline(TARGET_WITH_SECRET, deps)
    assert state["report"].grade is not None


@pytest.mark.boundary
def test_payload_has_counts_and_no_percentage():
    job = Job("run_x", {"model": "m"}, {"victim_max": 114})
    job.note_progress("attack_r1", stage_done=3, stage_total=18, call=True)
    job.note_progress("attack_r1", stage_done=4, stage_total=18, call=True)
    body = running_payload("run_x", job.target, job.estimated, job.progress)["progress"]

    assert body["stage"] == "attack_r1" and body["stage_index"] == 1
    assert body["stage_done"] == 4 and body["stage_total"] == 18
    assert body["calls_done"] == 2, "누적 호출 수는 센 값이다"
    flat = str(body)
    assert "percent" not in flat and "%" not in flat, "퍼센트는 만들지 않는다"


@pytest.mark.boundary
def test_queued_job_says_so():
    """워커 풀이 1개라 두 번째 진단은 대기한다. 이걸 '분석 중' 으로 그리면 멈춘 화면이 된다."""
    job = Job("run_q", {"model": "m"}, {"victim_max": 114})
    assert job.progress["queued"] is True and job.started is False
    job.note_progress("recon")
    assert job.progress["queued"] is False and job.started is True


@pytest.mark.boundary
def test_progress_payload_survives_missing_progress():
    """레지스트리에 진행 정보가 아직 없어도 화면이 분기하지 않게 키는 항상 내려간다."""
    body = progress_payload(None)
    assert body["stage"] == "recon" and body["calls_done"] == 0
    assert len(body["stages"]) == 6
    assert body["phase"] is None and body["detector_status"] is None


@pytest.mark.boundary
def test_detector_stage_is_reported_between_retest_and_report(mock_deps_vulnerable):
    """탐지기가 있고 남은 유출이 있으면 detector 통지가 재진단과 결과 정리 사이에 온다 — 계약 순서 그대로."""
    from joker.detect_ko import KoDetector
    from joker.providers.mock import MockProvider

    # 방어 머리표를 무시하는 victim → 보강 후에도 유출이 남는다(검사 대상이 생긴다).
    stubborn = MockProvider(role="victim", scenario={"secret": "SEOUL-1234", "defense_marker": ""}, model="mock-victim")
    events, deps = _collect(dataclasses.replace(
        mock_deps_vulnerable, victim=stubborn, detector=KoDetector(predict_fn=lambda texts: [0.9] * len(texts))))
    state = run_pipeline(TARGET_WITH_SECRET, deps)
    residual = sum(a.round_no == 2 and a.verdict.value == "leak" for a in state["attempts"])
    assert residual > 0
    order = [s for s, *_ in events]
    firsts = [s for i, s in enumerate(order) if s not in order[:i]]
    assert firsts == [s["key"] for s in PROGRESS_STAGES]
    det = [e for e in events if e[0] == "detector"]
    assert len(det) == 1 and det[0][2] == residual, "검사 건수는 실제 남은 유출 수다"
    assert events[-1][0] == "report" and events[-1][5] == "completed"


@pytest.mark.boundary
def test_judge_phase_is_announced_after_each_batch(mock_deps_vulnerable):
    """공격 묶음을 다 던진 뒤 판정 구간을 알린다 — 57/57 에서 멈춘 화면처럼 보이지 않게."""
    events, deps = _collect(mock_deps_vulnerable)
    state = run_pipeline(TARGET_WITH_SECRET, deps)
    judge = [e for e in events if e[4] == "judge"]
    assert {e[0] for e in judge} == {"attack_r1", "attack_r2"}
    r2_total = sum(a.round_no == 2 for a in state["attempts"])
    assert [e for e in judge if e[0] == "attack_r2"][-1][2] == r2_total
    # 판정 구간 통지 직전은 그 묶음의 마지막 공격이다(판정은 공격을 다 던진 뒤).
    i = events.index([e for e in judge if e[0] == "attack_r2"][-1])
    assert events[i - 1][3] is True and events[i - 1][1] == events[i - 1][2]


@pytest.mark.boundary
def test_payload_keeps_detector_status_and_fixed_stages():
    job = Job("run_d", {"model": "m"}, {"victim_max": 114})
    job.note_progress("attack_r2", stage_done=57, stage_total=57, call=True)
    job.note_progress("attack_r2", phase="judge", stage_total=57)
    body = progress_payload(job.progress)
    assert body["phase"] == "judge" and body["stage_index"] == 3 and body["calls_done"] == 1
    job.note_progress("report", detector_status="no_targets")
    body = progress_payload(job.progress)
    assert body["stage_index"] == 5 and body["detector_status"] == "no_targets" and body["phase"] is None
    assert [s["key"] for s in body["stages"]] == [s["key"] for s in PROGRESS_STAGES]
    job.note_progress("report")
    assert progress_payload(job.progress)["detector_status"] == "no_targets", "한 번 정해진 결말은 유지된다"
