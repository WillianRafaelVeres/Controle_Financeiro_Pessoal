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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/68 p-3 backdrop-blur-sm sm:p-5">
      <div className={cn("flex max-h-[calc(100vh-1.5rem)] w-full max-w-lg animate-[page-enter_160ms_ease-out] flex-col overflow-hidden rounded-xl border border-slate-700/90 bg-[#111821] shadow-2xl shadow-black/45 sm:max-h-[calc(100vh-2.5rem)]", className)}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <h2 className="min-w-0 truncate text-sm font-semibold text-slate-100">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
