// 리포트 안에서 바로 가입·로그인. 가입하면 방금 진단이 claim 되어 그 자리에서 전체가 열린다.
import { AuthForm } from "../pages/AuthPage";
import { Dialog } from "./Dialog";

export function AuthDialog({ open, onClose, onAuthed }: {
  open: boolean; onClose: () => void; onAuthed: (claimed: boolean) => void;
}) {
  return (
    <Dialog title="로그인 · 무료 회원가입" open={open} onClose={onClose}>
      <p className="fine" style={{ marginBottom: 12 }}>
        가입하면 <b>방금 실행한 이 진단</b>이 그대로 열립니다 — 다시 진단하지 않아도 됩니다.
      </p>
      <AuthForm onDone={(claimed) => { onClose(); onAuthed(claimed); }} />
    </Dialog>
  );
}
