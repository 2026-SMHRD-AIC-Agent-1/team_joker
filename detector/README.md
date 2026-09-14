# JOKER-KO — 한국어 프롬프트 인젝션 1차 탐지기

기성 보안 모델 **Llama-Prompt-Guard-2-86M**(multilingual mDeBERTa)을 **우리 한국어 공격 데이터로
파인튜닝**해, 입력이 챗봇에 닿기 전 **1차로 공격을 걸러내는 탐지기**를 만든다.
입력단(공격인가?)을 보는 이 탐지기와, 기존 Judge(출력이 유출됐나?)는 역할이 달라 안 겹친다.

```
사용자 입력 → [JOKER-KO 탐지] → SAFE 통과 / 의심·공격 → 기존 Joker 엔진(정밀 판정·처방·재진단)
```

## 파일
```
detector/
  fetch_benign.py    공개데이터(open-korean-instructions·Chatbot_data)에서 정상 문장 대량 추출
  build_dataset.py   attacks.yaml + 정상 → train/val/test.jsonl (누수 방지 그룹 분할)
  train.py           Prompt Guard 2 → 파인튜닝 → artifacts/joker-ko/
  evaluate.py        baseline(원본) vs JOKER-KO(+ --extra 로 Kakao 벤치마크) F1 비교
  data/
    benign_seed.txt      정상 시드(직접 작성분 68개) — 팀원/공개데이터와 --benign 으로 합침
    benign_public.txt    fetch_benign.py 생성(대량)
    train/val/test.jsonl build_dataset.py 생성
```

## 실행 순서 (GPU 환경 = Colab / 학원 PC)
```bash
pip install -r detector/requirements.txt
# ★ Blackwell GPU(RTX 50xx, 학원 PC)면 torch 재설치: pip install torch --index-url https://download.pytorch.org/whl/cu128
huggingface-cli login          # + 모델 페이지에서 라이선스 동의(게이트):
#                                https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M

# 1) 데이터셋: 팀원 정상문구(.txt) 5종 합치기 (대화체는 *_clean.txt = Q만 추출본)
python detector/build_dataset.py --benign \
    detector/data/benign_seed.txt \
    detector/data/류성환_한국어정상문장_200개.txt \
    "detector/data/한국어문장 200.txt" \
    detector/data/원서윤_clean.txt \
    detector/data/채효석_clean.txt

# 2) 학습 → 평가
python detector/train.py --class-weights
python detector/evaluate.py --finetuned detector/artifacts/joker-ko

# 3) 정직성: 변형 제외로도 재측정 (별도 --out → 변형 모델 안 덮음)
python detector/build_dataset.py --no-variants --benign detector/data/benign_seed.txt detector/data/류성환_한국어정상문장_200개.txt "detector/data/한국어문장 200.txt" detector/data/원서윤_clean.txt detector/data/채효석_clean.txt
python detector/train.py --class-weights --out detector/artifacts/joker-ko-nv
python detector/evaluate.py --finetuned detector/artifacts/joker-ko-nv

# (Windows CMD 는 줄바꿈 \ 안 되니 --benign 목록을 한 줄로 이어서)
```

## 학습 완료 — 실측 결과 (2026-09-03 · 2026-09-14 재검증)
정상 765건(팀원 정상문구 5종 합침) + 공격 57시드로 학습. test 세트 F1:

| 데이터 | 기성 모델(원본) F1 | JOKER-KO F1 |
|---|---|---|
| 변형 포함 (공격 105) | 0.000 | 0.981 |
| 변형 제외 (공격 31) | 0.000 | 1.000 |

- Prompt Guard 2는 우리 공격에 median 확률 0.001 = 그 모델은 한국어를 못 봄(문턱 문제 아님).
- **⚠️ 0914 재검증 — 이 표를 발표 헤드라인으로 쓰지 말 것.** 두 가지가 드러났다.
  1. **test 세트가 쉽다.** 공격 105행의 고유 시드는 **10개**뿐이고, 공격(중앙값 89자)과
     정상(중앙값 26자)이 길이로 거의 갈린다. **"길이 ≥48자면 공격" 규칙도 F1 0.952**가 나온다.
     → `python scripts/baseline_compare.py`
  2. **"기성 모델은 한국어를 못 본다"는 일반화가 틀렸다.** llm-guard 기본 모델
     `protectai/deberta-v3-base-prompt-injection-v2`(영어 전용이라고 적힌 모델)는 우리 OOD 공격에
     median 확률 0.999 를 준다. 0.5 문턱에서 42/49 로 우리(39/49)보다 높다.
     **다만 그 대가로 정상 116건 중 29건(25.0%)을 함께 막는다.** 오탐을 0%로 맞추면 0/49.
     AUC 는 OOD 0.874 vs 우리 0.996. → `python scripts/operating_point.py`
  - 인용은 **"정상 업무를 막지 않으면서 잡는다"**(오탐 0% · AUC 0.996)로 한다.
- **한계(정직):** test가 공격 생성기와 같은 분포 → F1은 상한선. 역순·초성분해·base64 난독화는 일부 미탐(변형포함 FN 4건이 그 유형).
- 모델 저장: `artifacts/joker-ko`(변형포함) · `artifacts/joker-ko-nv`(변형제외). 둘 다 `.gitignore`(대용량).
- 정상 더 필요하면 `fetch_benign.py`(공개데이터, MIT) 로 보강.

## 주의
1. **정상 데이터 균형** — 공격:정상이 크게 치우치면 `--class-weights` 로 보정하되, 근본은 정상 수를 늘리는 것.
2. **모델 게이트** — Meta 승인 대기 시 `protectai/deberta-v3-base-prompt-injection-v2`(Apache·게이트없음)로 선행.
3. **변형 과대평가** — mutated 는 규칙 8종이라 분포가 좁다 → `--no-variants` 로도 재서 함께 보고.
4. **Kakao 는 선생❌ 경쟁자⭕** — 라벨러로 쓰면 상한이 Kakao 로 묶이고 순환평가가 된다. evaluate.py `--extra` 로 벤치마크만.

## 다음 — 엔진 연결(1차 레이어)
성능 실측 완료 → `src/joker/` 입력단에 탐지 훅 연결(SAFE→통과 / 의심→엔진 / threshold 애매값만 OpenAI 2차). 진행 예정.
