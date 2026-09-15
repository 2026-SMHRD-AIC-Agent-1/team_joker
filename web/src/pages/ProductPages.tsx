import { Link, useLocation } from "react-router-dom";
import { NewRun } from "./NewRun";
import { Detect } from "./Detect";

export const TECHNIQUES = ["역할 위장", "권위·긴급성 사칭", "출력 형식 강제", "난독화", "간접 지시", "문서 경유"];

export function DiagnosePage() {
  return <div className="inspection-page">
    <section id="start" className="inspection-start" aria-labelledby="diagnose-title">
      <span id="overview" className="anchor-alias" aria-hidden="true" />
      <header><h1 id="diagnose-title">지시문 검사</h1>
        <p>챗봇의 지시문을 입력하면 공격 시험과 보강 후 재시험으로 취약점을 확인합니다.</p></header>
      <div className="tool-workspace"><NewRun embedded /></div>
    </section>
    <section id="techniques" className="inspection-guide" aria-labelledby="diagnose-guide">
      <h2 id="diagnose-guide">어떻게 검사하나요?</h2>
      <p>사용자 질문이 아닌 챗봇의 지시문을 넣어 주세요. 공격 시험 → 지시문 보강 → 같은 공격으로 재시험합니다.</p>
      <p>결과에서 취약점과 보강안, 보강 후에도 남은 유출 공격의 JOKER-KO 추가 탐지 결과를 확인할 수 있습니다.</p>
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
        <p>사용자 입력문에 프롬프트 인젝션 징후가 있는지 확인합니다.</p></header>
      <div className="tool-workspace"><Detect key={location.state?.text ?? "manual"} embedded /></div>
    </section>
    <section id="method" className="inspection-guide" aria-labelledby="detect-guide">
      <h2 id="detect-guide">탐지 방식</h2>
      <p>JOKER-KO는 문맥의 공격 의도를 분류하고, 규칙은 문자 변형·인코딩 등 난독화 징후를 확인합니다.</p>
      <p>모델 점수가 임계값 이상이거나 규칙 플래그가 있으면 INJECTION입니다. SAFE는 두 조건에 해당하지 않는다는 뜻이며 완전한 안전을 보장하지 않습니다.</p>
      <p>모델 점수는 분류 모델의 출력값이며, 검증된 공격 확률이나 정확도를 뜻하지 않습니다. 규칙 플래그는 탐지한 패턴의 근거입니다.</p>
      <Link className="story-link" to="/#process">JOKER-KO 역할 자세히 보기 →</Link>
    </section>
  </div>;
}
