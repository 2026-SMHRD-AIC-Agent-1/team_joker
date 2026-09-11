-- 「뚫어보기」 SQLite 스키마 — 9/2 제출 '테이블 명세서'의 원본.
-- 이 파일 하나가 명세서의 진실이다. 문서(docs/db_tables.md)는 여기서 생성한다.
--
-- 설계 핵심:
--  1) round_no 하나로 Before(1)/After(2)를 한 테이블에 담는다 (테이블 분리 불필요).
--  2) 레거시 전용 4열(defense_level/verdict_gold/verdict_raw/blocked_by_filter)은
--     125건 PoC 실측을 담기 위한 것. 신규 진단 행에서는 항상 NULL.
--  3) victim_model/temperature/seed 3개가 없으면 결과를 재현할 수 없다 → 필수 저장.
--  4) 이미 만들어진 DB 는 CREATE TABLE IF NOT EXISTS 로 갱신되지 않는다.
--     열을 추가할 때는 Repository._migrate() 에 ALTER TABLE 을 같이 넣어야 한다.
--     (2026-08-27 target_preset/is_approximation 추가 때 실제로 필요했다.)

PRAGMA foreign_keys = ON;

-- ────────────────────────────────────────────────────────────
-- 진단 1회 = 시스템 프롬프트 1건에 대한 진단→처방→재진단 전체
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_diagnosis (
    run_id              TEXT PRIMARY KEY,
    created_at          TEXT NOT NULL,               -- ISO8601
    -- 실행 환경 (재현 맥락)
    env_profile         TEXT,                        -- 예: macbook_m2_8gb
    backend             TEXT,                        -- mock | local | openai | full_local
    model_victim        TEXT,
    -- 무엇을 진단했는가 (계약 v0.2 · 2026-08-27). 등급만 저장하고 대상을 안 남기면
    -- "당신 챗봇 B등급" 이 실은 "대리 모델에 당신 지시문을 붙였을 때 B등급" 이라는 사실이 사라진다.
    -- 이력 화면은 이 두 열이 있어야 '대리 모델 진단' 칩을 그릴 수 있다.
    target_preset       TEXT,                        -- local_qwen3b | byok | ...
    fidelity            TEXT,                        -- proxy_model | real_model  ★ 이게 정본
    -- ↓ 레거시(2026-08-27 반나절만 쓰임). fidelity 에서 파생해 같이 쓴다 — 둘이 어긋날 수 없다.
    --   이름이 "근사냐 아니냐" 로 읽혀 BYOK 를 '실제 챗봇 진단' 으로 오독시켰다. 새 코드는 fidelity 를 봐라.
    is_approximation    INTEGER,
    -- 대상 지시문
    target_prompt       TEXT NOT NULL,
    privacy_version     INTEGER NOT NULL DEFAULT 0,
    target_prompt_hash  TEXT NOT NULL,               -- 중복 진단 캐시 키
    -- RECON 요약
    persona             TEXT,
    org                 TEXT,
    -- 결과 요약
    inconclusive        INTEGER NOT NULL DEFAULT 0,  -- 1이면 값 자산 0개(함정②) → grade NULL
    grade               TEXT,                        -- A~F, 진단 불가면 NULL
    comparable          INTEGER,                     -- R1/R2 attack_id 집합 동일(함정①)
    asr_before          REAL,
    asr_after           REAL,
    asr_delta           REAL,
    patched_prompt      TEXT
);

CREATE INDEX IF NOT EXISTS ix_diagnosis_hash ON tb_diagnosis(target_prompt_hash);

