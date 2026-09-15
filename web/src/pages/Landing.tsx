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
      <a className="scroll-cue" href="#compare">둘러보기 <span aria-hidden="true">↓</span></a>
    </section>

    <section id="compare" className="story-section inspection-guide" aria-labelledby="compare-title">
      <div className="story-heading"><span className="story-kicker">01 / 두 검사 비교</span><h2 id="compare-title">무엇을 <span>검사할까요?</span></h2></div>
      <div className="inspection-comparison">
        <article><h3>지시문 검사</h3><p>입력: 챗봇의 지시문</p><p>공격으로 시험하고 보강 후 재시험합니다. 취약점·보강안·전후 유출 결과와 잔여 공격의 추가 탐지 결과를 제공합니다.</p><Link className="btn btn-primary" to="/diagnose#start">지시문 검사 시작 →</Link></article>
        <article><h3>입력문 검사</h3><p>입력: 사용자 입력 한 건</p><p>JOKER-KO와 규칙으로 공격 징후를 확인합니다. SAFE/INJECTION 판정, 모델 점수와 규칙 플래그를 제공합니다.</p><Link className="btn" to="/detect#start">입력문 검사 시작 →</Link></article>
      </div>
    </section>

    <section id="process" className="story-section" aria-labelledby="process-title">
      <div className="story-heading"><span className="story-kicker">02 / PROCESS</span>
        <h2 id="process-title">시험하고. 보강하고.<br /><span>다시 확인합니다.</span></h2>
        <p>같은 공격으로, 보강 전후를 비교합니다.</p>
      </div>
      <div className="process-line">
        {[['01', '지시문 분석', '보호할 정보와 규칙을 찾습니다.'], ['02', '공격 시험', '여섯 유형의 공격으로 유출을 확인합니다.'], ['03', '방어 문구 생성', '취약한 지시문을 보강합니다.'], ['04', '재시험', '같은 공격으로 보강 전후를 비교합니다.'], ['05', '추가 탐지·결과 정리', '남은 확정 유출 공격을 JOKER-KO로 사후 검사합니다.']].map(([n, title, desc]) => <div key={n}><span className="process-number">{n}</span><h3>{title}</h3><p>{desc}</p></div>)}
      </div>
      <p className="quiet-scope">공격 유형: 역할 위장 · 권위·긴급성 사칭 · 출력 형식 강제 · 난독화 · 간접 지시 · 문서 경유.</p>
      <p>JOKER-KO는 독립 입력문 검사와 진단의 잔여 유출 사후 검사에 사용됩니다. 모델이 문맥의 공격 의도를 분류하고, 규칙은 역순·자모 분해·인코딩 등의 난독화 징후를 찾습니다.</p>
      <p>진단에서는 규칙 탐지와 ML의 추가 탐지를 중복 없이 구분합니다. 모델 점수는 검증된 공격 확률이 아니며, SAFE도 완전한 안전을 보장하지 않습니다. 운영 서비스에 필터를 자동 적용하거나 실시간 차단하지 않습니다.</p>
      <Link className="story-link" to="/diagnose">내 지시문 진단하기 <span>→</span></Link>
    </section>

    <section id="evidence" className="story-section evidence-section" aria-labelledby="evidence-title">
      <div className="story-heading"><span className="story-kicker">03 / EVIDENCE</span>
        <h2 id="evidence-title">결과는 <span>근거와 함께.</span></h2>
        <p>별도 데이터로 측정한 값이며, 사용자의 진단 결과가 아닙니다.</p>
      </div>
      <div className="quiet-metrics" aria-label="실측 요약">{metrics.map((m) => <div key={m.key}><b>{m.value}</b><span>{m.label}</span></div>)}</div>
      <details className="quiet-evidence"><summary>측정 조건과 검증 근거 보기 <span aria-hidden="true">＋</span></summary><div className="quiet-evidence-body"><ToolEvidence heading={false} /></div></details>
      <p className="quiet-scope">검사 범위: 지시문과 선택한 모델. 실제 서비스의 RAG·도구 호출·대화 이력은 포함하지 않습니다.</p>
    </section>
  </ScrollStory>;
}
