// '이 도구의 검증 근거' — 카드 3개 + 전체 대화상자.
// ★ 지금 이 계정의 진단 수치가 아니다. 카드 위에서 그렇게 말한다(두 벌로 읽히지 않게).
// ★ 수치·조건·출처는 전부 headline_metrics.json. 없는 key 의 칸은 그리지 않는다.
import { useState } from "react";
import { Dialog } from "./Dialog";
import { Section, SubSection } from "./Section";
import { evidenceCards, METRICS, orderedMetrics } from "../evidence/metrics";
import type { Metrics } from "../evidence/metrics";

export function EvidenceDialog({ open, onClose, metrics = METRICS }: { open: boolean; onClose: () => void; metrics?: Metrics }) {
  return (
    <Dialog title="이 도구의 검증 근거" open={open} onClose={onClose} wide>
      {!metrics.metrics?.length ? <p className="fine">근거 파일을 찾을 수 없습니다.</p> : (
        <>
          <p className="fine" style={{ marginBottom: 12 }}>
            지금 여러분이 진단한 결과가 아니라, 별도 데이터로 우리가 측정한 이 도구의 검증 수치입니다. 조건과 함께 인용하세요.
          </p>
          {orderedMetrics(metrics).map((x) => (
            <div className="ev-row" key={x.key}>
              <div className="ev-row-h"><b>{x.label}</b><span className="ev-row-v num">{x.value}</span></div>
              <div className="ev-row-d">{x.detail}</div>
              <div className="ev-row-c"><span>측정 조건</span>{x.condition}</div>
              <div className="ev-row-c"><span>근거</span><code>{x.source}</code></div>
            </div>
          ))}
          <SubSection title="한계" />
          <ul className="report-meta" style={{ paddingLeft: 18 }}>
            {metrics.limitations.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <p className="fine">갱신 {metrics.updated} · 원본 <code>data/evidence/headline_metrics.json</code></p>
        </>
      )}
    </Dialog>
  );
}

export function ToolEvidence({ metrics = METRICS }: { metrics?: Metrics }) {
  const [open, setOpen] = useState(false);
  const cards = evidenceCards(metrics);
  if (!cards.length) return null;
  return (
    <section aria-label="이 도구의 검증 근거">
      <Section title="이 도구의 검증 근거"
        desc="지금 이 계정의 진단이 아니라, 별도 데이터로 우리가 측정한 값입니다. 측정 조건·출처·한계는 ‘근거 전체 보기’ 에 있습니다." />
      <div className="ev" style={{ marginTop: 8 }}>
        {cards.map((c) => (
          <div className="ev-card" key={c.title} data-testid="ev-card">
            <div className="ev-t">{c.title}</div>
            {c.rows.map((x) => (
              <div className="ev-m" key={x.key}>
                <div className="ev-l">{x.label}</div>
                <div className="ev-v num">{x.value}</div>
                <div className="ev-d">{x.detail}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <button className="btn" style={{ minWidth: 220 }} onClick={() => setOpen(true)}>근거 전체 보기</button>
      <EvidenceDialog open={open} onClose={() => setOpen(false)} metrics={metrics} />
    </section>
  );
}
