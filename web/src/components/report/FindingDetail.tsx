// 발견 항목 1건 — 별도 화면(상세는 별도 화면 원칙).
// 구성: 무엇을 던졌나 → 챗봇이 뭐라 했나(보강 전·후) → 분류·측정 조건 → 뭘 하면 되나.
import { Link, useNavigate } from "react-router-dom";
import type { Run } from "../../api/types";
import { ADVICE } from "../../lib/advice";
import type { DetectPrefill } from "../../lib/examples";
import { buildFindings, currentChannel, GOAL_KO, VERDICT_BY_KO } from "../../lib/findings";
import { FINDING_META } from "../../lib/meta";
import { SubSection } from "../Section";
import { EmptyState } from "../States";
import { ResponseBlock } from "./Evidence";
import { findingOrder, StateBadge } from "./Findings";

export function FindingDetail({ run, fid }: { run: Run; fid: string }) {
  const nav = useNavigate();
  const rep = run.report!;
  const findings = buildFindings(rep.attempts);
  const f = findings.find((x) => x.id === fid);
  const base = `/runs/${encodeURIComponent(run.run_id)}`;
  const back = () => nav(base, { state: { focus: "findings" } });
  if (!f) {
    // 비회원(attempts=[])이거나 없는 ID. 가려진 것을 '없음' 이라 하지 않는다 — 둘을 구분해 말한다.
    return (
      <EmptyState icon="🔎" title={rep.attempts.length ? "이 발견 항목을 찾을 수 없습니다" : "발견 항목 상세는 회원 리포트에서만 열립니다"}
        why={rep.attempts.length ? `이 진단에 ${fid} 항목이 없습니다. 목록에서 다시 골라 주세요.`
          : "공격 문구와 응답 전문은 비회원 응답에 담기지 않습니다. 무료 가입하면 방금 진단의 상세가 그대로 열립니다."}
        action={<Link className="btn" to={base}>← 리포트로 돌아가기</Link>} />
    );
  }
  const order = findingOrder(run.run_id, findings);
  const idx = Math.max(order.indexOf(f.id), 0);
  const go = (id: string) => nav(`${base}/f/${encodeURIComponent(id)}`);
  const t = run.target;
  const advice = ADVICE[f.state];
  const goal = f.goal ? (GOAL_KO[f.goal] ?? f.goal) : "-";
  const rows: [string, string][] = [
    ["상태", FINDING_META[f.state].name],
    ["공격 기법", f.techniqueKo],
    ["공격 목표", goal],
    ["유출 채널", currentChannel(f)],
    ["판정 근거", f.verdictBy ? (VERDICT_BY_KO[f.verdictBy] ?? "—") : "—"],
    ["진단 모델", t.model || "-"],
    ["재현 조건", `temp ${t.temperature ?? "-"} · seed ${t.seed ?? "-"}`],
  ];
  const toDetect: DetectPrefill = { text: f.text.slice(0, 300), from: "finding" };
  return (
    <>
      <div className="fd-nav">
        <button type="button" className="btn" onClick={back}>← 발견 항목 목록</button>
        <span className="num fd-pos">{order.includes(f.id) ? `${idx + 1} / ${order.length}` : "필터 밖 항목"}</span>
        <button type="button" className="btn" disabled={!order.includes(f.id) || idx === 0} onClick={() => go(order[idx - 1])}>이전</button>
        <button type="button" className="btn" disabled={!order.includes(f.id) || idx >= order.length - 1} onClick={() => go(order[idx + 1])}>다음</button>
      </div>
      <div className="fd-head">
        <span className="fd-id mono">{f.id}</span>
        <StateBadge state={f.state} />
        <span className="pill">{f.techniqueKo}</span>
        <span className="pill">{goal}</span>
      </div>
      <div className="rule" />
      <div className="fd-grid">
        <div>
          <SubSection title="① 이 진단에서 실제로 던진 공격 문구" />
          {/* 복사 버튼은 달지 않는다 — 공격 시드 대량 수집 편의를 우리가 제공할 이유는 없다. */}
          <div className="payload">{f.text || "(기록 없음)"}</div>
          <p className="fine">공격문의 치환 값은 자산 <b>이름</b>·페르소나·기관명·가짜값뿐입니다 — 지시문의 실제 비밀값은 공격문에 들어가지 않습니다.</p>
          <SubSection title="② 같은 공격에 챗봇이 어떻게 답했나" />
          <ResponseBlock r={f.r1} label="보강 전" />
          <div style={{ height: 12 }} />
          <ResponseBlock r={f.r2} label="보강 후 · 같은 공격을 그대로 재생" />
          <p className="fine">응답은 마스킹된 발췌입니다 — 인식한 보호값을 마스킹하며, 변형·판정 불가 응답은 원문을 보류합니다.</p>
        </div>
        <div>
          <SubSection title="분류 · 측정 조건" />
          <div className="meta">
            {rows.map(([k, v]) => <div className="row" key={k}><span className="k">{k}</span><span className="v">{v}</span></div>)}
          </div>
          <SubSection title="권고 조치" />
          <div className="advice" style={{ background: `${advice.color}0D`, border: `1px solid ${advice.color}33`, color: "#42536C" }}>
            <span className="t" style={{ color: advice.color }}>{advice.title}</span>{advice.body}
          </div>
          {f.state === "unresolved" || f.state === "regressed" ? (
            <button type="button" className="btn btn-block" style={{ marginTop: 12 }} onClick={() => nav("/detect", { state: toDetect })}>
              JOKER-KO 탐지기로 보내기
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
