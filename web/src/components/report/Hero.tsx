// 리포트 히어로 — 제목 · 수정 전/후 유출 · 조치 필요 + 진단이 지나온 4단계 띠.
// ★ 여기 숫자는 전부 응답에 있는 값이다. 진행률·소요 시간처럼 없는 값은 만들지 않는다.
// ★ 0911 D: 4단계 흐름은 별도 블록이 아니라 이 카드의 아래 띠다(따로 두면 숫자가 두 벌로 읽혔다).
import type { Report } from "../../api/types";
import { reportActionRequired } from "../../lib/findings";
import { GRADE_COLOR, sev } from "../../lib/meta";

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
    return { before, after, title: `수정 후에도 유출 ${after}건이 남았습니다.`,
      lead: "어떤 요청에서 정보가 노출됐는지 확인하고, 수정안을 적용하기 전에 아래 조치를 검토하세요." };
  }
  return { before, after, title: "이번 재시험에서 유출이 발견되지 않았습니다.",
    lead: "동일한 공격을 수정안에 다시 던진 결과입니다. 다른 공격과 실제 서비스까지 안전하다는 뜻은 아닙니다." };
}

export function Hero({ rep, assetsN }: { rep: Report; assetsN: number | null }) {
  const { title, lead, before, after } = heroText(rep);
  // ★ 판정을 보류한 진단에서는 등급을 띄우지 않는다 — lead 가 "등급을 보류합니다" 라고 말하는데
  //   옆에 등급이 붙어 있으면 화면이 스스로 모순된다(0914 캡처에서 실제로 그랬다).
  const uncertain = (rep.findings_summary.unjudged ?? 0) + (rep.findings_summary.no_retry ?? 0);
  const grade = uncertain ? null : rep.grade;
  const need = reportActionRequired(rep);
  const total = rep.findings_summary.total;
  const patterns = rep.applied_patterns ?? [];
  // ★ 공격 수는 2단계에만 적는다 — 4단계에도 적으면 '수정 전 유출' 까지 같은 숫자가 세 번 찍힌다.
  const steps: [string, string][] = [
    ["규칙 확인", assetsN !== null ? `지킬 정보 ${assetsN}개` : "규칙에서 지킬 정보 확인"],
    ["공격 시험", total ? `한국어 공격 ${total}건` : "공격 실행"],
    ["수정안 제안", patterns.length ? `보호 규칙 ${patterns.length}개 추가` : "보호 규칙 추가"],
    ["재시험", "같은 질문으로 다시 확인"],
  ];
  return (
    <div className="report-hero" data-testid="hero">
      <div className="report-top">
        <span className="report-eyebrow">DIAGNOSIS REPORT</span>
        {/* ★ 등급은 요약 화면에 있어야 한다 — '자세한 기록' 탭에만 두면 첫 화면이 "몇 점인지" 에 답하지 않는다.
            판정을 보류한 진단은 등급 대신 '판정 보류' 를 같은 자리에 적는다(빈칸으로 두지 않는다). */}
        <span className="grade-chip" data-testid="grade"
              style={grade ? { color: GRADE_COLOR[grade], borderColor: GRADE_COLOR[grade] } : undefined}>
          {grade ? <><small>등급</small>{grade}</> : <small>등급 판정 보류</small>}
        </span>
      </div>
      <h2 className="report-title">{title}</h2>
      <div className="report-lead">{lead}</div>
      <div className="report-numbers">
        <div><div className="report-label">수정 전 유출</div><div className="report-number">{before}<small>건</small></div></div>
        <div className="rn-arrow"><div className="report-label">같은 공격을 다시</div><div className="report-number">→</div></div>
        <div><div className="report-label">수정 후 남은 유출</div>
          <div className="report-number" style={{ color: after ? sev("unresolved") : sev("resolved") }}>{after}<small>건</small></div></div>
        <div><div className="report-label">조치가 필요한 항목</div>
          <div className="report-number" style={{ color: need ? sev("unresolved") : sev("resolved") }}>{need}<small>건</small></div></div>
      </div>
      {/* ★ 기본 펼침 — 시연에서 제일 먼저 보여 줄 흐름이 클릭해야 나오면 안 된다. 접을 수는 있게 둔다. */}
      <details className="hero-process" open><summary>이번 진단은 어떻게 진행됐나요?</summary>
      <div className="flow in-hero">
        {steps.map(([name, d], i) => (
          <div className="flow-step" key={name}><span className="n">{i + 1}</span><b>{name}</b><span className="d">{d}</span></div>
        ))}
      </div>
      <div className="flow-note"><b>수정 효과를 직접 확인</b>합니다 — 수정안을 만든 뒤 <b>같은 질문으로 다시 시험합니다</b>.</div>
      </details>
    </div>
  );
}
