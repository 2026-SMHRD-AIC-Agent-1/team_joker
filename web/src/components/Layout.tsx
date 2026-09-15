import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Footer } from "./Footer";
import { MockBanner } from "./MockBanner";
import { ContentsMenu } from "./ContentsMenu";

export function Layout() {
  const { loggedIn, logout } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
    const anchor = location.hash.slice(1) || (location.pathname === "/detect" && location.state?.text ? "start" : "");
    if (anchor) {
      const frame = requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: "start" }));
      return () => cancelAnimationFrame(frame);
    }
    window.scrollTo(0, 0);
  }, [location.pathname, location.hash, location.key, location.state]);
  return <div className="site-shell">
    <a className="skip-link" href="#main-content">본문으로 이동</a>
    <header className="topbar"><div className="topbar-inner">
      <Link to="/" className="site-brand"><span className="brand-shield">S</span>Chat Shield<span className="brand-caption">AI SECURITY</span></Link>
      <button className="btn mobile-menu" aria-expanded={open} aria-controls="site-navigation" onClick={() => setOpen(!open)}>메뉴 {open ? "닫기" : "열기"}</button>
      <nav id="site-navigation" className={`topnav ${open ? "is-open" : ""}`} aria-label="주 메뉴">
        <ContentsMenu />
        {loggedIn ? <><NavLink to="/dashboard">대시보드</NavLink><NavLink to="/history">진단 기록</NavLink></> : null}
        {loggedIn ? <><NavLink to="/settings">설정</NavLink><button className="btn btn-link" onClick={async () => { await logout(); nav("/"); }}>로그아웃</button></> : <NavLink to="/login">로그인</NavLink>}
        <Link className="btn btn-primary" to="/diagnose#start">{loggedIn ? "새 진단 시작" : "무료 진단 시작"} →</Link>
      </nav>
    </div></header>
    <main className="main" id="main-content"><div className={`main-inner ${["/", "/diagnose", "/detect"].includes(location.pathname) ? "landing-wrap" : ""}`}>
      <MockBanner /><div className="page-transition" key={location.pathname}><Outlet /></div><Footer />
    </div></main>
  </div>;
}
