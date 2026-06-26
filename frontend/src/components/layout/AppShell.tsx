import type { PropsWithChildren } from "react";

import type { PageKey } from "../../pages/pageTypes";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface AppShellProps {
  current: PageKey;
  onNavigate: (page: PageKey) => void;
  backendStatus?: string;
  onNewLancamento: () => void;
  onLogout?: () => void;
}

export function AppShell({
  current,
  onNavigate,
  backendStatus = "SQLite local",
  onNewLancamento,
  onLogout,
  children,
}: PropsWithChildren<AppShellProps>) {
  return (
    <div className="relative isolate flex min-h-screen bg-transparent text-slate-100 lg:h-screen lg:overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(120deg,rgba(8,47,73,0.28)_0%,transparent_30%,rgba(21,128,61,0.16)_64%,transparent_100%)]"
      />
      <Sidebar current={current} onNavigate={onNavigate} onLogout={onLogout} />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-x-clip lg:h-screen lg:overflow-y-auto lg:pl-0">
        <Topbar backendStatus={backendStatus} onNewLancamento={onNewLancamento} />
        <main className="min-w-0 max-w-full flex-1 overflow-x-clip px-3 py-4 sm:px-5 lg:px-6">
          <div className="app-page">{children}</div>
        </main>
      </div>
    </div>
  );
}
