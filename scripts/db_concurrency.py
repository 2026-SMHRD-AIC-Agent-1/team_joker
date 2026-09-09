"""SQLite 동시성 실측 — 진단 워커가 쓰는 동안 화면 읽기가 얼마나 기다리는가.

왜 재는가 (2026-09-09 DB 멘토링 대응):
  "요즘은 PostgreSQL 을 써야 하지 않냐" 는 지적의 실질은 대부분 **동시성**이다.
  우리 구조가 실제로 어떤지 재보지 않고 "SQLite 로 충분합니다" 라고 말하면 그건 변명이다.
  재보고 숫자로 말하면 근거가 된다.

재현하는 워크로드:
  - 쓰기: save_run 과 같은 모양 — tb_diagnosis 1행 + tb_attempt 114행을 한 트랜잭션에.
  - 읽기: 화면 폴링과 같은 모양 — list_runs 질의를 짧은 간격으로 반복.
  두 저널 모드(delete = SQLite 기본값 / WAL)에서 각각 측정해 비교한다.

주의: 실제 서비스에서 쓰기는 진단 1회당 한 번(3~4분에 한 번)이다. 이 스크립트는 쓰기를
      연속으로 붙여 **경합을 일부러 최대로 만든** 조건이다. 실사용은 이보다 훨씬 여유롭다.

실행: python scripts/db_concurrency.py
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import statistics
import sys
import tempfile
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from joker.store.sqlite import Repository  # noqa: E402

ATTEMPTS_PER_RUN = 114   # 57 시드 × 2 회차 — 실제 정밀 진단 1회의 tb_attempt 행수
READ_INTERVAL = 0.005    # 5ms — 화면 폴링(3초)보다 훨씬 촘촘하게 때려 경합을 잡아낸다


def _writer(db: str, n_runs: int, stop: threading.Event, mode: str) -> None:
    con = sqlite3.connect(db, timeout=5.0)
    con.execute(f"PRAGMA journal_mode = {mode}")
    con.execute("PRAGMA synchronous = NORMAL")
    try:
        for i in range(n_runs):
            with con:  # 트랜잭션 1개 = 진단 1회 저장
                con.execute(
                    "INSERT INTO tb_diagnosis (run_id, created_at, backend, model_victim, grade,"
                    " inconclusive, asr_before, asr_after, target_prompt, target_prompt_hash)"
                    " VALUES (?,?,?,?,?,0,?,?,?,?)",
                    (f"run_bench_{i}", "2026-09-09T00:00:00", "local", "qwen2.5:3b-instruct",
                     "B", 0.593, 0.081, "지시문 " * 40, f"h{i}"))
                con.executemany(
                    "INSERT INTO tb_attempt (run_id, round_no, attack_id, technique, goal,"
                    " rendered_text, response_raw, verdict, verdict_by, victim_model,"
                    " temperature, seed) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    [(f"run_bench_{i}", 1 + (k % 2), f"ATK-{k:03d}", "FORMAT", "INFO_LEAK",
                      "공격 문구 " * 20, "응답 본문 " * 30, "leak" if k % 3 else "block",
                      "rule", "qwen2.5:3b-instruct", 0.0, 42) for k in range(ATTEMPTS_PER_RUN)])
    finally:
        con.close()
        stop.set()


def _reader(db: str, stop: threading.Event, out: dict, mode: str) -> None:
    con = sqlite3.connect(db, timeout=5.0)
    con.execute(f"PRAGMA journal_mode = {mode}")
    lat: list[float] = []
    busy = 0
    try:
        while not stop.is_set():
            t0 = time.perf_counter()
            try:
                con.execute(
                    "SELECT run_id, created_at, grade, asr_before, asr_after, backend, user_id"
                    " FROM tb_diagnosis ORDER BY created_at DESC LIMIT 30").fetchall()
            except sqlite3.OperationalError:
                busy += 1          # 'database is locked' — 대기 상한을 넘긴 경우
            lat.append((time.perf_counter() - t0) * 1000)
            time.sleep(READ_INTERVAL)
    finally:
        con.close()
    out["lat"], out["busy"] = lat, busy


def measure(mode: str, n_runs: int) -> dict:
    db = str(Path(tempfile.mkdtemp()) / "bench.db")
    Repository(db).init_schema()
    # init_schema 가 WAL 로 열었으므로, delete 모드 측정 때는 되돌린다(journal_mode 는 파일에 남는다).
    con = sqlite3.connect(db)
    con.execute(f"PRAGMA journal_mode = {mode}")
    actual = con.execute("PRAGMA journal_mode").fetchone()[0]
    con.close()

    stop, out = threading.Event(), {}
    r = threading.Thread(target=_reader, args=(db, stop, out, mode), daemon=True)
    w = threading.Thread(target=_writer, args=(db, n_runs, stop, mode))
    t0 = time.perf_counter()
    r.start(); w.start(); w.join(); r.join(timeout=2)
    elapsed = time.perf_counter() - t0

    lat = sorted(out.get("lat") or [0.0])
    return {
        "mode": actual, "elapsed_s": elapsed, "reads": len(lat), "busy": out.get("busy", 0),
        "mean_ms": statistics.mean(lat), "p95_ms": lat[int(len(lat) * 0.95) - 1],
        "max_ms": max(lat),
    }


def _env() -> str:
    """★ 측정 환경을 반드시 같이 찍는다.
    이 프로젝트는 진단 행마다 env_profile 을 저장한다 — 환경 없는 숫자는 근거가 아니라는 원칙이고,
    벤치마크도 예외가 아니다. 디스크가 빠른 맥과 느린 VM 은 같은 코드에서 수십 배 차이가 난다."""
    import platform
    return (f"{platform.system()} {platform.machine()} · Python {platform.python_version()} · "
            f"SQLite {sqlite3.sqlite_version} · {os.environ.get('JOKER_ENV_PROFILE', 'unknown')}")


def main() -> None:
    ap = argparse.ArgumentParser()
    # 기본값 400: 맥처럼 디스크가 빠르면 30회는 0.04초 만에 끝나 읽기 표본이 5개도 안 잡힌다.
    ap.add_argument("--runs", type=int, default=400, help="연속으로 저장할 진단 횟수")
    args = ap.parse_args()

    print(f"환경: {_env()}")
    print(f"쓰기: 진단 {args.runs}회 연속 저장 (1회 = tb_diagnosis 1행 + tb_attempt {ATTEMPTS_PER_RUN}행)")
    print(f"읽기: list_runs 질의를 {READ_INTERVAL*1000:.0f}ms 간격으로 반복\n")
    print(f"{'저널 모드':<12}{'쓰기 시간':>10}{'읽기 수':>9}{'평균':>9}{'p95':>9}{'최대':>10}{'잠금 오류':>10}")
    print("-" * 70)
    rows = []
    for mode in ("delete", "wal"):
        m = measure(mode, args.runs)
        rows.append(m)
        print(f"{m['mode']:<12}{m['elapsed_s']:>9.2f}s{m['reads']:>9}"
              f"{m['mean_ms']:>8.2f}ms{m['p95_ms']:>8.2f}ms{m['max_ms']:>9.2f}ms{m['busy']:>10}")
    print("-" * 70)
    thin = [r for r in rows if r["reads"] < 30]
    if thin:
        detail = ", ".join(f"{r['mode']} {r['reads']}회" for r in thin)
        print(f"\n⚠️  읽기 표본이 너무 적다({detail}). --runs 를 늘려 다시 재라 — "
              f"표본 5개로 p95 를 말하면 안 된다.")
    d, w = rows[0], rows[1]
    if d["max_ms"] > 0:
        print(f"\n최대 읽기 지연 {d['max_ms']:.2f}ms → {w['max_ms']:.2f}ms "
              f"({(1 - w['max_ms']/d['max_ms'])*100:.0f}% 감소)")
    print("※ 실제 서비스의 쓰기는 진단 1회당 1번(3~4분에 1번)이다. 위는 경합을 최대로 만든 조건이다.")


if __name__ == "__main__":
    main()
