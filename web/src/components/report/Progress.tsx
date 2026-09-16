// 진행 화면. ★ 퍼센트를 만들지 않는다 — 서버가 센 값(단계 · 이번 묶음 n/m · 누적 호출)만 보여 준다.
// 적응형 샘플링이라 총 공격 수는 실행 중에 확정되므로, 추정 퍼센트는 반드시 뒤로 가거나 멈춘다.
import { useEffect, useState } from "react";
import type { Progress as P } from "../../api/types";
import { Skeleton } from "../States";

// 서버가 주는 stage key 에 1:1 로 대응시킨다 — 화면이 단계를 지어내면 실제 파이프라인과 갈린다.
export const STAGE_KO: Record<string, string> = {
  detector: "JOKER-KO 추가 검사",
  recon: "지시문 분석", attack_r1: "공격 검사", patch: "방어 문구 생성", attack_r2: "재검사", report: "결과 정리",
};

const STAGE_HINT: Record<string, string> = {
  detector: "지시문 보강 후에도 남은 유출 공격을 JOKER-KO로 검사하고 있어요.",
  recon: "지시문에서 보호할 정보와 보안 규칙을 살펴보고 있어요.",
  attack_r1: "다양한 공격으로 보안 규칙이 잘 지켜지는지 확인하고 있어요.",
  patch: "발견된 취약점을 바탕으로 방어 문구를 만들고 있어요.",
  attack_r2: "보강한 지시문에 같은 공격을 보내 개선 여부를 확인하고 있어요.",
  report: "진단 결과와 보강 내용을 정리하고 있어요.",
};

const JUDGE_HINT = "모델 응답에 보호할 정보가 드러났는지 한 건씩 판정하고 있어요. 애매한 응답은 판정 모델이 다시 확인해 시간이 걸릴 수 있어요.";

export interface StageRow { key: string; label: string; state: "done" | "cur" | "todo" | "skip"; detail: string }

// JOKER-KO 사후 검사가 지나간 뒤 그 줄에 무엇이라고 쓸지. ★ 서버가 준 결말(detector_status)만 옮긴다.
//   검사를 돌리지 않았는데 '완료' 로 그리면, 결과 화면의 '미검사' 와 진행 화면이 서로 다른 말을 한다.
const DETECTOR_END: Record<string, { state: StageRow["state"]; detail: string }> = {
  completed: { state: "done", detail: "완료" },
  no_targets: { state: "skip", detail: "건너뜀 · 남은 유출 없음" },
  unavailable: { state: "skip", detail: "건너뜀 · 탐지 모델 없음" },
  failed: { state: "skip", detail: "완료하지 못함 · 규칙 결과만" },
};

function currentDetail(p: P, key: string): string {
  // 공격을 다 던진 뒤 판정하는 구간. 이게 없으면 '57/57' 에 멈춘 화면처럼 보인다.
  if (p.phase === "judge") return p.stage_total ? `응답 ${p.stage_total}건 판정 중` : "응답 판정 중";
  if (key === "detector") return p.stage_total ? `남은 유출 ${p.stage_total}건 검사 중` : "검사 중";
  // ★ 배치 번호만 쓰면 18/18 → 6/39 처럼 '뒤로 가는' 것처럼 보인다. 누적 실행 수를 앞에 둔다.
  if (p.stage_total) return `공격 ${p.calls_done ?? 0}건 실행 · 이번 묶음 ${p.stage_done ?? 0}/${p.stage_total}`;
  return "진행 중";
}

export function stageRows(p: P): StageRow[] {
  const idx = p.stage_index ?? 0;
  return (p.stages ?? []).map((s, i) => {
    const label = STAGE_KO[s.key] ?? s.label;
    if (i === idx) return { key: s.key, label, state: "cur", detail: currentDetail(p, s.key) };
    if (i > idx) return { key: s.key, label, state: "todo", detail: "대기" };
    const end = s.key === "detector" && p.detector_status ? DETECTOR_END[p.detector_status] : undefined;
    return { key: s.key, label, state: end?.state ?? "done", detail: end?.detail ?? "완료" };
  });
}

