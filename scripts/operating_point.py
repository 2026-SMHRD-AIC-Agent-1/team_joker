"""동일 작동점 비교 — "같은 오탐률에서 누가 더 잡나".

왜 필요한가 (2026-09-14):
    0.5 문턱 하나로 모델을 나란히 세우면, 오탐률이 서로 다른 모델을 같은 줄에 놓게 된다.
    실제로 공개 모델 `protectai/deberta-v3-base-prompt-injection-v2` 는 우리 OOD 세트에서
    재현율이 더 높았지만(85.7% vs 79.6%), 같은 정상 문장 116건에서 오탐이 25.0% 였다.
    오탐 25% 짜리 필터는 재현율이 아무리 높아도 운영에 못 올린다.
    → **오탐을 같은 수준으로 맞춘 뒤 재현율을 비교해야** 공정하다.

무엇을 하나:
    · 정상 표본에서 각 모델의 오탐률이 목표치 이하가 되는 **가장 낮은 문턱**을 찾고,
    · 그 문턱에서 in-dist / OOD 공격 재현율을 다시 잰다.
    · 0.5 고정 문턱의 값도 같이 실어 둘을 비교할 수 있게 한다.

입력: detector/evaluate.py --dump-probs 로 저장한 JSON.
    python detector/evaluate.py --skip-baseline --extra <모델> --dump-probs docs/_probs/test.json
    python detector/evaluate.py --skip-baseline --extra <모델> \
        --test detector/data/ood_attacks.jsonl --dump-probs docs/_probs/ood.json

실행: python scripts/operating_point.py --indist docs/_probs/test.json --ood docs/_probs/ood.json
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

_spec = importlib.util.spec_from_file_location("defense_matrix", ROOT / "scripts" / "defense_matrix.py")
dm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dm)  # type: ignore[union-attr]


def load(path: Path) -> dict:
    d = json.loads(path.read_text(encoding="utf-8"))
    for k in ("texts", "labels", "probs"):
        if k not in d:
            raise SystemExit(f"[중단] {path} 에 '{k}' 가 없습니다 — --dump-probs 로 만든 파일이 맞나요?")
    return d


def split(d: dict, model: str) -> tuple[list[float], list[float]]:
    """(공격 확률들, 정상 확률들)."""
    ps = d["probs"][model]
    atk = [p for p, y in zip(ps, d["labels"]) if y == 1]
    ben = [p for p, y in zip(ps, d["labels"]) if y == 0]
    return atk, ben


def threshold_for_fpr(benign: list[float], target: float, floor: float = 0.5) -> float:
    """정상에서 오탐률이 target 이하가 되는 가장 낮은 문턱. 단 floor 아래로는 내리지 않는다.

    ★ 문턱은 '정상 표본' 에서만 정한다 — 공격 표본을 보고 정하면 그 자체가 튜닝이 된다.
    ★★ floor(기본 0.5 = 제품이 실제로 쓰는 문턱) 아래로 내리지 않는 이유:
        오탐이 이미 목표 이하인 모델(=우리)의 문턱을 더 낮추면 재현율이 공짜로 올라간다.
        그건 경쟁 모델을 우리 오탐 수준으로 '올려' 세우는 비교가 아니라, 우리 수치를
        정상 116건에 맞춰 '튜닝' 하는 것이다(n=116 에 과적합). 이 비교의 목적은
        **우리는 출고 상태 그대로 두고, 오탐이 높은 쪽을 우리 수준까지 올리는 것**이다.
    """
    if not benign:
        return floor
    allowed = int(len(benign) * target)
    ordered = sorted(benign, reverse=True)
    th = floor if allowed >= len(ordered) else ordered[allowed] + 1e-9
    return max(floor, th)


def auc(pos: list[float], neg: list[float]) -> float | None:
    """AUROC — 문턱과 무관한 '분리력' 그 자체. 동점은 평균 순위로 처리한다(Mann-Whitney U).

    왜 필요한가: 문턱 하나로 비교하면 "그건 문턱을 잘못 잡아서 그런 것 아니냐" 는 반박이 남는다.
    AUC 는 모든 문턱을 한꺼번에 본 값이라 그 반박을 닫는다.
    """
    if not pos or not neg:
        return None
    merged = sorted([(p, 1) for p in pos] + [(p, 0) for p in neg])
    ranks: dict[int, float] = {}
    i = 0
    while i < len(merged):                       # 동점 구간은 평균 순위
        j = i
        while j < len(merged) and merged[j][0] == merged[i][0]:
            j += 1
        avg = (i + j + 1) / 2
        for k in range(i, j):
            ranks[k] = avg
        i = j
    s_pos = sum(ranks[k] for k in range(len(merged)) if merged[k][1] == 1)
    n1, n0 = len(pos), len(neg)
    return (s_pos - n1 * (n1 + 1) / 2) / (n1 * n0)


def fpr_to_match(benign: list[float], atk: list[float], need: int) -> tuple[float, int] | None:
    """공격 need 건을 잡으려면 정상 오탐을 몇 건 감수해야 하나 — 가장 적은 오탐의 문턱."""
    if not benign or not atk or need > len(atk):
        return None
    best = None
    for th in sorted(set(benign) | set(atk)):
        if sum(1 for p in atk if p >= th) >= need:
            fp = sum(1 for p in benign if p >= th)
            if best is None or fp < best[1]:
                best = (th, fp)
    return best


def recall(atk: list[float], th: float) -> dict | None:
    if not atk:
        return None
    return dm.cell(sum(1 for p in atk if p >= th), len(atk))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="동일 작동점(같은 FPR)에서의 재현율 비교")
    ap.add_argument("--indist", required=True, help="test.jsonl 로 만든 --dump-probs JSON(정상 포함)")
    ap.add_argument("--ood", default=None, help="ood_attacks.jsonl 로 만든 --dump-probs JSON(공격만)")
    ap.add_argument("--target-fpr", type=float, default=0.0, help="맞출 오탐률 상한(기본 0.0)")
    ap.add_argument("--floor", type=float, default=0.5,
                    help="문턱 하한(기본 0.5 = 제품 문턱). 이 아래로는 내리지 않는다 — "
                         "우리 모델 재현율을 정상 표본에 맞춰 올리는 튜닝을 막는다.")
    ap.add_argument("--out", default=str(ROOT / "docs"))
    args = ap.parse_args(argv)

    idd = load(Path(args.indist))
    ood = load(Path(args.ood)) if args.ood else None
    models = list(idd["probs"])
    if not models:
        raise SystemExit("[중단] 저장된 모델이 없습니다.")

    rows = []
    for m in models:
        atk_i, ben = split(idd, m)
        if not ben:
            raise SystemExit(f"[중단] --indist 에 정상(label=0) 표본이 없습니다 — 문턱을 정할 수 없습니다.")
        th = threshold_for_fpr(ben, args.target_fpr, args.floor)
        atk_o = split(ood, m)[0] if (ood and m in ood["probs"]) else []
        sweep = {}
        for t in (0.0, 0.01, 0.05, 0.10, 0.25):
            tt = threshold_for_fpr(ben, t, args.floor)
            sweep[t] = {"th": tt,
                        "fpr": dm.cell(sum(1 for p in ben if p >= tt), len(ben)),
                        "id": recall(atk_i, tt), "ood": recall(atk_o, tt)}
        rows.append({
            "model": m, "th": th, "sweep": sweep, "benign": ben, "atk_o": atk_o,
            "auc_id": auc(atk_i, ben), "auc_ood": auc(atk_o, ben),
            "fpr_05": dm.cell(sum(1 for p in ben if p >= 0.5), len(ben)),
            "fpr_th": dm.cell(sum(1 for p in ben if p >= th), len(ben)),
            "id_05": recall(atk_i, 0.5), "id_th": recall(atk_i, th),
            "ood_05": recall(atk_o, 0.5), "ood_th": recall(atk_o, th),
        })

    L: list[str] = []
    a = L.append
    a(f"# 동일 작동점 비교 — 같은 오탐률에서의 재현율 · {datetime.now():%Y-%m-%d %H:%M}")
    a("")
    a(f"- in-dist 확률: `{idd['test']}`" + (f" · OOD 확률: `{ood['test']}`" if ood else ""))
    a(f"- 맞춘 오탐률 상한: **{args.target_fpr:.1%}** (정상 표본에서만 문턱을 정한다 — "
      "공격을 보고 정하면 그 자체가 튜닝이다)")
    a("")
    a("## 왜 이 표가 필요한가")
    a("")
    a("0.5 문턱 하나로 세우면 **오탐률이 서로 다른 모델이 같은 줄에 선다.** 오탐 25% 짜리 필터는 "
      "재현율이 높아도 운영에 못 올린다 — 정상 문의 4건 중 1건을 막기 때문이다. "
      "그래서 오탐을 같은 수준으로 맞춘 뒤 재현율을 다시 잰다.")
    a("")
    a("## 0.5 고정 문턱 (참고)")
    a("")
    a("| 모델 | 정상 오탐 | in-dist 재현율 | OOD 재현율 |")
    a("|---|---|---|---|")
    for r in rows:
        a(f"| `{r['model']}` | {dm.fmt(r['fpr_05'])} | {dm.fmt(r['id_05'])} | {dm.fmt(r['ood_05'])} |")
    a("")
    a(f"## 오탐 {args.target_fpr:.1%} 이하로 맞춘 문턱 (★ 공정 비교)")
    a("")
    a("| 모델 | 문턱 | 정상 오탐 | in-dist 재현율 | OOD 재현율 |")
    a("|---|---|---|---|---|")
    for r in rows:
        a(f"| `{r['model']}` | {r['th']:.3f} | {dm.fmt(r['fpr_th'])} | {dm.fmt(r['id_th'])} | "
          f"{dm.fmt(r['ood_th'])} |")
    a("")
    a("## 오탐률을 훑어 본 표 — 문턱 하나로 단정하지 않기 위해")
    a("")
    a("정상 표본이 116건뿐이라 '오탐 정확히 0%' 는 칼날 같은 기준이다. 허용 오탐을 올려 가며 "
      "재현율이 어떻게 따라오는지 같이 본다.")
    a("")
    for r in rows:
        a(f"**`{r['model']}`**")
        a("")
        a("| 허용 오탐 | 문턱 | 실제 오탐 | in-dist 재현율 | OOD 재현율 |")
        a("|---|---|---|---|---|")
        for t, v in sorted(r["sweep"].items()):
            a(f"| ≤{t:.0%} | {v['th']:.4f} | {dm.fmt(v['fpr'])} | {dm.fmt(v['id'])} | {dm.fmt(v['ood'])} |")
        a("")
    a("## AUC — 문턱과 무관한 분리력")
    a("")
    a("문턱 하나로 비교하면 \"문턱을 잘못 잡은 것 아니냐\" 는 반박이 남는다. AUC 는 모든 문턱을 "
      "한꺼번에 본 값이다. (OOD 는 공격만 있는 세트라 정상 표본은 in-dist 의 것을 쓴다.)")
    a("")
    a("| 모델 | in-dist AUC | OOD AUC |")
    a("|---|---|---|")
    for r in rows:
        fa = lambda x: "–" if x is None else f"{x:.3f}"
        a(f"| `{r['model']}` | {fa(r['auc_id'])} | {fa(r['auc_ood'])} |")
    a("")
    if len(rows) >= 2:
        ref = max(rows, key=lambda r: (r["auc_ood"] or 0))
        need = ref["sweep"][0.0]["ood"]["k"] if ref["sweep"][0.0]["ood"] else None
        if need:
            a("## 같은 재현율을 내려면 치러야 하는 오탐")
            a("")
            for r in rows:
                if r["model"] == ref["model"]:
                    continue
                got = fpr_to_match(r["benign"], r["atk_o"], need)
                if got:
                    th_, fp_ = got
                    a(f"- `{r['model']}` 가 OOD **{need}/{len(ref['atk_o'])}** (= `{ref['model']}` 와 동률)을 "
                      f"잡으려면 문턱 {th_:.4f} → 정상 오탐 **{fp_}/{len(r['benign'])} = {fp_/len(r['benign']):.1%}** 를 감수해야 한다.")
                else:
                    a(f"- `{r['model']}` 는 어떤 문턱으로도 OOD {need}건에 도달하지 못한다.")
            a("")
    a("## 읽는 법")
    a("")
    a(f"1. 문턱은 **{args.floor} 아래로 내리지 않는다**(제품이 실제 쓰는 문턱). 이미 오탐이 목표 "
      "이하인 모델은 출고 상태 그대로 두고, 오탐이 높은 쪽만 끌어올려 맞춘다 — 반대로 하면 "
      "우리 재현율을 정상 표본에 맞춰 튜닝하는 것이 된다.")
    a("2. 문턱을 올리면 재현율은 **반드시 내려가거나 같다** — 올라갔다면 계산이 뒤집힌 것이다.")
    a("3. 정상 표본 n 이 작으면(여기서는 116) '오탐 0%' 도 상한이 3% 대다 — CI 를 같이 읽는다.")
    a("4. 이 표는 **ML 층 단독** 비교다. 규칙 층은 확률이 없는 순수 함수라 문턱과 무관하게 더해진다.")
    a("")
    a("---")
    a("생성: `python scripts/operating_point.py`")
    md = "\n".join(L) + "\n"

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"operating_point_{datetime.now():%Y%m%d_%H%M%S}.md"
    out.write_text(md, encoding="utf-8")
    print(md)
    print(f"[완료] {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
