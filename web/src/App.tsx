import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { AuthPage } from "./pages/AuthPage";
import { Dashboard } from "./pages/Dashboard";
import { History } from "./pages/History";
import { Detect } from "./pages/Detect";
import { NewRun } from "./pages/NewRun";
import { RunPage } from "./pages/RunPage";
import { Settings } from "./pages/Settings";

/** 회원만 내용이 생기는 화면. 비회원이 들어오면 첫 화면으로 돌린다(껍데기 화면을 보여 주지 않는다). */
function RequireLogin({ children }: { children: ReactNode }) {
  const { loggedIn } = useAuth();
  return loggedIn ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  const { loggedIn, token } = useAuth();
  return (
    <Routes>
      {!loggedIn ? <Route path="/" element={<AuthPage />} /> : null}
      <Route element={<Layout />}>
        {loggedIn ? <Route path="/" element={<Dashboard />} /> : null}
        <Route path="/history" element={<RequireLogin><History /></RequireLogin>} />
        <Route path="/diagnose" element={<NewRun />} />
        <Route path="/runs/:runId" element={<RunPage key={token ?? "guest"} />} />
        <Route path="/runs/:runId/f/:fid" element={<RunPage key={token ?? "guest"} />} />
        <Route path="/detect" element={<Detect />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
