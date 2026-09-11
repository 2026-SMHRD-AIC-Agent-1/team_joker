// 모달 대화상자. Esc·배경 클릭으로 닫히고, 열리면 닫기 버튼에 포커스가 간다(키보드 사용자).
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function Dialog({ title, open, onClose, children, wide = false }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label={title}
           style={wide ? { width: "min(980px,100%)" } : undefined}>
        <div className="dlg-h">
          <h2>{title}</h2>
          <button ref={closeRef} className="dlg-x" onClick={onClose} aria-label="닫기">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