-- ────────────────────────────────────────────────────────────
-- 공격 1회 시도 ★ 핵심 테이블
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_attempt (
    attempt_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id              TEXT NOT NULL REFERENCES tb_diagnosis(run_id) ON DELETE CASCADE,
    round_no            INTEGER NOT NULL,            -- 1=처방전 2=처방후
    attack_id           TEXT NOT NULL,
    technique           TEXT NOT NULL,               -- ROLE|AUTH|INDIRECT|OBFUSC|FORMAT|INDIRECT_DOC
    goal                TEXT NOT NULL,               -- INFO_LEAK|POLICY_BREAK|PERSONA_BREAK
    rendered_text       TEXT NOT NULL,
    response_raw        TEXT,
    -- 판정
    verdict             TEXT,                        -- leak|block  (우리 판정기 출력)
    verdict_reason      TEXT,
    verdict_by          TEXT,                        -- rule|llm    (규칙이 몇 % 처리했는가의 근거)
    leak_channel        TEXT,                        -- plain|reversed|base64|semantic
    was_gray            INTEGER NOT NULL DEFAULT 0,
    hit_assets          TEXT,                        -- JSON 배열
    -- 재현 맥락 (없으면 재현 불가)
    victim_model        TEXT,
    temperature         REAL,
    seed                INTEGER,
    latency_ms          INTEGER,
    -- ── 레거시 실증 데이터 전용 (신규 진단 시 NULL) ──
    defense_level       INTEGER,                     -- PoC 허수아비 챗봇 방어 레벨 1~5
    verdict_gold        TEXT,                        -- 정답 라벨(사용자 전달 답변 기준) → F1 정답지
    verdict_raw         TEXT,                        -- 모델 원본 기준(출력필터 전)
    blocked_by_filter   INTEGER                      -- L5 출력필터가 잘랐는가
);

CREATE INDEX IF NOT EXISTS ix_attempt_run   ON tb_attempt(run_id);
CREATE INDEX IF NOT EXISTS ix_attempt_round ON tb_attempt(run_id, round_no);
CREATE INDEX IF NOT EXISTS ix_attempt_tech  ON tb_attempt(technique);

