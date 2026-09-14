// 첫 화면 — 서비스 소개.
//
// ★ 1순위는 '공격 구조를 던지고 보강 전후를 다시 잰다' 이고, 한국어는 2순위 근거다(0914).
//   보안 현직자 피드백: 프롬프트 인젝션의 본질은 언어가 아니라 '행동을 유도하는 구조' 다.
//   구조 축을 앞에 세우면 "한국어라서 기성 모델이 0%" 라는 위험한 프레이밍을 쓰지 않아도 된다.
// ★ 수치는 절대 여기에 적지 않는다 — headline_metrics.json 에서만 읽는다(tests/test_web_guard.py).
import { Link } from "react-router-dom";
import { ToolEvidence } from "../components/ToolEvidence";
import { metric } from "../evidence/metrics";

/** 히어로 아래 수치 띠 — 접어 두지 않는다. 심사·검토가 제일 먼저 찾는 값이다. */
function MetricStrip() {
  const keys = ["asr", "ood_recall", "fpr", "benign_pass"];
  const rows = keys.map((k) => metric(k)).filter((m): m is NonNullable<typeof m> => Boolean(m));
  if (!rows.length) return null;
  return (
    <div className="metric-strip" aria-label="실측 요약">
      {rows.map((m) => (
        <div className="ms-cell" key={m.key}>
          <b className="num">{m.value}</b>
          <span>{m.label}</span>
        </div>
      ))}
      <p className="ms-note">별도 데이터로 우리가 측정한 값입니다 — 이 화면을 여는 사람의 진단 결과가 아닙니다.
        측정 조건은 아래 ‘검증 근거’ 에 그대로 적어 두었습니다.</p>
    </div>
  );
}

// ★ 이름만 둔다 — 예시 문구까지 적으면 첫 화면이 읽을 거리가 된다. 실물은 진단 결과의 '공격 기법' 에서 본다.
const TECHNIQUES = ["역할 위장", "권위·긴급성 사칭", "출력 형식 강제", "난독화", "간접 지시", "문서 경유"];

export function Landing() {
  return <>
    <section className="landing-hero">
      <div className="hero-copy">
        <span className="eyebrow"><i /> 프롬프트 인젝션 진단 · 보강 · 재시험</span>
        <h1>지켜야 할 정보,<br />끝까지 <span>지킬 수 있도록.</span></h1>
        <p>공격은 언어가 아니라 <b>구조</b>로 들어옵니다.<br />
          그 구조를 실제로 던지고, 고친 지시문에 <b>같은 공격을 다시 던져</b> 비교합니다.</p>
        {/* ★ '진단 과정 살펴보기 ↓' 는 지웠다 — 가리키던 #how-it-works 절이 없어졌고,
            남았다면 죽은 앵커가 된다. 과정은 오른쪽 카드와 발표자료가 보여 준다. */}
        <div className="hero-actions">
          <Link className="btn btn-primary" to="/diagnose">무료로 진단 시작하기 →</Link>
        </div>
        <div className="hero-assurance">회원가입 없이 1회 체험 · 카드 정보 불필요</div>
      </div>
      <div className="product-preview" aria-label="진단 과정 예시 화면">
        <div className="preview-top"><span><i /> CHAT SHIELD</span><span className="pill">예시 화면</span></div>
        <div className="preview-title">공격 구조 여섯 가지를 던집니다.</div>
        <div className="tech-list">
          {TECHNIQUES.map((name, i) => (
            <div className="tech-chip" key={name}><span>{String(i + 1).padStart(2, "0")}</span>{name}</div>
          ))}
        </div>
        <p className="preview-note">진단 결과의 ‘공격 기법’ 과 같은 분류입니다.</p>
      </div>
    </section>

    <MetricStrip />

    {/* ★ 0914: 섹션 네 개(세 단계·두 층·검사 범위·마지막 CTA)를 한 덩어리로 합쳤다.
        글자는 이미 적었는데 섹션마다 큰 패딩과 반쯤 빈 카드가 3.6화면을 먹고 있었다.
        설명은 발표자료가 맡는다 — 이 화면이 할 일은 '무엇인지 + 어디로 들어가는지' 둘이다.
        ★ 마지막 CTA 는 히어로 버튼과 같은 링크였다(같은 버튼에 0.4화면). 삭제.
        ★ 검사 범위 한 줄은 남긴다 — 첫 화면에서 '무엇을 시험하지 않는지' 는 말해야 한다. */}
    <section className="landing-foot">
      <div className="tools-grid">
        <Link to="/diagnose" className="tool-card">
          <span className="pill">배포 전 · 지시문 진단</span>
          <h3>챗봇의 규칙을 시험하세요. →</h3>
          <p>공격을 던지고, 보강안으로 다시 시험합니다.</p>
        </Link>
        <Link to="/detect" className="tool-card">
          <span className="pill">단건 검사 · JOKER-KO</span>
          <h3>의심스러운 입력을 확인하세요. →</h3>
          <p>문구 하나를 넣어 판정을 확인합니다.</p>
        </Link>
      </div>
      <p className="scope-copy">지시문과 선택한 모델을 시험합니다. 실제 서비스의 RAG·도구 호출·대화 이력은 포함하지 않습니다.</p>
      <details className="xp">
        <summary>검증 근거 자세히 — 두 층 조합 · 공개 탐지기 대비 · 측정 조건</summary>
        <div className="xp-body"><ToolEvidence heading={false} /></div>
      </details>
    </section>
  </>;
}
