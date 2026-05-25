import type { PropsWithChildren } from "react";

import type { PageKey } from "../../pages/pageTypes";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface AppShellProps {
  current: PageKey;
  onNavigate: (page: PageKey) => void;
  title: string;
  backendStatus?: string;
  onNewLancamento: () => void;
}

export function AppShell({
  current,
  onNavigate,
  title,
  backendStatus = "SQLite local",
  onNewLancamento,
  children,
}: PropsWithChildren<AppShellProps>) {
  return (
    <div className="flex min-h-screen bg-[#080c11] text-slate-100">
      <Sidebar current={current} onNavigate={onNavigate} />
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden lg:pl-0">
        <Topbar title={title} backendStatus={backendStatus} onNewLancamento={onNewLancamento} />
        <main className="min-w-0 max-w-full flex-1 overflow-x-hidden px-3 py-3 sm:px-4 lg:px-5">
          <div className="app-page">{children}</div>
        </main>
      </div>
    </div>
  );
}
