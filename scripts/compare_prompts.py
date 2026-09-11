"""명시적 입력 파일로 네 보강안 비교. 기본 mock, 실측은 --live를 명시한다."""
import argparse
import json
from pathlib import Path

from joker.config import Settings, load_dotenv
from joker.corpus.loader import load_attacks, load_patterns
from joker.deps import Deps
from joker.evaluation import compare_prompts
from joker.providers.registry import build_providers


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("original", "alternative", "selection", "heldout", "benign", "output"):
        p.add_argument("--" + name, required=True, type=Path)
    p.add_argument("--repeats", type=int, default=3)
    p.add_argument("--live", action="store_true", help=".env의 실제 모델 사용. API 비용이 발생할 수 있음")
    p.add_argument("--max-calls", type=int, default=1000, help="역할별 전체 비교 호출 상한")
    args = p.parse_args()
    settings = Settings(max_calls=args.max_calls)
    if args.live:
        load_dotenv()
        settings = Settings.from_env(max_calls=args.max_calls)
    selection = load_attacks([args.selection], run_audit=False)
    heldout = load_attacks([args.heldout], run_audit=False)
    benign = json.loads(args.benign.read_text())
    estimated = len(selection) + 4 * args.repeats * (len(heldout) + len(benign))
    if estimated > args.max_calls:
        p.error(f"대상 모델 호출 {estimated}회가 상한 {args.max_calls}회를 초과합니다.")
    providers = build_providers(settings)
    deps = Deps(settings=settings, **providers,
                patterns=tuple(load_patterns(Path(__file__).resolve().parents[1] / "data/defenses/patterns.yaml")))
    result = compare_prompts(args.original.read_text(), args.alternative.read_text(), selection,
                             heldout, benign, deps, args.repeats)
    # 기존 결과를 덮어쓰지 않는다.
    with args.output.open("x") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("MOCK: 성능 근거로 사용 불가" if result["is_mock"] else "실측 완료: 표본·정상 질문 평가 한계를 함께 읽으세요.")


if __name__ == "__main__":
    main()
