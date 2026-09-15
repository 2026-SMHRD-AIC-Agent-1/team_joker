import { ScrollStory } from "../components/ScrollStory";
import { Link } from "react-router-dom";
import { ToolEvidence } from "../components/ToolEvidence";
import { metric } from "../evidence/metrics";

export function Landing() {
  const metrics = ["asr", "benign_pass", "ood_recall", "fpr"].map((key) => metric(key)).filter((m): m is NonNullable<typeof m> => Boolean(m));
  return <ScrollStory>
    <section id="intro" className="quiet-hero" aria-labelledby="intro-title">
      <span className="story-kicker">CHAT SHIELD / AI SECURITY</span>
      <h1 id="intro-title">지켜야 할 정보,<br /><span>끝까지 지키도록.</span></h1>
      <p>챗봇의 지시문을 시험하고, 더 단단하게.</p>
      <Link className="btn btn-primary" to="/diagnose">무료로 진단 시작하기 →</Link>
      <span className="quiet-assurance">회원가입 없이 1회 체험</span>
      <a className="scroll-cue" href="#process">둘러보기 <span aria-hidden="true">↓</span></a>
    </section>

    <section id="process" className="story-section" aria-labelledby="process-title">
      <div className="story-heading"><span className="story-kicker">01 / PROCESS</span>
        <h2 id="process-title">시험하고. 보강하고.<br /><span>다시 확인합니다.</span></h2>
        <p>같은 공격으로, 보강 전후를 비교합니다.</p>
      </div>
      <div className="process-line">
        {[['01', '진단', '지시문에 공격을 던집니다.'], ['02', '보강', '취약한 규칙을 다듬습니다.'], ['03', '재시험', '같은 공격으로 변화를 봅니다.']].map(([n, title, desc]) => <div key={n}><span className="process-number">{n}</span><h3>{title}</h3><p>{desc}</p></div>)}
      </div>
      <Link className="story-link" to="/diagnose">내 지시문 진단하기 <span>→</span></Link>
    </section>

    <section id="evidence" className="story-section evidence-section" aria-labelledby="evidence-title">
      <div className="story-heading"><span className="story-kicker">02 / EVIDENCE</span>
        <h2 id="evidence-title">결과는 <span>근거와 함께.</span></h2>
        <p>별도 데이터로 측정한 값이며, 사용자의 진단 결과가 아닙니다.</p>
      </div>
      <div className="quiet-metrics" aria-label="실측 요약">{metrics.map((m) => <div key={m.key}><b>{m.value}</b><span>{m.label}</span></div>)}</div>
      <details className="quiet-evidence"><summary>측정 조건과 검증 근거 보기 <span aria-hidden="true">＋</span></summary><div className="quiet-evidence-body"><ToolEvidence heading={false} /></div></details>
      <p className="quiet-scope">검사 범위: 지시문과 선택한 모델. 실제 서비스의 RAG·도구 호출·대화 이력은 포함하지 않습니다.</p>
    </section>
  </ScrollStory>;
}
