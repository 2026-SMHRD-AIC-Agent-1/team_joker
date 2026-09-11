// 리포트 히어로 — 제목 · 보강 전/후 유출 · 조치 필요 + 진단이 지나온 4단계 띠.
// ★ 여기 숫자는 전부 응답에 있는 값이다. 진행률·소요 시간처럼 없는 값은 만들지 않는다.
// ★ 0911 D: 4단계 흐름은 별도 블록이 아니라 이 카드의 아래 띠다(따로 두면 숫자가 두 벌로 읽혔다).
import type { Report } from "../../api/types";
import { reportActionRequired } from "../../lib/findings";
import { sev } from "../../lib/meta";

export function heroText(rep: Report): { title: string; lead: string; before: number; after: number } {
  const fs = rep.findings_summary;
  const before = rep.leaks_before ?? (fs.unresolved + fs.resolved);
  const after = rep.leaks_after ?? (fs.unresolved + fs.regressed);
  const uncertain = (fs.unjudged ?? 0) + (fs.no_retry ?? 0);
  if (uncertain) {
    return { before, after, title: `${uncertain}건의 판정을 다시 확인해야 합니다.`,
      lead: "불완전한 판정은 안전으로 세지 않았습니다. 등급과 전체 성공률은 보류합니다." };
  }
  if (after) {
    return { before, after, title: `보강 후에도 유출 ${after}건이 남았습니다.`,
      lead: "어떤 요청에서 정보가 노출됐는지 확인하고, 보강안을 적용하기 전에 아래 조치를 검토하세요." };
  }
  return { before, after, title: "이번 재시험에서 유출이 발견되지 않았습니다.",
    lead: "동일한 공격을 보강안에 다시 던진 결과입니다. 다른 공격과 실제 서비스까지 안전하다는 뜻은 아닙니다." };
}

export function Hero({ rep, assetsN }: { rep: Report; assetsN: number | null }) {
  const { title, lead, before, after } = heroText(rep);
  const need = reportActionRequired(rep);
  const total = rep.findings_summary.total;
  const patterns = rep.applied_patterns ?? [];
  // ★ 공격 수는 2단계에만 적는다 — 4단계에도 적으면 '보강 전 유출' 까지 같은 숫자가 세 번 찍힌다.
  const steps: [string, string][] = [
    ["지시문 분석", assetsN !== null ? `보호 대상 ${assetsN}개` : "지시문에서 지킬 값 식별"],
    ["공격 진단", total ? `한국어 공격 ${total}건` : "공격 실행"],
    ["보강안 생성", patterns.length ? `방어 패턴 ${patterns.length}개 조립` : "방어 문구 조립"],
    ["재시험", "같은 공격을 그대로 재생"],
  ];
  return (
    <div className="report-hero" data-testid="hero">
      <div className="report-eyebrow">DIAGNOSIS REPORT</div>
      <h2 className="report-title">{title}</h2>
      <div className="report-lead">{lead}</div>
      <div className="report-numbers">
        <div><div className="report-label">보강 전 유출</div><div className="report-number">{before}<small>건</small></div></div>
        <div className="rn-arrow"><div className="report-label">같은 공격을 다시</div><div className="report-number">→</div></div>
        <div><div className="report-label">보강 후 남은 유출</div>
          <div className="report-number" style={{ color: after ? sev("unresolved") : sev("resolved") }}>{after}<small>건</small></div></div>
        <div><div className="report-label">조치가 필요한 항목</div>
          <div className="report-number" style={{ color: need ? sev("unresolved") : sev("resolved") }}>{need}<small>건</small></div></div>
      </div>
      <div className="flow in-hero">
        {steps.map(([name, d], i) => (
          <div className="flow-step" key={name}><span className="n">{i + 1}</span><b>{name}</b><span className="d">{d}</span></div>
        ))}
      </div>
      <div className="flow-note"><b>3·4단계가 이 도구의 핵심</b>입니다 — 고칠 문구를 만든 뒤 <b>같은 공격을 그대로 다시 던집니다</b>.</div>
    </div>
  );
}
