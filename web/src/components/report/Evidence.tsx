// 01 · 발견한 문제 — 대표 항목 카드(최대 3개).
//
// ★ 비회원에게는 서버가 카드의 '껍데기' 만 보낸다(attack_id · state · title · technique_ko · locked).
//   locked 카드를 반드시 따로 그린다 — before/after 가 없다고 "이 라운드는 실행되지 않았습니다" 를 찍으면
//   실제로는 실행됐고 가린 것뿐인데 화면이 거짓말을 하게 된다. 가린 것은 가렸다고 말한다.
// ★ 0911 D: 판정 근거와 이 항목의 권고는 카드 안 접기로. 기본으로 보이는 것은 요청과 두 응답(=증거)이다.
import type { Attempt, Gated, Report } from "../../api/types";
import { ADVICE } from "../../lib/advice";
import { verdictLine } from "../../lib/findings";
import { FINDING_META } from "../../lib/meta";
import { Section } from "../Section";
import { Gate } from "./Gate";

export function VerdictBadge({ r }: { r: Attempt }) {
  const [color, text] = r.verdict === "leak" ? ["#B5364E", "유출"]
    : r.verdict === "block" ? ["#187B59", "차단"] : ["#956000", "판정 불가"];
  return <span className="badge" style={{ color }}><i style={{ background: color }} />{text}</span>;
}

/** verdict=false 면 판정 근거 줄을 빼고 그린다 — 대표 카드는 그 줄을 카드 아래 접기로 모은다. */
export function ResponseBlock({ r, label, verdict = true }: { r: Attempt | null | undefined; label: string; verdict?: boolean }) {
  if (!r) {
    return (
      <div>
        <div className="resp-h">{label}</div>
        <div className="resp" style={{ color: "#66758C" }}>이 라운드는 실행되지 않았습니다.</div>
      </div>
    );
  }
  const color = r.verdict === "leak" ? "#B5364E" : r.verdict === "block" ? "#187B59" : "#956000";
  const body = (r.evidence_excerpt || r.response_excerpt || "").trim() || "(응답 없음)";
  return (
    <div>
      <div className="resp-h">{label}<VerdictBadge r={r} /></div>
      <div className="resp" style={{ borderLeft: `3px solid ${color}` }}>{body}</div>
      {verdict ? <div className="resp-why">{verdictLine(r)}</div> : null}
    </div>
  );
}

export function EvidenceCards({ rep, gated, onSignup }: { rep: Report; gated: Gated; onSignup: () => void }) {
  const cards = rep.representative_findings ?? [];
  return (
    <section aria-label="발견한 문제">
      <Section title="01 · 발견한 문제"
        desc="대표 항목 최대 3개입니다. 요청과 응답을 먼저 보고, 판정 근거는 카드 안에서 펼치세요. 모든 시험은 아래 ‘전체 공격 기록 확인’ 에 있습니다." />
      {!cards.length ? (
        <p className="fine">대표 유출·판정 불가 항목이 없습니다. 아래 전체 시험 기록을 확인할 수 있습니다.</p>
      ) : cards.map((card, index) => {
        const locked = Boolean(card.locked);
        const advice = ADVICE[card.state];
        const pairs: [string, Attempt | null | undefined][] = [["보강 전", card.before], ["보강 후", card.after]];
        const rows = locked ? [] : pairs.filter((x): x is [string, Attempt] => Boolean(x[1]));
        return (
          // ★ 접힌 제목에 공격 ID 를 같이 넣는다 — 같은 기법이 여러 건 뽑히면 ID 만 서로 다르다.
          <details className="xp" key={card.attack_id} open={index === 0} data-testid="evidence-card">
            <summary>{FINDING_META[card.state].name} · {card.technique_ko} · {card.attack_id}</summary>
            <div className="xp-body">
              <div className="evidence-title">{card.title}</div>
              <div className="evidence-sub">{card.attack_id} · 실제 관측 결과</div>
              {locked ? (
                <>
                  {/* 공격 원문·응답 전문은 응답에 애초에 담기지 않는다. 자리와 이유만 남긴다. */}
                  <div className="evidence-label">공격자가 보낸 요청</div>
                  <div className="notice">🔒 실제 공격 문구는 무료 가입 후 확인할 수 있습니다.</div>
                  <div className="evidence-label">챗봇이 어떻게 답했나 (보강 전 · 보강 후)</div>
                  <div className="notice">🔒 두 응답 전문과 판정 근거는 무료 가입 후 확인할 수 있습니다.</div>
                </>
              ) : (
                <>
                  <div className="evidence-label">공격자가 보낸 요청</div>
                  <div className="evidence-request">{card.rendered_text || "기록 없음"}</div>
                  <div className="two-col">
                    <ResponseBlock r={card.before} label="보강 전" verdict={false} />
                    <ResponseBlock r={card.after} label="보강 후" verdict={false} />
                  </div>
                </>
              )}
              <details className="fold">
                <summary>{rows.length ? "판정 근거 · " : ""}이 항목의 권고 조치</summary>
                {rows.map(([lbl, r]) => <div className="fold-row" key={lbl}><span>{lbl}</span>{verdictLine(r)}</div>)}
                <div className="report-meta">{advice.body}</div>
              </details>
            </div>
          </details>
        );
      })}
      {/* ★ 잠금 안내는 이 섹션에 하나만 둔다. 카드마다 붙이면 같은 CTA 가 세 번 반복된다. */}
      {gated.is_gated && gated.representative_locked ? (
        <Gate title="대표 항목의 공격 문구와 응답 전문" total={`${gated.representative_locked}건`}
          hidden={`${gated.representative_locked}건`} unlock={gated.unlock} decoy="attempts" onSignup={onSignup} />
      ) : null}
    </section>
  );
}
