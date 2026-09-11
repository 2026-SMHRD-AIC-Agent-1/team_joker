// 진행 화면. ★ 퍼센트를 만들지 않는다 — 서버가 센 값(단계 · 이번 묶음 n/m · 누적 호출)만 보여 준다.
// 적응형 샘플링이라 총 공격 수는 실행 중에 확정되므로, 추정 퍼센트는 반드시 뒤로 가거나 멈춘다.
import { useEffect, useState } from "react";
import type { Progress as P } from "../../api/types";
import { Skeleton } from "../States";

// 서버가 주는 stage key 에 1:1 로 대응시킨다 — 화면이 단계를 지어내면 실제 파이프라인과 갈린다.
export const STAGE_KO: Record<string, string> = {
  recon: "지시문 분석", attack_r1: "공격 진단", patch: "방어 문구 생성", attack_r2: "재진단", report: "결과 정리",
};

export interface StageRow { key: string; label: string; state: "done" | "cur" | "todo"; detail: string }

export function stageRows(p: P): StageRow[] {
  const idx = p.stage_index ?? 0;
  return (p.stages ?? []).map((s, i) => {
    const state = i < idx ? "done" : i === idx ? "cur" : "todo";
    // ★ 배치 번호만 쓰면 18/18 → 6/39 처럼 '뒤로 가는' 것처럼 보인다. 누적 실행 수를 앞에 둔다.
    const detail = state === "cur" && p.stage_total
      ? `공격 ${p.calls_done ?? 0}건 실행 · 이번 묶음 ${p.stage_done ?? 0}/${p.stage_total}`
      : state === "cur" ? "진행 중" : state === "done" ? "완료" : "대기";
    return { key: s.key, label: STAGE_KO[s.key] ?? s.label, state, detail };
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
  return (
    <div className="prog">
      <div>
        <div className="ml">경과 시간</div>
        {/* 다른 탭에서 시작한 진단이면 시작 시각을 모른다 — 0:00 부터 세지 않고 모른다고 둔다. */}
        <div className="elapsed num">{elapsed === null ? "—" : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`}</div>
        <div className="cell-sub">{mode === "full" ? "정밀 · 예상 3~4분" : mode === "screening" ? "스크리닝 · 예상 약 90초" : "모델과 대기 상황에 따라 다릅니다"}</div>
      </div>
      <div>
        {progress.queued ? (
          <>
            {/* ★ 대기 중을 '지시문 분석 중' 으로 그리면 멈춘 화면이 된다. 사실을 그대로 말한다. */}
            <div className="notice">앞선 진단이 끝나면 시작합니다. 로컬 모델은 메모리 때문에 한 번에 한 건씩 진단합니다.</div>
            <Skeleton rows={5} height={38} />
          </>
        ) : (
          <>
            <div className="stg" data-testid="stages">
              {rows.map((r, i) => (
                <div className={`row ${r.state}`} key={r.key}>
                  <span className="mk">{r.state === "done" ? "✓" : i + 1}</span><span>{r.label}</span><span className="d">{r.detail}</span>
                </div>
              ))}
            </div>
            <p className="fine">대상 모델 호출 {progress.calls_done ?? 0}회{estimatedCalls ? ` · 이 진단의 상한 ${estimatedCalls}회` : ""} ·
              진행률(%)은 표시하지 않습니다 — 적응형 샘플링이라 총 공격 수가 실행 중에 확정됩니다.</p>
          </>
        )}
      </div>
    </div>
  );
}
