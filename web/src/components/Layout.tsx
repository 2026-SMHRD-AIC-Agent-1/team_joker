import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { anchorTarget, settleToAnchor } from "../lib/scroll";
import { Footer } from "./Footer";
import { MockBanner } from "./MockBanner";
import { ContentsMenu } from "./ContentsMenu";

export function Layout() {
  const { loggedIn, logout } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  // 화면 안 '#섹션' 링크는 브라우저에 맡기지 않고 라우터를 태운다.
  // ★ 왜: <a href="#start"> 는 React Router 의 location 을 갱신하지 않아서 아래 효과가 돌지 않고,
  //   브라우저의 부드러운 스크롤만 남아 중간에 끊겼다(lib/scroll.ts 주석의 실측). 라우터로 보내면
  //   해시 이동 경로가 한 줄기로 합쳐져 '상단바 CTA · 히어로 CTA · 목차 메뉴' 가 같게 동작한다.
  // ★ 같은 해시를 다시 눌러도 동작해야 한다 — navigate 는 매번 새 key 를 만들므로 효과가 다시 돈다.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href^='#']") as HTMLAnchorElement | null;
      const id = link?.getAttribute("href")?.slice(1);
      if (!id || anchorTarget(id) === null) return;   // 이 화면에 없는 앵커는 브라우저에 맡긴다
      event.preventDefault();
      nav({ hash: `#${id}` });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [nav]);

  useEffect(() => {
    setOpen(false);
    const anchor = location.hash.slice(1) || (location.pathname === "/detect" && location.state?.text ? "start" : "");
    if (!anchor) {
      window.scrollTo(0, 0);
      return;
    }
    // 목적지 값이 자리를 잡을 때까지 따라간다(lib/scroll.ts: settleToAnchor).
    return settleToAnchor(anchor);
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
