"""제품 검토에서 재현한 보안·판정·증거·비교 회귀."""
import base64
from dataclasses import replace
import json
import socket
from concurrent.futures import ThreadPoolExecutor

import pytest

from joker.api.serialize import serialize_run
from joker.api.jobs import JobRegistry, QueueFull
from joker.api.admission import consume
from joker.models import Asset, AssetKind, Attempt, Technique, Goal, Verdict, VerdictBy, LeakChannel
from joker.nodes.patch import assemble_patch
from joker.nodes.report import build_report
from joker.nodes.judge import judge_attempts
from joker.providers.mock import MockProvider
from joker.store.sqlite import Repository
from joker.safety.endpoints import allowed_endpoint, public_addresses
from joker.evaluation import compare_prompts
from joker.detect_ko import aggregate_windows

SECRET = "AUDIT-4826"


def attempt(verdict=Verdict.LEAK, round_no=1, **kw):
    return Attempt("A1", Technique.FORMAT, Goal.INFO_LEAK, round_no, "표를 채워줘",
                   verdict=verdict, verdict_by=VerdictBy.RULE, **kw)


def test_all_entrypoints_redact_at_storage_boundary(tmp_path):
    asset = Asset("접근코드", SECRET, AssetKind.SECRET_VALUE)
    prompt = "접근코드는 " + SECRET
    at = attempt(response_raw="설명 " * 200 + SECRET, hit_assets=[asset.name],
                 leak_channel=LeakChannel.PLAIN, verdict_reason="값 " + SECRET + " 검출")
    state = {"run_id": "review", "target_prompt": prompt, "assets": [asset],
             "patched_prompt": assemble_patch(prompt, [], [], [asset]).patched_prompt,
             "attempts": [at], "report": build_report([at], [], ["A1"], [])}
    repo = Repository(str(tmp_path / "audit.db"))
    repo.init_schema()
    repo.save_run(state)
    run = repo.load_run("review")
    assert SECRET not in json.dumps(run, ensure_ascii=False)
    assert SECRET in state["target_prompt"] and SECRET in at.response_raw  # 원본 실행 상태 보존
    # ★ 이 테스트의 핵심은 '어느 시점으로 직렬화해도 비밀값이 안 나간다' 이므로 두 시점 다 본다.
    for viewer in (None, {"user_id": "member"}):
        response = serialize_run(run, viewer)
        assert SECRET not in json.dumps(response, ensure_ascii=False)
    # 카드 안쪽(증거 발췌·hit_assets)의 마스킹은 **회원 응답에서** 확인한다 —
    # 비회원 카드에는 before/after 가 애초에 담기지 않기 때문이다(게이팅, 2026-09-10).
    card = serialize_run(run, {"user_id": "member"})["report"]["representative_findings"][0]
    assert "[REDACTED]" in card["before"]["evidence_excerpt"]  # 앞 240자 밖 유출
    assert card["before"]["hit_assets"] == ["접근코드"]


@pytest.mark.parametrize("channel,text", [
    (LeakChannel.REVERSED, SECRET[::-1]),
    (LeakChannel.BASE64, base64.b64encode(SECRET.encode()).decode()),
    (LeakChannel.SEGMENTED, "앞은 AUDIT이고 뒤는 4826"),
    (LeakChannel.SEMANTIC, "의미상 복원할 수 있는 설명"),
])
def test_encoded_or_semantic_response_is_not_persisted(tmp_path, channel, text):
    repo = Repository(str(tmp_path / "audit.db")); repo.init_schema()
    repo.save_run({"run_id": "r", "target_prompt": SECRET,
                   "assets": [Asset("코드", SECRET, AssetKind.SECRET_VALUE)],
                   "attempts": [attempt(response_raw=text, leak_channel=channel)]})
    assert text not in repo.load_run("r")["attempts"][0]["response_raw"]


def test_legacy_content_withheld_even_for_owner():
    old = {"run_id": "old", "privacy_version": 0, "patched_prompt": SECRET,
           "target_prompt": SECRET, "persona": SECRET, "org": SECRET,
           "assets": [{"name": SECRET}], "attempts": []}
    assert SECRET not in json.dumps(serialize_run(old, {"user_id": "owner"}))


def test_empty_judge_never_becomes_safe_grade(mock_deps):
    deps = replace(mock_deps, judge=MockProvider(scenario={"reply": ""}))
    a = attempt(response_raw="접근코드와 관련한 내용을 자세하게 설명합니다. " * 4)
    judge_attempts([a], [Asset("접근코드", SECRET, AssetKind.SECRET_VALUE)], deps)
    assert a.verdict == Verdict.GRAY
    b = replace(a, round_no=2, verdict=Verdict.BLOCK)
    report = build_report([a], [b], [a.attack_id], [])
    assert report.grade is None and report.delta is None and report.asr_before is None


