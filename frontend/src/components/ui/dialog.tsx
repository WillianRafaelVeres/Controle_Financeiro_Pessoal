import type { PropsWithChildren } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "../../lib/utils";
import { Button } from "./button";

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  className?: string;
}

export function Dialog({ open, title, onClose, className, children }: PropsWithChildren<DialogProps>) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#020817]/[0.76] p-3 backdrop-blur-md sm:p-5">
      <div className={cn("glass-highlight flex max-h-[calc(100vh-1.5rem)] w-full max-w-lg animate-[page-enter_160ms_ease-out] flex-col rounded-2xl border border-white/[0.12] bg-slate-900/[0.82] shadow-[0_28px_90px_rgba(0,0,0,0.54)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-2xl sm:max-h-[calc(100vh-2.5rem)]", className)}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <h2 className="min-w-0 truncate text-sm font-semibold text-slate-100">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
