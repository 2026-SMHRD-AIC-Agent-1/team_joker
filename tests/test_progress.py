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

    def cb(stage, stage_done=None, stage_total=None, call=False):
        events.append((stage, stage_done, stage_total, call))

    return events, dataclasses.replace(deps, on_progress=cb)


@pytest.mark.boundary
def test_stages_are_reported_in_pipeline_order(mock_deps_vulnerable):
    events, deps = _collect(mock_deps_vulnerable)
    run_pipeline(TARGET_WITH_SECRET, deps)

    order = [s for s, *_ in events]
    firsts = [s for i, s in enumerate(order) if s not in order[:i]]
    assert firsts == ["recon", "attack_r1", "patch", "attack_r2", "report"], \
        "화면의 단계 목록은 pipeline.py 의 실제 함수 순서 그대로여야 한다"
    assert [s["key"] for s in PROGRESS_STAGES] == firsts, "계약의 단계 목록과 엔진이 어긋나면 안 된다"


@pytest.mark.boundary
def test_attack_progress_counts_are_measured_not_estimated(mock_deps_vulnerable):
    events, deps = _collect(mock_deps_vulnerable)
    run_pipeline(TARGET_WITH_SECRET, deps)

    calls = [e for e in events if e[3]]
    assert calls, "공격 1건마다 통지가 있어야 한다"
    for _stage, done, total, _ in calls:
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
    assert len(body["stages"]) == 5
