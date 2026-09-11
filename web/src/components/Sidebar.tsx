// 작업 화면의 내비. 항목은 '지금 할 수 있는 일' 만 둔다 — 껍데기 메뉴는 만들지 않는다.
// ★ 비회원에게는 대시보드·이력을 나열하지 않는다(쓸 수 없는 메뉴에 자물쇠를 다는 것은 벽이다).
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useHealth } from "../hooks/useHealth";

function StatusChip() {
  const h = useHealth();
  const [color, text] = h === undefined ? ["#C3CDDC", "엔진 확인 중"]
    : h === null ? ["#B5364E", "엔진 끊김"]
    : h.profile === "mock" ? ["#E08A00", "mock (가짜 응답)"]
    : ["#187B59", "엔진 정상"];
  return <div className="status-chip" role="status"><i style={{ background: color }} />{text}</div>;
}

export function Sidebar() {
  const { loggedIn, email, lastRunId, logout } = useAuth();
  const nav = useNavigate();
  const shown = email && email.length > 24 ? `${email.slice(0, 22)}…` : email;
  return (
    <aside className="sidebar" aria-label="메뉴">
      <div className="sb-brand"><span className="dot" />Chat Shield</div>
      <div className="sb-sub">한국어 프롬프트 인젝션 진단</div>
      {loggedIn ? (
        <>
          <Link className="btn btn-primary btn-block" to="/diagnose">＋ 새 진단</Link>
          <div className="sb-cap">메뉴</div>
          <NavLink className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} to="/" end>대시보드</NavLink>
          <NavLink className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} to="/detect">JOKER-KO 탐지기</NavLink>
          <div className="sb-rule" />
          <div className="sb-user">👤 {shown}</div>
          <button className="btn btn-block sb-btn" onClick={async () => { await logout(); nav("/"); }}>로그아웃</button>
        </>
      ) : (
        <>
          {lastRunId ? (
            <NavLink className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                     to={`/runs/${encodeURIComponent(lastRunId)}`}>진단 결과 보기</NavLink>
          ) : null}
          <NavLink className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} to="/detect">JOKER-KO 탐지기</NavLink>
          <div className="sb-rule" />
          <div className="sb-user">👤 비회원 · 무료 체험</div>
          <Link className="btn btn-block sb-btn" to="/">로그인 · 회원가입</Link>
        </>
      )}
      <div className="sb-rule" />
      <StatusChip />
      <div className="sb-foot">3팀 JOKER · web</div>
    </aside>
  );
}
