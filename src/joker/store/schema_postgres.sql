-- Chat Shield — PostgreSQL 이행 스키마 (계약 v0.4 · 2026-09-09)
--
-- 이 파일의 목적: "SQLite 를 왜 썼냐" 에 대한 답이 '못 옮겨서' 가 아님을 코드로 남긴다.
-- 현재 운영 스키마의 정본은 src/joker/store/schema.sql(SQLite) 이고, 이 파일은 이행 경로다.
-- 전환 조건과 남은 애플리케이션 작업은 docs/adr_001_storage.md 를 봐라.
--
-- ★ 검증: PostgreSQL 16 에 실제로 실행해 통과시킨 DDL 이다(문법만 맞춰 놓은 문서가 아니다).
--
-- SQLite → PostgreSQL 매핑에서 '그냥 바꾼' 게 아니라 타입을 제대로 고른 곳:
--   INTEGER(0/1)      → BOOLEAN      : 0/1 관례 대신 타입으로 강제한다.
--   TEXT(ISO8601)     → TIMESTAMPTZ  : 문자열 비교로 정렬하던 걸 시간 타입으로.
--   TEXT(JSON 배열)   → JSONB        : hit_assets 를 질의 대상으로 만들 수 있다.
--   INTEGER AUTOINCREMENT → GENERATED ALWAYS AS IDENTITY (SQL 표준)
-- 이 4가지는 애플리케이션 쪽 변환도 같이 필요하다(ADR 에 목록).

-- ────────────────────────────────────────────────────────────
-- 진단 1회 = 시스템 프롬프트 1건에 대한 진단→처방→재진단 전체
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_diagnosis (
    run_id              TEXT PRIMARY KEY,
    created_at          TIMESTAMPTZ NOT NULL,
    -- 실행 환경 (재현 맥락)
    env_profile         TEXT,
    backend             TEXT,
    model_victim        TEXT,
    -- 무엇을 진단했는가 (계약 v0.2)
    target_preset       TEXT,
    fidelity            TEXT,                        -- proxy_model | real_model  ★ 정본
    is_approximation    BOOLEAN,                     -- 레거시(fidelity 에서 파생)
    -- 대상 지시문
    target_prompt       TEXT NOT NULL,
    target_prompt_hash  TEXT NOT NULL,
    -- RECON 요약
    persona             TEXT,
    org                 TEXT,
    -- 결과 요약
    inconclusive        BOOLEAN NOT NULL DEFAULT FALSE,  -- true 면 값 자산 0개 → grade NULL
    grade               TEXT,
    comparable          BOOLEAN,                     -- R1/R2 attack_id 집합 동일
    asr_before          DOUBLE PRECISION,
    asr_after           DOUBLE PRECISION,
    asr_delta           DOUBLE PRECISION,
    patched_prompt      TEXT,
    -- 소유자 (계약 v0.4). NULL = 비회원 진단
    user_id             TEXT
);

CREATE INDEX IF NOT EXISTS ix_diagnosis_hash  ON tb_diagnosis(target_prompt_hash);
CREATE INDEX IF NOT EXISTS ix_diagnosis_owner ON tb_diagnosis(user_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- 공격 1회 시도 ★ 핵심 테이블
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_attempt (
    attempt_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id              TEXT NOT NULL REFERENCES tb_diagnosis(run_id) ON DELETE CASCADE,
    round_no            SMALLINT NOT NULL,           -- 1=처방전 2=처방후
    attack_id           TEXT NOT NULL,
    technique           TEXT NOT NULL,
    goal                TEXT NOT NULL,
    rendered_text       TEXT NOT NULL,
    response_raw        TEXT,
    -- 판정
    verdict             TEXT,                        -- leak|block
    verdict_by          TEXT,                        -- rule|llm
    leak_channel        TEXT,                        -- plain|reversed|base64|semantic
    was_gray            BOOLEAN NOT NULL DEFAULT FALSE,
    hit_assets          JSONB,                       -- SQLite 에서는 JSON 문자열이었다
    -- 재현 맥락 (없으면 재현 불가)
    victim_model        TEXT,
    temperature         DOUBLE PRECISION,
    seed                INTEGER,
    latency_ms          INTEGER,
    -- ── 레거시 실증 데이터 전용 (신규 진단 시 NULL) ──
    defense_level       SMALLINT,
    verdict_gold        TEXT,
    verdict_raw         TEXT,
    blocked_by_filter   BOOLEAN
);

CREATE INDEX IF NOT EXISTS ix_attempt_run   ON tb_attempt(run_id);
CREATE INDEX IF NOT EXISTS ix_attempt_round ON tb_attempt(run_id, round_no);
CREATE INDEX IF NOT EXISTS ix_attempt_tech  ON tb_attempt(technique);

-- ────────────────────────────────────────────────────────────
-- RECON 이 뽑은 보호 자산 (진단별)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_asset (
    asset_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id              TEXT NOT NULL REFERENCES tb_diagnosis(run_id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    -- 주의: value(비밀값 원문)는 저장하지 않는다(NFR-DV-002). 이름·종류만 남긴다.
    kind                TEXT NOT NULL,
    confidence          DOUBLE PRECISION DEFAULT 1.0,
    source              TEXT
);

CREATE INDEX IF NOT EXISTS ix_asset_run ON tb_asset(run_id);

-- ────────────────────────────────────────────────────────────
-- 처방에 적용된 방어 패턴 (진단별)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_applied_pattern (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id              TEXT NOT NULL REFERENCES tb_diagnosis(run_id) ON DELETE CASCADE,
    pattern_id          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_applied_run ON tb_applied_pattern(run_id);

-- ────────────────────────────────────────────────────────────
-- 독립 정답 라벨 (F1 의 gold). tb_attempt 와 일부러 분리한 테이블
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_gold (
    attack_id       TEXT NOT NULL,
    defense_level   SMALLINT NOT NULL,
    verdict_llm     TEXT,
    judge_model     TEXT,
    judge_reason    TEXT,
    judged_at       TIMESTAMPTZ,
    verdict_human   TEXT,
    adjudicated_by  TEXT,
    adjudicated_at  TIMESTAMPTZ,
    verdict_final   TEXT NOT NULL,
    PRIMARY KEY (attack_id, defense_level)
);

-- ────────────────────────────────────────────────────────────
-- 회원 (계약 v0.4)
-- ★ 이름·휴대폰번호·생년월일 열을 만들지 않는다(개인정보보호법 §16 최소수집).
--   열이 없어야 나중에 "일단 받아두자" 가 물리적으로 불가능해진다.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tb_user (
    user_id             TEXT PRIMARY KEY,
    email               TEXT NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,               -- scrypt$N$r$p$salt_b64$dk_b64
    created_at          TIMESTAMPTZ NOT NULL,
    status              TEXT NOT NULL DEFAULT 'active'
);

-- ★ 토큰 원문은 저장하지 않는다. sha256 해시만.
CREATE TABLE IF NOT EXISTS tb_session (
    token_hash          TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES tb_user(user_id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL,
    expires_at          TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_session_user ON tb_session(user_id);
CREATE INDEX IF NOT EXISTS ix_session_exp  ON tb_session(expires_at);

-- ★ 이메일 원문이 아니라 sha256 지문만. 실패 로그가 곧 '가입자 명단' 이 되면 안 된다.
CREATE TABLE IF NOT EXISTS tb_login_try (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email_hash          TEXT NOT NULL,
    at                  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_login_try ON tb_login_try(email_hash, at);