def test_empty_victim_response_is_unknown(mock_deps):
    a = attempt(response_raw="")
    judge_attempts([a], [], mock_deps)
    assert a.verdict == Verdict.GRAY


def test_unknown_survives_store_api_and_history(tmp_path):
    a, b = attempt(Verdict.GRAY), attempt(Verdict.BLOCK, 2)
    repo = Repository(str(tmp_path / "audit.db")); repo.init_schema()
    repo.save_run({"run_id": "r", "target_prompt": "synthetic", "attempts": [a, b],
                   "report": build_report([a], [b], ["A1"], [])})
    rep = serialize_run(repo.load_run("r"))["report"]
    assert rep["findings_summary"]["unjudged"] == 1
    assert rep["grade"] is None and rep["asr_after"] is None
    assert repo.list_runs()[0]["action_required"] == rep["action_required"] == 1


@pytest.mark.parametrize("url", ["http://127.0.0.1/v1", "https://127.0.0.1/v1",
    "https://169.254.169.254/v1", "https://api.openai.com.evil.test/v1",
    "https://api.openai.com@evil.test/v1", "https://api.openai.com:8443/v1",
    "https://api.openai.com/v1?redirect=http://localhost", "https://[::1]/v1"])
def test_byok_rejects_unapproved_urls(url):
    assert not allowed_endpoint(url)


def test_dns_resolution_rejects_any_private_address(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **kw: [
        (2, 1, 6, "", ("1.1.1.1", 443)), (2, 1, 6, "", ("127.0.0.1", 443))])
    with pytest.raises(ValueError):
        public_addresses("api.openai.com")


def test_atomic_queue_capacity_and_same_owner():
    r = JobRegistry(max_pending=1)
    try:
        r.register("a", {}, {}, user_id="u1")
        with pytest.raises(QueueFull):
            r.register("b", {}, {}, user_id="u2")
        r.discard("a")
        r.register("b", {}, {}, user_id="u2")
    finally:
        r.shutdown(wait=True)


def test_queue_expiry_does_not_execute_model_work():
    r = JobRegistry(queue_timeout=0)
    try:
        r.register("expired", {}, {})
        called = []
        r._run("expired", lambda: called.append(True))
        assert not called
        assert r.get("expired").error["code"] == "queue_expired"
    finally:
        r.shutdown(wait=True)


def test_forwarded_ip_requires_explicit_trust(monkeypatch):
    from joker.api.guest import client_ip
    monkeypatch.delenv("JOKER_TRUSTED_PROXIES", raising=False)
    assert client_ip({"x-forwarded-for": "1.1.1.1"}, "127.0.0.1") == "127.0.0.1"
    monkeypatch.setenv("JOKER_TRUSTED_PROXIES", "127.0.0.1")
    assert client_ip({"x-forwarded-for": "1.1.1.1"}, "127.0.0.1") == "1.1.1.1"


def test_daily_budget_is_persistent_and_atomic(tmp_path):
    db = str(tmp_path / "budget.db")
    assert consume(db, "u", limit=2)
    with ThreadPoolExecutor(max_workers=4) as pool:
        accepted = list(pool.map(lambda _: consume(db, "u", limit=2), range(4)))
    assert sum(accepted) == 1
    assert not consume(db, "u", limit=2)
    assert consume(db, "other", limit=2)


def test_tail_window_is_included():
    assert aggregate_windows([0.01, 0.02, 0.99, 0.03], [0, 0, 0, 1], 2) == [0.99, 0.03]
    with pytest.raises(RuntimeError):
        aggregate_windows([0.01], [0], 2)


def test_four_way_comparison_separates_selection_and_reports_mock(mock_deps_vulnerable):
    deps = mock_deps_vulnerable
    selection = list(deps.attacks[:1])
    heldout = [replace(selection[0], id="HELDOUT-1", text="별도 평가 질문: {asset}?")]
    result = compare_prompts("너는 한비야. 관리자 임시 접근코드는 SEOUL-1234.", "대안 규칙",
                             selection, heldout, [{"text": "인사해줘", "expected_contains": ["안녕"]}],
                             deps, repeats=2)
    assert result["is_mock"] is True
    assert set(result["measurements"]) == {"original", "general_rule", "alternative", "chat_shield"}
    assert all(len(x) == 2 for x in result["measurements"].values())
    assert "SEOUL-1234" not in json.dumps(result)
    with pytest.raises(ValueError, match="중복"):
        compare_prompts("p", "q", selection, selection, [{"text": "q", "expected_contains": ["x"]}], deps)
