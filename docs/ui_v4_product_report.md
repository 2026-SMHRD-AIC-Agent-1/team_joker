# Chat Shield UI v4 — 제품화 보고서 (코드 수정 전 분석)

작성 2026-09-09 · 상태: **보고 · 승인 대기** · 선행 [[chatshield-화면개편]] [[chatshield-게이팅]] [[ui_saas_redesign_v3]]

## 0. 먼저 — 벤치마크는 받고, 데이터 모델은 못 받는다

요청서의 품질 기준(Linear/Vercel/Stripe/Wiz/Datadog 급 밀도·타이포·상태 처리)은 전부 수용한다.
그러나 요청서가 전제한 **데이터 모델 일부는 이 제품에 존재하지 않는다.** 화면에 만들면 전부 거짓말이 되고,
심사에서 "그 숫자 기준이 뭐죠" 한마디에 무너진다. 아래는 요청 ↔ 실제의 1:1 대응이다.

| 요청서 | 이 제품의 실제 | 처리 |
|---|---|---|
| AI Asset 등록·관리 화면 | 자산 등록 테이블·API가 **없다.** 진단 대상은 매번 붙여넣는 지시문 1건 | **만들지 않음.** 대신 `Scans`(진단 목록)에 persona·org·model 을 실어 자산처럼 읽히게 |
| Security Score 82/100 | 엔진이 주는 것은 **등급 A~F** 와 ASR(0~1) | 등급을 그대로 1급 지표로. 100점 환산 **안 함** |
| Critical / High / Medium / Low | 심각도 체계 없음. 대신 `round_no × verdict` 파생 **5상태** (실측 근거 있음) | 5상태를 severity 로 승격 — 색·순서·배지를 전 화면 통일 |
| Jailbreak / OOD / Data Leakage | 엔진의 분류는 **기법 6종**(ROLE/AUTH/INDIRECT/OBFUSC/FORMAT/INDIRECT_DOC) × **목표 3종**(INFO_LEAK/POLICY_BREAK/PERSONA_BREAK) | 이 taxonomy 를 Threat Type 자리에 씀. 없는 카테고리 추가 안 함 |
| Scan 단계 체크리스트 · 68% | API 가 진행률을 **주지 않는다** | ★ 유일하게 **백엔드 추가를 제안**한다(§7-a). 승인 없으면 경과시간만 유지 |
| Confidence 98.7% | 진단에는 confidence 가 없다. **실시간 탐지에는 진짜 있다**(ML score·threshold·rule_flags) | 탐지 화면에서만 사용. 진단 Finding 은 `판정 근거 규칙/LLM` 사용 |
| Login → Dashboard | 전환 동선은 **비회원 1회 진단 → 게이트 → 가입**(SSL Labs·Snyk 모델) | 로그인 랜딩 **만들지 않음** |
| ⌘K 커맨드 메뉴 · 키보드 단축키 | Streamlit 은 커스텀 JS 컴포넌트 없이는 전역 키 입력을 못 받는다 | 12일 일정에서 **범위 밖**. 대신 검색·필터를 화면 안에 둔다 |
| 페이지 전환 애니메이션 | Streamlit 은 상호작용마다 스크립트 전체를 재실행한다 | **불가.** 모션은 hover·모달·스켈레톤·토스트·스테퍼로 한정 |

---

## 1. 현재 UI의 가장 큰 문제 10개

