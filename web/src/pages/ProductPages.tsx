import { Link, useLocation } from "react-router-dom";
import { NewRun } from "./NewRun";
import { Detect } from "./Detect";

export const TECHNIQUES = ["역할 위장", "권위·긴급성 사칭", "출력 형식 강제", "난독화", "간접 지시", "문서 경유"];

export function DiagnosePage() {
  return <div className="inspection-page">
    <section id="start" className="inspection-start" aria-labelledby="diagnose-title">
      <span id="overview" className="anchor-alias" aria-hidden="true" />
      <header><h1 id="diagnose-title">지시문 검사</h1>
        <p>챗봇에게 정해준 역할과 규칙을 넣으면, 정보가 새는지 시험하고 수정안을 제안합니다.</p></header>
      <div className="tool-workspace"><NewRun embedded /></div>
    </section>
    <section id="techniques" className="inspection-guide" aria-labelledby="diagnose-guide">
      <h2 id="diagnose-guide">어떻게 검사하나요?</h2>
      <p>속이는 질문으로 시험 → 규칙 수정 → 같은 질문으로 다시 시험합니다.</p>
      <p>결과에서 정보를 노출한 답변과 수정안을 확인하세요. 남은 공격의 탐지 여부도 보여드립니다.</p>
      <div>{TECHNIQUES.map(name => <span className="pill" key={name}>{name}</span>)}</div>
      <Link className="story-link" to="/#process">진단 과정 자세히 보기 →</Link>
    </section>
  </div>;
}

export function DetectPage() {
  const location = useLocation();
  return <div className="inspection-page">
    <section id="start" className="inspection-start" aria-labelledby="detect-title">
      <span id="overview" className="anchor-alias" aria-hidden="true" />
      <header><h1 id="detect-title">입력문 검사</h1>
        <p>사용자가 챗봇에 보낼 메시지를 넣으면, 규칙을 어기게 만드는 요청인지 확인합니다.</p></header>
      <div className="tool-workspace"><Detect key={location.state?.text ?? "manual"} embedded /></div>
    </section>
    <section id="method" className="inspection-guide" aria-labelledby="detect-guide">
      <h2 id="detect-guide">어떻게 판단하나요?</h2>
      <p>AI가 메시지의 의도를 살피고, 규칙 검사가 글자 변형 같은 수상한 패턴을 찾습니다.</p>
      <p>둘 중 하나라도 기준에 해당하면 공격을 의심합니다. 징후가 없어도 안전을 보장하지는 않습니다.</p>
      <p>모델 점수는 판단에 쓰는 값이며, 공격 확률이나 정확도가 아닙니다. 실제 메시지를 자동 차단하지 않습니다.</p>
      <Link className="story-link" to="/#process">검사 과정 보기 →</Link>
    </section>
  </div>;
}
