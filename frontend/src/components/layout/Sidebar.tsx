import {
  BarChart3,
  Banknote,
  CalendarClock,
  ChevronsLeft,
  ChevronsRight,
  CreditCard,
  DollarSign,
  FileBarChart,
  Gauge,
  Landmark,
  LineChart,
  Plug,
  ReceiptText,
  Settings,
  Target,
  WalletCards,
} from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/utils";
import type { PageKey } from "../../pages/pageTypes";

const groups: Array<{ title: string; items: Array<{ key: PageKey; label: string; icon: typeof Gauge }> }> = [
  {
    title: "Financeiro geral",
    items: [
      { key: "dashboard", label: "Painel", icon: Gauge },
      { key: "lancamentos", label: "Lancamentos", icon: ReceiptText },
      { key: "contas", label: "Contas", icon: Landmark },
      { key: "contas_futuras", label: "Contas futuras", icon: CalendarClock },
      { key: "orcamento", label: "Orcamento", icon: Target },
      { key: "cartoes", label: "Cartoes", icon: CreditCard },
    ],
  },
  {
    title: "Investimentos",
    items: [
      { key: "patrimonio", label: "Meu patrimonio", icon: WalletCards },
      { key: "investimentos", label: "Investimentos", icon: BarChart3 },
      { key: "desempenho", label: "Desempenho", icon: LineChart },
      { key: "dividendos", label: "Dividendos", icon: Banknote },
      { key: "exterior", label: "Exterior/Dolar", icon: DollarSign },
    ],
  },
  {
    title: "Sistema",
    items: [
      { key: "relatorios", label: "Relatorios", icon: FileBarChart },
      { key: "configuracoes", label: "Configuracoes", icon: Settings },
      { key: "integracoes", label: "Integracoes", icon: Plug },
    ],
  },
];

export function Sidebar({ current, onNavigate }: { current: PageKey; onNavigate: (page: PageKey) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 border-r border-slate-800/90 bg-[#0a1017]/98 shadow-[12px_0_26px_rgba(0,0,0,0.14)] transition-all duration-200 lg:flex lg:flex-col",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-12 items-center gap-2.5 border-b border-slate-800/90 px-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand-400 to-cyan-500 text-white shadow-[0_8px_20px_rgba(34,197,94,0.18)]">
          <Landmark className="h-4 w-4" />
        </div>
        <div className={cn("min-w-0", collapsed && "hidden")}>
          <p className="truncate text-sm font-semibold text-slate-100">Central Financeira</p>
          <p className="truncate text-[11px] text-slate-500">Controle local</p>
        </div>
        <button
          className="ml-auto hidden h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200 xl:flex"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>
      <nav className="flex-1 space-y-3 overflow-y-auto p-2">
        {groups.map((group) => (
          <div key={group.title} className="space-y-1">
            <div
              className={cn(
                "px-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600",
                collapsed && "mx-auto h-px w-8 bg-slate-800 px-0 text-transparent",
              )}
              title={group.title}
            >
              {group.title}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = current === item.key;
                return (
                  <button
                    key={item.key}
                    className={cn(
                      "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] font-medium transition duration-150",
                      active
                        ? "bg-brand-500/15 text-brand-500 ring-1 ring-brand-500/25"
                        : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-100",
                      collapsed && "justify-center px-0",
                    )}
                    onClick={() => onNavigate(item.key)}
                    title={item.label}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className={cn("truncate", collapsed && "hidden")}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-2">
        <div className={cn("rounded-md bg-slate-900/80 px-2.5 py-2 text-[11px] text-slate-500", collapsed && "px-1 text-center")}>
          <div className="font-medium text-slate-300">{collapsed ? "DB" : "SQLite local"}</div>
          {!collapsed && <div>Dados neste computador</div>}
        </div>
      </div>
    </aside>
  );
}