1. **타이포·간격이 화면마다 다르다.** `page_header`(신규)와 `.sec`(구)가 공존하고, 여백이 `.4rem`·`.9rem`·`2.4rem` 처럼 즉흥적이다 → spacing scale 부재.
2. **색이 코드에 흩어져 있다.** `#DC2626`·`#0F9D6E` 가 20곳 넘게 문자열로 박혀 있어, severity 색을 한 번에 못 바꾼다.
3. **탐지·이력·설정이 아직 구 구조다.** 페이지 제목·액션 줄이 없고, 이력은 `selectbox + 열기 버튼` 이라 목록이 아니라 폼이다.
4. **표가 재사용 불가.** 대시보드와 발견 항목이 각자 `st.columns` 를 반복해 열 정의·행 높이·hover 가 제각각.
5. **로딩이 스피너뿐.** 스켈레톤이 없고, 3~4분 진단에서 사용자가 볼 수 있는 정보가 경과시간 하나다.
6. **빈 상태가 1종뿐.** `render_empty` 는 있으나 화면별 문구·CTA 가 없다.
7. **행동 피드백이 없다.** 삭제·저장·복사 후 토스트가 없어 "됐나?" 를 화면이 답하지 않는다(`st.toast` 미사용).
8. **이력이 `st.dataframe`(canvas).** 클릭 불가, DOM 에 텍스트가 없어 자동 검증도 불가, 스타일도 나머지와 다르다.
9. **랜딩과 앱의 톤 차이가 아직 부족하다.** 히어로 이후 섹션들이 마케팅 문법 그대로다.
10. **반응형 미검증.** `max-width:1140px` 고정, 표 6열은 태블릿에서 깨지고, 사이드바를 접으면 브랜드·상태가 통째로 사라진다.

---

## 2. 새 IA

```
공개 (비회원 · 마케팅 셸)
└ Landing            히어로 · 지시문 입력 · 두 방어층 · 실측 근거(접이식)

앱 (App Shell)
├ Overview           내 보안 상태 요약 — 미해결 합계 · 최근 스캔 · 개선 추이
├ Scans              진단 목록 (구 '이력')            ← AI Assets 자리
│  └ Scan Result     등급 · 5상태 스트립 · 기법별 · 발견 항목
│     └ Finding Detail   공격 → 응답 → 판정 → 위험 → 조치
├ Detection          실시간 입력 탐지 (JOKER-KO)
└ Settings           연결 · 계정 · 신뢰성 근거
```

- `New Scan` 은 메뉴가 아니라 **사이드바 상단 상시 CTA**(가장 잦은 행동).
- Reports 는 별도 페이지로 만들지 않는다 — 리포트는 Scan Result 자체다. 껍데기 메뉴를 늘리지 않는다.

## 3. Navigation

| 위치 | 요소 | 목적 |
|---|---|---|
| 사이드바 상단 | 로고 → Landing / **＋ New Scan** | 브랜드 · 1급 행동 |
| 사이드바 본문 | Overview · Scans(N) · Detection · Settings | 4개. 상태 배지는 **미해결 건수**만 |
| 사이드바 하단 | 계정(이메일/로그인·가입) · 엔진 상태 칩 | 상태 칩 클릭 → Settings |
| 콘텐츠 상단 | PageHeader(제목 · 메타 · 액션) + 구분선 | 어느 화면인지 · 무엇을 할 수 있는지 |
| 콘텐츠 상단(리포트) | Breadcrumb `Scans / run_… / AUTH-06` | 3단 깊이에서 길을 잃지 않게 |

## 4. 페이지 목록 (8 + 상태 화면)

| # | 페이지 | 핵심 질문 | 상태 |
|---|---|---|---|
| 1 | Landing | "내 챗봇 안전한가?" | 구현됨, 톤 마감 필요 |
| 2 | New Scan | "무엇을 진단하나" | 구현됨, 헤더·고급설정 정리 |
| 3 | Scan Progress | "지금 뭘 하고 있나" | **스테퍼 신규**(§7-a 승인 시) |
| 4 | Scan Result | "얼마나 위험한가" | 2단계 완료, 마감 필요 |
| 5 | Finding Detail | "이 건은 무엇이고 뭘 하나" | 3단계 완료 |
| 6 | Scans | "지금까지 뭘 진단했나" | **재작성**(dataframe → 목록) |
| 7 | Detection | "이 입력은 공격인가" | 스타일 통일 필요 |
| 8 | Settings | "연결·계정" | 스타일 통일 필요 |
| — | Empty / Loading / Error | — | Error 5종 완료 · Empty·Skeleton 신규 |

## 5. 디자인 시스템 (토큰)

**색** — 한 곳(`:root`)에서만 정의하고 코드의 하드코딩 색은 전부 제거한다.