function useElapsed(since: number | null): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return since === null ? null : Math.max(0, Math.floor((now - since) / 1000));
}

export function ProgressView({ progress, estimatedCalls, startedAt, mode }: {
  progress: P; estimatedCalls?: number; startedAt: number | null; mode: "screening" | "full" | null;
}) {
  const elapsed = useElapsed(startedAt);
  const rows = stageRows(progress);
  const current = rows.find(row => row.state === "cur");
  const judging = progress.phase === "judge" && current?.key !== "detector";
  return (
    <div className="prog">
      <div className="prog-clock">
        <div className={`prog-orbit${progress.queued ? " is-queued" : ""}`} aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none"><path d="M24 5 39 11v12c0 9-6 15-15 20C15 38 9 32 9 23V11L24 5Z" fill="currentColor" opacity=".12"/><path d="M24 5 39 11v12c0 9-6 15-15 20C15 38 9 32 9 23V11L24 5Z" stroke="currentColor" strokeWidth="2"/><path d="m17 24 5 5 10-11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div className="ml">경과 시간</div>
        {/* 다른 탭에서 시작한 진단이면 시작 시각을 모른다 — 0:00 부터 세지 않고 모른다고 둔다. */}
        <div className="elapsed num" role="timer" aria-label="진단 경과 시간">{elapsed === null ? "—" : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`}</div>
        <div className="cell-sub">{mode === "full" ? "전체 검사" : mode === "screening" ? "빠른 검사" : "진단 진행 중"}</div>
        {progress.queued ? <p className="fine">대기 시간을 포함합니다</p> : null}
      </div>
      <div className="prog-body">
        <div className="prog-activity" role="status" aria-live="polite" aria-atomic="true">
          <div className="prog-activity-title"><span className="prog-dots" aria-hidden="true"><i /><i /><i /></span>
            <strong>{progress.queued ? "진단 순서를 기다리고 있어요"
              : current?.key === "detector" ? "JOKER-KO로 추가 탐지 여부를 확인하고 있어요"
              : current && judging ? `${current.label} 응답을 판정하고 있어요`
              : current ? `${current.label} 중이에요` : "진단을 준비하고 있어요"}</strong>
          </div>
          <p>{progress.queued ? "순서가 되면 자동으로 시작됩니다."
            : judging ? JUDGE_HINT
            : STAGE_HINT[current?.key ?? ""] ?? "진단 상태를 확인하고 있어요. 잠시만 기다려 주세요."}</p>
        </div>
        {progress.queued ? (
          <>
            {/* ★ 대기 중을 '지시문 분석 중' 으로 그리면 멈춘 화면이 된다. 사실을 그대로 말한다. */}
            <div className="notice">앞선 진단이 끝나면 자동으로 시작합니다.</div>
            <Skeleton rows={6} height={38} />
          </>
        ) : (
          <>
            <div className="stg" data-testid="stages">
              {rows.map((r, i) => (
                <div className={`row ${r.state}`} key={r.key} aria-current={r.state === "cur" ? "step" : undefined}>
                  <span className="mk" aria-hidden={r.state === "skip" ? true : undefined}>{r.state === "done" ? "✓" : r.state === "skip" ? "–" : i + 1}</span><span>{r.label}</span><span className="d">{r.state === "cur" ? <span className="prog-spinner" aria-hidden="true" /> : null}{r.detail}</span>
                </div>
              ))}
            </div>
            <p className="fine">대상 모델 호출 {progress.calls_done ?? 0}회{estimatedCalls ? ` · 이 진단의 상한 ${estimatedCalls}회` : ""} ·
              검사할 공격 수는 검사 중 달라질 수 있습니다.</p>
          </>
        )}
      </div>
    </div>
  );
}
