// 보강안 복사. ★ 성공/실패를 그 자리에서 말한다 — 복사가 안 됐는데 '복사했습니다' 라고 하지 않는다.
// clipboard API 가 막히는 환경(비 HTTPS · 권한 거부)에서는 execCommand 로 한 번 더 시도하고,
// 그것도 실패하면 직접 선택해 복사하라고 안내한다.
import { useState } from "react";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* 다음 방법으로 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "ok" | "no">("idle");
  return (
    <div className="copy-row">
      <button type="button" className="btn" onClick={async () => setState((await copyText(text)) ? "ok" : "no")}>{label}</button>
      <span className={`copy-s ${state}`} role="status">
        {state === "ok" ? "복사했습니다" : state === "no" ? "복사 실패 — 아래 보강안을 직접 선택해 복사하세요" : ""}
      </span>
    </div>
  );
}
