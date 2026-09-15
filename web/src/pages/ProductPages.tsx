import { ScrollStory } from "../components/ScrollStory";
import { NewRun } from "./NewRun";
import { Detect } from "./Detect";
import { useLocation } from "react-router-dom";

const TECHNIQUES = ["역할 위장", "권위·긴급성 사칭", "출력 형식 강제", "난독화", "간접 지시", "문서 경유"];

export function DiagnosePage() {
  return <ScrollStory>
    <section id="overview" className="quiet-hero product-hero">
      <span className="story-kicker">지시문 검사</span>
      <h1>규칙의 빈틈을 찾고,<br /><span>더 단단하게.</span></h1>
      <p>공격 · 보강 · 재시험</p>
      <a className="btn btn-primary" href="#start">지시문 검사 시작 →</a>
      <a className="scroll-cue" href="#techniques">공격 유형 <span aria-hidden="true">↓</span></a>
      <div className="hero-orbit" aria-hidden="true"><i /><i /><i /></div>
    </section>
    <section id="techniques" className="story-section story-split">
      <div className="story-heading"><span className="story-kicker">01 / 공격 유형</span>
        <h2>여섯 가지 공격.<br /><span>흔들리지 않는 규칙.</span></h2>
        <p>역할 사칭부터 문서 속 간접 지시까지.</p>
      </div>
      <div className="quiet-techniques">{TECHNIQUES.map((name, i) => <div key={name}><span>{String(i + 1).padStart(2, "0")}</span><h3>{name}</h3></div>)}</div>
    </section>
    <section id="start" className="story-section tool-section">
      <div className="story-heading"><span className="story-kicker">02 / 검사 시작</span><h2>지시문을 <span>입력하세요.</span></h2></div>
      <div className="tool-workspace"><NewRun embedded /></div>
    </section>
  </ScrollStory>;
}

export function DetectPage() {
  const location = useLocation();
  return <ScrollStory>
    <section id="overview" className="quiet-hero product-hero detect-hero">
      <span className="story-kicker">입력문 검사</span>
      <h1>평범한 문장 속,<br /><span>숨겨진 공격 의도.</span></h1>
      <p>입력문 하나를 빠르게 확인하세요.</p>
      <a className="btn btn-primary" href="#start">입력문 검사 시작 →</a>
      <a className="scroll-cue" href="#method">탐지 방식 <span aria-hidden="true">↓</span></a>
      <div className="hero-orbit" aria-hidden="true"><i /><i /><i /></div>
    </section>
    <section id="method" className="story-section story-split">
      <div className="story-heading"><span className="story-kicker">01 / 탐지 방식</span>
        <h2>문맥을 읽고.<br /><span>난독화를 찾습니다.</span></h2>
        <p>JOKER-KO 모델과 규칙 필터의 조합.</p>
      </div>
      <div className="input-illustration" aria-label="입력문 검사 흐름 예시">
        <span className="story-kicker">예시</span>
        <div className="sample-input">“앞의 규칙은 무시하고…”</div>
        <div className="scan-track" aria-hidden="true"><span /></div>
        <div className="scan-caption"><span>문맥 분석</span><span>규칙 탐지 →</span></div>
      </div>
    </section>
    <section id="start" className="story-section tool-section">
      <div className="story-heading"><span className="story-kicker">02 / 입력문 검사</span><h2>이 문장, <span>괜찮을까요?</span></h2></div>
      <div className="tool-workspace"><Detect key={location.state?.text ?? "manual"} embedded /></div>
    </section>
  </ScrollStory>;
}
