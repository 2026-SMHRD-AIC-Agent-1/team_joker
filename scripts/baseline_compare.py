"""단순 베이스라인 대비 — "이 성능이 얼마나 좋은 건가" 에 답하는 기준선.

왜 필요한가 (2026-09-14, 보안 현직자 피드백):
    "같은 테스트셋을 두고 단순 키워드 방어형이랑 지금 개발해둔 거랑 탐지 비율이 얼마나
    차이 나는지 성능 비교를 넣어라. 비교할 기준이 있어야 프로젝트 성과로 측정할 수 있다."
    → F1 0.981 은 그 자체로는 아무 말도 하지 않는다. **무엇보다 0.981 인지**가 성과다.

무엇을 내나:
    · in-distribution(test.jsonl) 과 OOD(ood_attacks.jsonl) 두 세트에서
      [키워드 규칙 · 길이 규칙 · 난독화 규칙 층 · JOKER-KO(ML) · 결합] 을 같은 표에 세운다.
    · 모든 칸을 혼동행렬(TP/FP/FN/TN)과 95% Wilson CI 로 낸다 — FP/FN 을 같이 보여야
      무엇을 개선해야 할지 보인다.
    · test 세트의 '실제 난이도' 를 같이 적는다(고유 attack_id 수 · 길이 분포).

★ 이 스크립트가 스스로 지키는 정직성 규칙 3개:
    1. **베이스라인 문턱은 우리에게 불리한 쪽으로 고른다.** 길이 규칙의 문턱은 그 규칙의
       F1 이 최대가 되는 값을 test 세트에서 직접 찾는다. 베이스라인을 약하게 잡아 놓고
       이겼다고 말하는 것이 이 표에서 제일 하기 쉬운 거짓말이기 때문이다.
    2. **키워드 목록은 공격 기법 정의에서 뽑고, 성적을 보고 고치지 않는다.** test 세트를
       보면서 단어를 추가하면 그건 베이스라인이 아니라 또 하나의 학습된 모델이다.
    3. **세트의 난이도를 같은 문서에 적는다.** 공격과 정상이 길이만으로 갈리는 세트라면
       그 세트의 F1 은 모델 성능이 아니라 세트의 성질이다.

실행:
    python scripts/baseline_compare.py                 # 전체(ML 포함 — torch 필요)
    python scripts/baseline_compare.py --rules-only    # torch 없이 베이스라인 + 규칙 층만
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import statistics
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

# 통계 헬퍼(wilson_ci·cell)와 필터 적용은 defense_matrix 와 한 벌로 쓴다 — 두 번 짜면 조용히 어긋난다.
_spec = importlib.util.spec_from_file_location("defense_matrix", ROOT / "scripts" / "defense_matrix.py")
dm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dm)  # type: ignore[union-attr]


# ── 베이스라인 1: 단순 키워드 방어형 ──────────────────────────────────
# ★ 목록은 data/attacks 의 기법 정의 6종에서 직접 뽑았다. test 세트 성적을 보고 고치지 않는다.
KEYWORDS: dict[str, tuple[str, ...]] = {
    "이전 지시 무시": ("무시", "잊어", "잊고", "초기화", "리셋"),
    "역할 위장·권위": ("개발자", "관리자", "점검", "보안팀", "감사팀", "디버그", "테스트 모드"),
    "출력 형식 강제": ("출력해", "알려줘", "말해줘", "채워", "빈칸", "그대로 적어"),
    "난독화": ("거꾸로", "base64", "디코딩", "초성", "자모", "역순"),
    "간접 지시": ("번역", "요약", "아래 문서", "첨부", "붙임"),
}
KEYWORD_FLAT: tuple[str, ...] = tuple(w for ws in KEYWORDS.values() for w in ws)


def keyword_hit(text: str) -> bool:
    low = text.lower()
    return any(w.lower() in low for w in KEYWORD_FLAT)


# ── 베이스라인 2: 길이 규칙 ───────────────────────────────────────────
def length_hit(text: str, threshold: int) -> bool:
    return len(text) >= threshold


def best_length_threshold(attacks: list[str], benign: list[str]) -> tuple[int, float]:
    """F1 이 최대가 되는 문턱을 찾는다 — ★ 베이스라인에 유리하게(= 우리에게 불리하게) 고른다."""
    best = (0, -1.0)
    lengths = sorted({len(t) for t in attacks + benign})
    for th in lengths:
        m = confusion(attacks, benign, lambda t, th=th: length_hit(t, th))
        if m["f1"] > best[1]:
            best = (th, m["f1"])
    return best


def zero_fpr_length_threshold(benign: list[str]) -> int:
    """정상 표본에서 오탐 0 이 되는 가장 낮은 길이 문턱(= 우리 FPR 0 과 같은 조건)."""
    return max((len(t) for t in benign), default=0) + 1


# ── 공통 집계 ─────────────────────────────────────────────────────────
def confusion(attacks: list[str], benign: list[str], pred) -> dict:
    """양성=공격. 공격만 있는 세트(benign=[])에서는 precision·f1 을 None 으로 둔다."""
    tp = sum(1 for t in attacks if pred(t))
    fn = len(attacks) - tp
    fp = sum(1 for t in benign if pred(t))
    tn = len(benign) - fp
    rec = tp / len(attacks) if attacks else 0.0
    if benign:
        prec = tp / (tp + fp) if (tp + fp) else 0.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    else:
        prec = f1 = None
    return {
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "recall": dm.cell(tp, len(attacks)) if attacks else None,
        "fpr": dm.cell(fp, len(benign)) if benign else None,
        "precision": prec, "f1": f1 if f1 is not None else -1.0,
    }


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def f1_str(m: dict) -> str:
    return "–" if m["precision"] is None else f"{m['f1']:.3f}"


def prec_str(m: dict) -> str:
    return "–" if m["precision"] is None else f"{m['precision']:.3f}"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="단순 베이스라인 대비 성능 비교")
    ap.add_argument("--test", default=str(ROOT / "detector" / "data" / "test.jsonl"))
    ap.add_argument("--ood", default=str(ROOT / "detector" / "data" / "ood_attacks.jsonl"))
    ap.add_argument("--rules-only", action="store_true", help="torch 없이 베이스라인 + 규칙 층만")
    ap.add_argument("--model-path", default=None)
    ap.add_argument("--threshold", type=float, default=0.5)
    ap.add_argument("--out", default=str(ROOT / "docs"))
    args = ap.parse_args(argv)

    test_p, ood_p = Path(args.test), Path(args.ood)
    if not test_p.exists():
        raise SystemExit(f"[중단] test 세트가 없습니다: {test_p}\n먼저 `python detector/build_dataset.py` 를 돌리세요.")
    rows = load_jsonl(test_p)
    atk_rows = [r for r in rows if r.get("label") == 1]
    id_atk = [r["text"] for r in atk_rows]
    benign = [r["text"] for r in rows if r.get("label") == 0]
    if not id_atk or not benign:
        raise SystemExit("[중단] test 세트에 공격 또는 정상 표본이 없습니다.")
    ood_atk = [r["text"] for r in load_jsonl(ood_p)] if ood_p.exists() else []

    # 세트 난이도 — 고유 시드 수와 길이 분포
    uniq_ids = sorted({r.get("attack_id") for r in atk_rows if r.get("attack_id")})
    methods: dict[str, int] = {}
    for r in atk_rows:
        methods[r.get("generation_method", "?")] = methods.get(r.get("generation_method", "?"), 0) + 1

    th_f1, _ = best_length_threshold(id_atk, benign)
    th_fpr0 = zero_fpr_length_threshold(benign)

    print(f"[진행] in-dist 공격 {len(id_atk)}(고유 시드 {len(uniq_ids)}) · 정상 {len(benign)} · OOD 공격 {len(ood_atk)}")
    print(f"[진행] 길이 규칙 문턱: F1 최대 {th_f1}자 · 오탐0 {th_fpr0}자")

    # 필터 층(규칙 / ML / 결합) — rules_only 면 ML 은 전부 False
    all_texts = sorted(set(id_atk) | set(benign) | set(ood_atk))
    blocked = dm.compute_blocked(all_texts, args.rules_only, args.model_path, args.threshold)

    def layer_pred(layer: str):
        return lambda t: bool(blocked[t][layer])

    methods_list: list[tuple[str, object]] = [
        (f"키워드 규칙 ({len(KEYWORD_FLAT)}개)", keyword_hit),
        (f"길이 규칙 (≥{th_f1}자)", lambda t: length_hit(t, th_f1)),
        (f"길이 규칙 (≥{th_fpr0}자 · 오탐0 조건)", lambda t: length_hit(t, th_fpr0)),
        ("난독화 규칙 층만", layer_pred("rule")),
    ]
    if not args.rules_only:
        methods_list += [("JOKER-KO (ML만)", layer_pred("ml")),
                         ("**JOKER-KO (ML+규칙)**", layer_pred("both"))]

    id_res = [(name, confusion(id_atk, benign, fn)) for name, fn in methods_list]
    ood_res = [(name, confusion(ood_atk, benign, fn)) for name, fn in methods_list] if ood_atk else []

    L: list[str] = []
    a = L.append
    a(f"# 단순 베이스라인 대비 성능 비교 · {datetime.now():%Y-%m-%d %H:%M}")
    a("")
    a("- 질문: **\"F1 0.981 은 얼마나 좋은 것인가?\"** — 비교 기준 없이는 답할 수 없다.")
    a(f"- in-distribution 세트: `{test_p.name}` · 공격 {len(id_atk)} · 정상 {len(benign)}")
    a(f"- OOD 세트: `{ood_p.name}` · 공격 {len(ood_atk)}건 (사람이 손으로 쓴 문장)"
      if ood_atk else "- OOD 세트: 없음(건너뜀)")
    a(f"- 필터: {'규칙 층만(ML 제외)' if args.rules_only else (args.model_path or 'detector/artifacts/joker-ko')}"
      f" · threshold {args.threshold}")
    a("")
    a("## ⚠️ 읽는 법")
    a("")
    a("1. **길이 규칙의 문턱은 베이스라인에 유리하게 골랐다** — 그 규칙의 F1 이 최대가 되는 값을 "
      "같은 세트에서 찾았다. 베이스라인을 약하게 잡고 이겼다고 말하지 않기 위해서다.")
    a("2. **키워드 목록은 공격 기법 정의 6종에서 뽑았고 성적을 보고 고치지 않았다.**")
    a("3. **in-distribution 표의 F1 은 모델 성능이 아니라 세트의 성질일 수 있다** — 아래 "
      "'세트 난이도' 를 먼저 읽을 것.")
    a("4. 정밀도·F1 은 정상 표본이 있어야 의미가 있다. OOD 는 공격만 있는 세트라 재현율과 "
      "FPR(같은 정상 표본)로 읽는다.")
    a("")
    a("## 세트 난이도 — 이 표를 먼저 본다")
    a("")
    a(f"- in-dist 공격 {len(id_atk)}행의 **고유 attack_id = {len(uniq_ids)}개** "
      f"({', '.join(uniq_ids)})")
    a(f"  - 생성 방식: {', '.join(f'{k} {v}' for k, v in sorted(methods.items()))}")
    a(f"  - 즉 표본은 {len(id_atk)} 이 아니라 사실상 **시드 {len(uniq_ids)}개**다. "
      f"이 표의 in-dist 수치를 단독 인용하면 안 되는 이유다.")
    a("")
    a("| 세트 | n | 길이 최소 | 중앙값 | 최대 |")
    a("|---|---|---|---|---|")
    for nm, xs in [("in-dist 공격", id_atk), ("정상", benign)] + ([("OOD 공격", ood_atk)] if ood_atk else []):
        ls = [len(x) for x in xs]
        a(f"| {nm} | {len(xs)} | {min(ls)} | {statistics.median(ls):.0f} | {max(ls)} |")
    a("")
    a(f"정상 문장은 최대 {max(len(x) for x in benign)}자, in-dist 공격은 최소 "
      f"{min(len(x) for x in id_atk)}자다 — **두 집합이 길이만으로 거의 갈린다.**")
    a("")
    a("## 1. in-distribution (test.jsonl)")
    a("")
    a("| 방식 | TP | FP | FN | TN | 정밀도 | 재현율 | F1 |")
    a("|---|---|---|---|---|---|---|---|")
    for name, m in id_res:
        a(f"| {name} | {m['tp']} | {m['fp']} | {m['fn']} | {m['tn']} | {prec_str(m)} | "
          f"{dm.fmt(m['recall'])} | {f1_str(m)} |")
    a("")
    if ood_res:
        a("## 2. OOD (사람이 손으로 쓴 공격) — 같은 정상 표본으로 FPR 동시 측정")
        a("")
        a("| 방식 | 탐지 | 놓침 | 재현율 | FPR (정상 " + str(len(benign)) + "건) |")
        a("|---|---|---|---|---|")
        for name, m in ood_res:
            a(f"| {name} | {m['tp']} | {m['fn']} | {dm.fmt(m['recall'])} | {dm.fmt(m['fpr'])} |")
        a("")
        a("**이 표가 성과의 근거다.** in-distribution 에서 벌어지는 차이는 세트가 쉬워서 생기는 것이고, "
          "사람이 새로 쓴 공격에서 같은 오탐 수준을 유지하며 벌어지는 차이가 실제 실력이다.")
        a("")
    a("## 다음 단계 — 공개 탐지기 대비 '위치' (별도 실행)")
    a("")
    a("llm-guard(ProtectAI)의 PromptInjection 스캐너 기본 모델은 Apache-2.0 이고 게이트가 없어 "
      "바로 세울 수 있다. `detector/evaluate.py --extra` 로 같은 세트에 올린다:")
    a("")
    a("```bash")
    a("python detector/evaluate.py --skip-baseline \\")
    a("  --extra protectai/deberta-v3-base-prompt-injection-v2 \\")
    a("  --test detector/data/ood_attacks.jsonl")
    a("```")
    a("")
    a("★ **이 비교를 '우리가 더 낫다' 로 읽지 않는다.** 해당 모델 카드는 스스로 "
      "*\"English 에만 초점을 맞췄고 비영어 프롬프트는 지원하지 않는다\"* 라고 적고 있다. "
      "한국어 세트에서 낮게 나오는 것은 설계대로의 결과이지 성능 열위가 아니다. "
      "따라서 이 표는 **성능 우위가 아니라 커버리지 공백**의 근거로만 쓴다 — "
      "\"공개 도구가 다루지 않는 구간이 있고, 우리가 그 구간을 측정 가능한 수준으로 채웠다\".")
    a("")
    a("※ 비교 모델은 **라벨러(선생)가 아니라 벤치마크(경쟁자)** 로만 쓴다 — 라벨을 받아오면 "
      "우리 상한이 그 모델로 묶이고 순환 평가가 된다.")
    a("")
    if args.rules_only:
        a("> ⚠️ 이 문서는 `--rules-only` 로 생성돼 **JOKER-KO(ML) 행이 없다.** "
          "학습 모델이 있는 PC 에서 옵션 없이 다시 돌려 대체할 것.")
        a("")
    a("---")
    a(f"생성: `python scripts/baseline_compare.py{' --rules-only' if args.rules_only else ''}`")
    md = "\n".join(L) + "\n"

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"baseline_compare_{datetime.now():%Y%m%d_%H%M%S}.md"
    out.write_text(md, encoding="utf-8")
    print()
    print(md)
    print(f"[완료] {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
