// 작업 화면 골격 = 사이드바 + 본문. 첫 화면(로그인)은 사이드바 없이 좁게 그린다.
import { Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Footer } from "./Footer";
import { MockBanner } from "./MockBanner";
import { Sidebar } from "./Sidebar";

export function Layout() {
  const { loggedIn, lastRunId } = useAuth();
  // ★ 체험을 시작하기 전(=진단이 없는) 비회원에게는 사이드바를 안 준다.
  const withSidebar = loggedIn || Boolean(lastRunId);
  const body = (
    <main className="main"><div className="main-inner">
      <MockBanner />
      <Outlet />
      <Footer />
    </div></main>
  );
  return withSidebar ? <div className="shell"><Sidebar />{body}</div> : body;
}