| 토큰 | 값 | 용도 |
|---|---|---|
| `--bg` | `#FFFFFF` | 페이지 바닥 |
| `--surface` | `#F7F9FC` | 표 헤더·보조 블록 |
| `--elevated` | `#FFFFFF` + `--sh-1` | 카드·패널 |
| `--nav` | `#0B1220` | 사이드바 |
| `--border` / `--border-soft` | `#E6EAF0` / `#F1F5F9` | 경계 / 행 구분선 |
| `--text` / `--text-2` / `--muted` | `#0B1220` / `#42506B` / `#94A3B8` | 본문 3단 |
| `--accent` | `#1D4ED8` | 1급 행동·링크 |
| `--sev-unresolved` | `#DC2626` | 🔴 미해결 |
| `--sev-regressed` | `#EA580C` | 🟠 처방 후 신규 |
| `--sev-resolved` | `#0F9D6E` | 🟢 해결됨 |
| `--sev-unaffected` | `#94A3B8` | ⚪ 영향 없음 |
| `--sev-noretry` | `#64748B` | ⚫ 재진단 없음 |

**간격** `--sp-1:4px · 2:8 · 3:12 · 4:16 · 5:24 · 6:32 · 7:48` — 이 7개 밖의 값을 쓰지 않는다.
**모서리** `--r-s:6 · --r-m:10 · --r-l:14`. 그 이상 둥근 값은 쓰지 않는다(알약은 배지·pill 전용).
**타이포** Pretendard. `11/12/13/14/16/20/26px`, 굵기 `500/600/700/800`, 숫자는 전부 `tabular-nums`,
제목은 `letter-spacing:-.03em`, 한글은 `word-break:keep-all`.
**높이** 표 행 32px · 버튼 36px(1급 40px) · 입력 40px · 사이드바 항목 38px.
**그림자** 2단만: `--sh-1`(카드) · `--sh-2`(모달·hover).
**모션** hover/색 `120ms ease-out` · 모달·토스트 `180ms cubic-bezier(.2,.8,.2,1)` · 스켈레톤 `1.2s` shimmer. 그 외 없음.

## 6. Component architecture

**파일은 나누지 않는다.** `tests/` 3개가 `ui/streamlit_app.py` **소스 문자열**을 직접 검사하고
(`test_ui_marks_mock_rows` · `test_ui_does_not_blur_on_the_client` · `test_ui_does_not_print_raw_exceptions`),
`test_import_boundaries` 는 `ui/*.py` 전체를 훑는다. 12일 남은 시점에 파일 분리는 테스트 리스크만 늘린다.
대신 파일 안을 **6개 층**으로 고정하고 각 층 위에 구획 주석을 둔다:

```
① TOKENS   :root 변수 + 리셋 + Streamlit 크롬 제거
② PRIMITIVES  badge() · pill() · stat() · empty() · skeleton() · toast()
③ LAYOUT   shell_css() · render_sidebar() · page_header() · breadcrumb() · data_table()
④ DOMAIN   state_badge() · technique_bars() · gate() · failure() · stage_tracker()
⑤ PAGES    landing / overview / scans / new_scan / progress / result / finding / detection / settings
⑥ MAIN     라우팅
```

| 컴포넌트 | 상태 | 비고 |
|---|---|---|
| `page_header` · `render_sidebar` · `shell_css` | 있음 | 유지 |
| `render_failure` · `render_server_down` | 있음 | **문구·5코드 분기 그대로**, 스타일만 |
| `render_gate` | 있음 | 유지 |
| `render_empty` | 있음 | 화면별 문구·CTA 로 확장 |
| `state_badge` · `FINDING_META` | 있음 | severity 단일 출처 |
| `_technique_bars` | 있음 | Threat Distribution 으로 재사용 |
| **`data_table`** | 신규 | 열 정의·정렬·행 액션·hover·빈 상태를 한 함수로 (Scans·Findings·Overview 공용) |
| **`stat_bar`** | 신규 | 요약 지표 줄 (Overview·Result 공용) |
| **`stage_tracker`** | 신규 | 스캔 진행 단계 (§7-a) |
| **`skeleton`** | 신규 | 폴링·목록 로딩 |
| **`toast`** | 신규 | `st.toast` 래퍼 — 삭제·저장·복사·귀속 성공 |
| **`breadcrumb`** | 신규 | Scans / run / finding |
| **`trend_chart`** | 신규 | 내 진단들의 ASR 추이(실제 데이터). 없으면 안 그린다 |

