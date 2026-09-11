// 진단 목록 표 — 대시보드와 진단 목록 화면이 같은 표를 쓴다(열 정의가 두 벌이 되면 곧 어긋난다).
import { Link } from "react-router-dom";
import type { RunRow } from "../api/types";
import { actionRequired, isMock } from "../lib/format";
import { sev } from "../lib/meta";
import { BeforeAfter } from "./BeforeAfter";

export function RunTable({ runs, label }: { runs: RunRow[]; label: string }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl" aria-label={label}>
        <thead>
          <tr><th>상태</th><th>진단 식별자</th><th>등급</th><th>보강 전 → 후</th><th>진단 대상 모델</th><th /></tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const n = actionRequired(r);
            return (
              <tr key={r.run_id}>
                <td>{r.status === "running" ? <span className="pill">진행 중</span> : r.status === "error" ? <span className="pill">실패</span> : r.inconclusive ? <span className="pill">진단 불가</span> : n ? (
                  <span className="badge" style={{ color: sev("unresolved") }}>
                    <i style={{ background: sev("unresolved") }} />조치 필요 {n}
                  </span>
                ) : <span className="cell-sub">—</span>}</td>
                <td><span className="mono rid">{r.run_id}</span><div className="cell-sub">{r.created_at ? new Date(r.created_at).toLocaleString("ko-KR") : ""}</div></td>
                <td><b>{r.grade ?? "-"}</b></td>
                <td><BeforeAfter before={r.asr_before} after={r.asr_after} comparable={r.comparable} /></td>
                <td><span className="cell-sub">{r.target_model ?? "-"}</span>
                  {isMock(r) ? <span className="tag-mock">mock(가짜)</span> : null}</td>
                <td className="act"><Link to={`/runs/${encodeURIComponent(r.run_id)}`}>열기 →</Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
