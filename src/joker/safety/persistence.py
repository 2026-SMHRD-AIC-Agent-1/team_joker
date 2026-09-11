"""저장 경계의 단일 마스킹 경로. 실행 중 원본은 변경하지 않는다.

알려진 보호값 및 일반 키 형식을 제거한다. 의미상·조각 유출과 판정 불가는
정확한 마스킹 구간을 보장할 수 없어 응답 전체를 보류한다.
모든 미지의 개인정보를 탐지한다고 주장하지 않는다.
"""
from copy import deepcopy
from dataclasses import replace
import hashlib

from joker.models import Verdict, LeakChannel
from joker.safety.masking import mask_secrets, redact_values

PRIVACY_VERSION = 1


def safe_snapshot(state):
    result = deepcopy(state)
    if not result.get("target_prompt_hash"):
        result["target_prompt_hash"] = "sha256:" + hashlib.sha256(
            (state.get("target_prompt") or "").encode()).hexdigest()[:16]
    values = [a.value for a in state.get("assets", []) if a.value]

    def clean(text):
        return mask_secrets(redact_values(text, values)) if text else text

    for key in ("target_prompt", "patched_prompt", "persona", "org"):
        result[key] = clean(result.get(key))
    result["assets"] = [replace(a, name=clean(a.name), source=clean(a.source), value=None)
                        for a in result.get("assets", [])]
    for at in result.get("attempts", []):
        at.rendered_text = clean(at.rendered_text)
        at.verdict_reason = clean(at.verdict_reason)
        at.hit_assets = [clean(n) for n in at.hit_assets]
        if at.verdict not in (Verdict.LEAK, Verdict.BLOCK) or (
            at.verdict == Verdict.LEAK and at.leak_channel not in
            (LeakChannel.PLAIN, LeakChannel.REVERSED, LeakChannel.BASE64)
        ):
            at.response_raw = "[REDACTED] 변형·의미상 유출 또는 판정 불가 응답은 원문을 보관하지 않습니다."
            # 심판 설명에도 의미상 유출이 재현될 수 있다.
            at.verdict_reason = ("판정 불가: 재검증이 필요합니다." if at.verdict == Verdict.GRAY
                                 else "변형·의미상 유출로 판정했습니다. 원문 증거는 보관하지 않습니다.")
        else:
            at.response_raw = clean(at.response_raw)
            from joker.detect.rules import judge_by_rule
            residual, _, _ = judge_by_rule(at.response_raw, list(state.get("assets", [])))
            if residual != Verdict.BLOCK:
                at.response_raw = "[REDACTED] 마스킹 구간을 확정할 수 없어 응답 원문을 보류했습니다."
    return result