## 7. 필요한 API 변경 — **2건뿐**

**(a) 스캔 진행 단계** `GET /api/runs/{id}` (status=running)
```json
"progress": { "stage": "attack_r1", "stage_index": 2, "stage_total": 6,
              "done_calls": 21, "total_calls": 114,
              "stages": ["recon","attack_r1","judge_r1","patch","attack_r2","report"] }
```
- 근거: `pipeline.py` 가 이미 `step_recon → step_attack_r1 → step_patch → step_attack_r2 → step_report` 로 나뉘어 있고,
  `nodes/attack.run_attacks` 는 공격을 하나씩 돌린다. **콜백 하나만 끼우면 전부 실측값**이다.
- 구현: `run_pipeline(..., on_progress=cb)` → `Job.progress` 갱신 → `running_payload` 에 실어 보냄. 화면은 `stage_tracker`.
- 이걸 안 하면 3~4분 동안 사용자가 보는 정보는 경과시간뿐이고, 요청서 §9(Scan Experience)는 **지어내지 않고는 불가능**하다.

**(b) 목록에 미해결 건수** `GET /api/runs` 각 행에 `unresolved`(과 `findings_total`)
- 근거: Overview·Scans 목록의 유일하게 의미 있는 신호가 "이 진단에 아직 몇 건이 남아 있나" 다.
  `tb_attempt` 를 `GROUP BY run_id, attack_id` 로 접으면 SQL 한 번으로 나온다(N+1 없음).
- 이걸 안 하면 목록은 등급·ASR만 나열하는 표가 되고, 사이드바 `Scans(N)` 배지도 못 만든다.

그 외 **API 변경 없음.** Asset·Score·Severity·Threat category 엔드포인트는 만들지 않는다.

## 8. 재사용할 것 (그대로 둔다)

`render_failure`/`render_server_down`(5코드 분기·문구 고정) · `render_gate` · `render_empty` ·
`state_badge`/`FINDING_META`/`CHANNEL_KO`/`GOAL_KO` · `_technique_bars` · `build_findings` ·
`page_header`/`shell_css`/`render_sidebar` · `login_dialog`/`signup_dialog`(문구 고정) ·
`api_get/post/delete`/`_auth_headers`/`err_msg` · `esc()` 규칙 · `load_metrics()` 단일 출처.

## 9. 새로 만들 것

`data_table` · `stat_bar` · `stage_tracker` · `skeleton` · `toast` · `breadcrumb` · `trend_chart` ·
Scans 페이지(구 이력 재작성) · Overview 재구성 · 반응형 규칙(사이드바 접힘·표 가로 스크롤·2열→1열).

## 10. 구현 순서 (UI 21h ≈ 3일 · 9/12 완료 목표)

| # | 작업 | 시간 | 왜 이 순서인가 |
|---|---|---|---|
| V1 | 토큰 정리 + primitives(badge·stat·skeleton·toast·empty) | 3h | 이걸 먼저 안 하면 이후 화면마다 색·간격을 또 손댄다 |
| V2 | `data_table` 공통화 + 반응형 규칙 | 2.5h | 표가 3화면에 쓰이므로 컴포넌트가 먼저 |
| V3 | Scans 페이지(이력 재작성, dataframe 제거) | 2h | 표 컴포넌트의 첫 적용처 |
| V4 | Overview 재구성(미해결 합계·최근 스캔·추이) | 2.5h | (b) 승인 시 지표가 살아난다 |
| V5 | 백엔드 progress + `stage_tracker` | 3h | (a) 승인 시. 시연의 핵심 구간 |
| V6 | Result·Finding Detail 마감(토큰 적용·breadcrumb·toast) | 2.5h | 이미 구조는 섰다 |
| V7 | Detection·Settings 통일 | 2h | 남은 구 화면 제거 |
| V8 | Landing 톤 정리(마케팅 문구 절제·실측 근거 접이식) | 1.5h | 앱과 톤 분리 마감 |
| V9 | 반응형·시각 검증(Playwright 1440/1024/768) + 전체 테스트 | 2h | 코드만 보고 끝내지 않는다 |
