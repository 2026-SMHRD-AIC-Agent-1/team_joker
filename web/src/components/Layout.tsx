import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Footer } from "./Footer";
import { MockBanner } from "./MockBanner";

export function Layout() {
  const { loggedIn, logout } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [location.pathname]);
  return <div className="site-shell">
    <a className="skip-link" href="#main-content">본문으로 이동</a>
    <header className="topbar"><div className="topbar-inner">
      <Link to="/" className="site-brand"><span className="brand-shield">S</span>Chat Shield<span className="brand-caption">AI SECURITY</span></Link>
      <button className="btn mobile-menu" aria-expanded={open} aria-controls="site-navigation" onClick={() => setOpen(!open)}>메뉴 {open ? "닫기" : "열기"}</button>
      <nav id="site-navigation" className={`topnav ${open ? "is-open" : ""}`} aria-label="주 메뉴">
        <NavLink to="/" end>서비스 소개</NavLink><NavLink to="/diagnose">지시문 진단</NavLink><NavLink to="/detect">입력문 검사</NavLink>
        {loggedIn ? <><NavLink to="/dashboard">대시보드</NavLink><NavLink to="/history">진단 기록</NavLink></> : null}
        {loggedIn ? <><NavLink to="/settings">설정</NavLink><button className="btn btn-link" onClick={async () => { await logout(); nav("/"); }}>로그아웃</button></> : <NavLink to="/login">로그인</NavLink>}
        <Link className="btn btn-primary" to="/diagnose">{loggedIn ? "새 진단 시작" : "무료 진단 시작"} ↗</Link>
      </nav>
    </div></header>
    <main className="main" id="main-content"><div className={`main-inner ${location.pathname === "/" ? "landing-wrap" : ""}`}>
      <MockBanner /><div className="page-transition" key={location.pathname}><Outlet /></div><Footer />
    </div></main>
  </div>;
}
