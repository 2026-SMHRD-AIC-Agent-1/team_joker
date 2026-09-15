import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

const PAGES = [
  { path: "/", label: "서비스 소개", sections: [["intro", "서비스 개요"], ["process", "진단 과정"], ["evidence", "검증 근거"]] },
  { path: "/diagnose", label: "지시문 검사", sections: [["overview", "검사 안내"], ["techniques", "공격 유형"], ["start", "검사 시작"]] },
  { path: "/detect", label: "입력문 검사", sections: [["overview", "검사 안내"], ["method", "탐지 방식"], ["start", "입력문 검사"]] },
];

function PageMenu({ page }: { page: typeof PAGES[number] }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const panelId = `menu-${page.path === "/" ? "about" : page.path.slice(1)}`;
  useEffect(() => { setOpen(false); }, [location]);
  return <div className="contents-menu" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }}>
    <div className="page-menu-label">
      <NavLink end to={page.path}>{page.label}</NavLink>
      <button ref={trigger} className="contents-trigger" aria-label={`${page.label} 세부 메뉴`} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
        <span aria-hidden="true" className={open ? "turned" : ""}>⌄</span>
      </button>
    </div>
    <div id={panelId} className="contents-panel" hidden={!open}>
      {/* 같은 페이지 안이어도 스크롤은 Layout 한 곳이 맡는다 — 여기서 따로 scrollIntoView 를
          부르면 두 스크롤이 서로를 끊는다(lib/scroll.ts 주석). 해시만 바꾸면 된다. */}
      {page.sections.map(([id, label], index) => <Link key={id} to={`${page.path}#${id}`} onClick={() => setOpen(false)}
        ><span>{String(index + 1).padStart(2, "0")}</span>{label}<span aria-hidden="true">→</span></Link>)}
    </div>
  </div>;
}

export function ContentsMenu() {
  return <>{PAGES.map((page) => <PageMenu key={page.path} page={page} />)}</>;
}
