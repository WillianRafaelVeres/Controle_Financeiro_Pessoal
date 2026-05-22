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
      <div className="flex min-w-0 flex-1 flex-col lg:pl-0">
        <Topbar title={title} backendStatus={backendStatus} onNewLancamento={onNewLancamento} />
        <main className="w-full flex-1 px-2.5 py-2.5 sm:px-3 lg:px-4">{children}</main>
      </div>
    </div>
  );
}
