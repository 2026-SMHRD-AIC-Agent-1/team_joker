import { Link } from "react-router-dom";
import { ToolEvidence } from "../components/ToolEvidence";
export function Landing() {
  return <>
    <section className="landing-hero">
      <div className="hero-copy"><span className="eyebrow"><i /> 한국어 챗봇을 위한 보안 진단</span>
        <h1>지켜야 할 정보,<br />끝까지 <span>지킬 수 있도록.</span></h1>
        <p>우리 챗봇은 예상하지 못한 질문에도 안전하게 답할까요?<br />한국어 공격으로 지시문을 시험하고,<br />보강 전후의 차이를 직접 확인하세요.</p>
        <div className="hero-actions"><Link className="btn btn-primary" to="/diagnose">무료로 진단 시작하기 ↗</Link><a className="btn" href="#how-it-works">진단 과정 살펴보기 ↓</a></div>
        <div className="hero-assurance">회원가입 없이 1회 체험 · 카드 정보 불필요</div>
      </div>
      <div className="product-preview" aria-label="진단 과정 예시 화면">
        <div className="preview-top"><span><i /> CHAT SHIELD</span><span className="pill">예시 화면</span></div>
        <div className="preview-orbit"><div className="shield-art">S<span>SHIELD</span></div></div>
        <div className="preview-title">질문을 시험하고, 답변을 확인합니다.</div>
        <div className="preview-step"><span>01</span><div><b>지시문 분석</b><small>보호해야 할 정보와 규칙 확인</small></div><em>분석</em></div>
        <div className="preview-step"><span>02</span><div><b>한국어 공격 시험</b><small>예상하지 못한 질문에 대한 응답 확인</small></div><em>시험</em></div>
        <div className="preview-step"><span>03</span><div><b>보강 및 재시험</b><small>같은 공격으로 보강 전후 비교</small></div><em>비교</em></div>
        <p className="preview-note">진단 과정을 설명하는 예시이며 실제 진단 결과가 아닙니다.</p>
      </div>
    </section>
    <div className="feature-strip"><span>한국어 공격 시험</span><span>실제 응답 기반 증거</span><span>지시문 보강안 제공</span><span>보강 전후 재검증</span></div>
    <section className="landing-section" id="how-it-works"><span className="eyebrow">HOW IT WORKS</span><h2>복잡한 보안 진단을,<br />명확한 세 단계로.</h2><p>입력부터 결과 확인까지, 무엇을 해야 하는지 안내합니다.</p>
      <div className="landing-grid">{[
        ["01", "지시문을 넣으세요", "챗봇의 역할과 규칙을 입력하세요. 처음이라면 준비된 예시로 시작할 수 있습니다."],
        ["02", "발견된 문제를 확인하세요", "어떤 질문에 어떤 답을 했는지, 보호할 정보가 노출됐는지 증거로 확인합니다."],
        ["03", "보강하고 비교하세요", "추가할 방어 규칙과 같은 공격으로 다시 시험한 결과를 함께 확인합니다."],
      ].map(([n,t,d]) => <article className="landing-card" key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></article>)}</div>
    </section>
    <section className="landing-section tools-section"><div><span className="eyebrow">TWO LAYERS OF PROTECTION</span><h2>지시문부터 입력까지.<br />각 단계에 필요한 검사.</h2></div><div className="tools-grid">
      <Link to="/diagnose" className="tool-card"><span className="pill">배포 전 · 지시문 진단</span><h3>챗봇의 규칙을 시험하세요. ↗</h3><p>공격 시험과 보강안 재시험으로, 지시문에서 개선할 부분을 찾습니다.</p></Link>
      <Link to="/detect" className="tool-card"><span className="pill">단건 검사 · JOKER-KO</span><h3>의심스러운 입력을 확인하세요. ↗</h3><p>한국어 문구 하나를 넣어 ML 모델과 난독화 규칙의 판정을 확인합니다.</p></Link>
    </div></section>
    <section className="landing-section"><span className="eyebrow">EVIDENCE & SCOPE</span><h2>결과와 함께, 검사 범위도 분명하게.</h2><p className="scope-copy">지시문과 선택한 모델을 시험합니다. 실제 서비스의 RAG·도구 호출·대화 이력은 포함하지 않습니다. 보강안은 검토 후 적용하고 정상 업무에도 문제가 없는지 확인하세요.</p><details className="xp"><summary>도구의 검증 결과와 측정 조건 보기</summary><div className="xp-body"><ToolEvidence /></div></details></section>
    <section className="landing-cta"><span className="eyebrow">START WITH A SINGLE PROMPT</span><h2>첫 진단, 지시문 하나면 됩니다.</h2><p>예시 지시문으로도 시작할 수 있습니다.</p><Link className="btn btn-primary" to="/diagnose">지금 무료로 진단하기 ↗</Link></section>
  </>;
}