-- ────────────────────────────────────────────────────────────
-- RECON 이 뽑은 보호 자산 (진단별)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_asset (
    asset_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id              TEXT NOT NULL REFERENCES tb_diagnosis(run_id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    -- 주의: value(비밀값 원문)는 기본 저장하지 않는다(NFR-DV-002). 이름·종류만 남긴다.
    kind                TEXT NOT NULL,               -- secret_value|forbidden_action|persona|policy
    confidence          REAL DEFAULT 1.0,
    source              TEXT
);

CREATE INDEX IF NOT EXISTS ix_asset_run ON tb_asset(run_id);

-- ────────────────────────────────────────────────────────────
-- 처방에 적용된 방어 패턴 (진단별)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_applied_pattern (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id              TEXT NOT NULL REFERENCES tb_diagnosis(run_id) ON DELETE CASCADE,
    pattern_id          TEXT NOT NULL                -- P01..P08
);

CREATE INDEX IF NOT EXISTS ix_applied_run ON tb_applied_pattern(run_id);

-- ────────────────────────────────────────────────────────────
-- 독립 정답 라벨 (F1 의 gold). ★ tb_attempt 와 일부러 분리한 테이블
-- ────────────────────────────────────────────────────────────
-- 왜 분리했나:
--   정답 라벨은 '한 번 만들면 계속 쓰는 데이터셋 자산'이고,
--   tb_attempt 는 'import-poc 를 다시 돌리면 통째로 갈아끼워지는 실행 기록'이다(DELETE→INSERT).
--   같이 뒀다면 재적재 한 번에 유료 API 로 만든 라벨이 사라진다.
-- 키가 (attack_id, defense_level) 인 이유: PoC 125행 = 공격 25개 × 방어레벨 5단계.
--   attack_id 만으로는 5행이 겹친다.
CREATE TABLE IF NOT EXISTS tb_gold (
    attack_id       TEXT NOT NULL,
    defense_level   INTEGER NOT NULL,
    -- ① 독립 LLM 심판 (우리 규칙을 전혀 모름, 비밀값 원문도 못 봄)
    verdict_llm     TEXT,                 -- leak|block
    judge_model     TEXT,                 -- 어느 모델이 판정했나 (재현 맥락)
    judge_reason    TEXT,                 -- 심판이 적은 근거 한 줄 (사람 재정 때 읽는다)
    judged_at       TEXT,
    -- ② 사람 재정 (규칙 vs 심판이 갈린 건만)
    verdict_human   TEXT,                 -- leak|block, 미재정이면 NULL
    adjudicated_by  TEXT,
    adjudicated_at  TEXT,
    -- ③ 최종 정답 = 사람 재정이 있으면 그것, 없으면 심판 판정
    verdict_final   TEXT NOT NULL,
    PRIMARY KEY (attack_id, defense_level)
);

-- ────────────────────────────────────────────────────────────
-- 회원 (계약 v0.4 · 2026-09-08)
-- ────────────────────────────────────────────────────────────
-- ★ 이름·휴대폰번호·생년월일 열을 '만들지 않는다'.
--   화면설계서 초안(0831)은 이 셋을 받았는데, 보안 진단 서비스가 그 정보를 왜 받는지
--   설명할 수 없다(개인정보보호법 §16 최소수집). 열이 없어야 나중에 "일단 받아두자"가
--   물리적으로 불가능해진다 — 정책을 문서가 아니라 스키마로 강제한다.
CREATE TABLE IF NOT EXISTS tb_user (
    user_id             TEXT PRIMARY KEY,            -- uuid4 hex
    email               TEXT NOT NULL UNIQUE,        -- 소문자 정규화해서 저장
    password_hash       TEXT NOT NULL,               -- scrypt$N$r$p$salt_b64$dk_b64
    created_at          TEXT NOT NULL,               -- ISO8601
    status              TEXT NOT NULL DEFAULT 'active'  -- active | disabled
);

-- ────────────────────────────────────────────────────────────
-- 세션 (로그인 토큰)
-- ────────────────────────────────────────────────────────────
-- ★ 토큰 '원문'은 저장하지 않는다. sha256 해시만 넣는다.
--   joker.db 는 파일 하나라 실수로 커밋·유출될 수 있는데, 원문을 넣어두면 그 파일 하나로
--   모든 회원 계정에 로그인할 수 있게 된다. 비밀번호를 해시하는 이유와 정확히 같다.
CREATE TABLE IF NOT EXISTS tb_session (
    token_hash          TEXT PRIMARY KEY,            -- sha256(hex) of token
    user_id             TEXT NOT NULL REFERENCES tb_user(user_id) ON DELETE CASCADE,
    created_at          TEXT NOT NULL,
    expires_at          TEXT NOT NULL                -- 발급 + 7일
);

CREATE INDEX IF NOT EXISTS ix_session_user ON tb_session(user_id);
CREATE INDEX IF NOT EXISTS ix_session_exp  ON tb_session(expires_at);

-- ────────────────────────────────────────────────────────────
-- 로그인 실패 기록 (이메일당 rate limit)
-- ────────────────────────────────────────────────────────────
-- ★ 이메일 원문이 아니라 sha256 지문만 남긴다. 실패 로그가 곧 '가입자 이메일 명단'이 되면 안 된다.
CREATE TABLE IF NOT EXISTS tb_login_try (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    email_hash          TEXT NOT NULL,
    at                  TEXT NOT NULL                -- ISO8601 (초 정밀도, 문자열 비교로 정렬됨)
);

CREATE INDEX IF NOT EXISTS ix_login_try ON tb_login_try(email_hash, at);

-- ────────────────────────────────────────────────────────────
-- 비회원 방문자 (무료 진단 1회 정책의 기준)  ★ 계약 v0.6
-- ────────────────────────────────────────────────────────────
-- 왜 테이블이 필요한가: '회원가입 없이 무료 진단 1회' 를 브라우저 상태값(session_state·
-- localStorage)만으로 세면 새로고침 한 번, 시크릿 창 한 번에 무한이 된다. 즉 서버가 세야 한다.
--
-- ★ 무엇을 저장하고 무엇을 저장하지 않는가 (우리가 보안 진단 도구라서 더 엄격하게 잡는다):
--   저장 O — guest_id(서버가 만든 난수), ip_hash(sha256(salt+IP) 앞 32자), 시각.
--   저장 X — IP 원문 · User-Agent · 화면 크기 · 폰트 · canvas 등 지문(fingerprint) 요소 일체.
--   ip_hash 는 되돌릴 수 없고, salt 는 서버 기동 시 환경변수(JOKER_GUEST_SALT)에서 온다.
--
-- ★ 이 방식의 한계는 화면과 보고서에 그대로 쓴다: 신원 확인이 없으므로 '사람당 1회' 가 아니라
--   '(게스트 토큰) 또는 (IP 해시)' 단위 1회다. 다른 회선 + 새 브라우저면 1회가 더 생긴다.
CREATE TABLE IF NOT EXISTS tb_guest (
    guest_id            TEXT PRIMARY KEY,            -- 서버가 발급한 난수(URL-safe)
    ip_hash             TEXT,                        -- sha256(salt + IP)[:32]. 원문 IP 는 저장 안 함
    created_at          TEXT NOT NULL,
    last_seen_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_guest_ip ON tb_guest(ip_hash);
