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
} from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/utils";
import type { PageKey } from "../../pages/pageTypes";

const items: Array<{ key: PageKey; label: string; icon: typeof Gauge }> = [
  { key: "dashboard", label: "Painel", icon: Gauge },
  { key: "lancamentos", label: "Lançamentos", icon: ReceiptText },
  { key: "contas", label: "Contas", icon: Landmark },
  { key: "contas_futuras", label: "Contas futuras", icon: CalendarClock },
  { key: "orcamento", label: "Orçamento", icon: Target },
  { key: "cartoes", label: "Cartões", icon: CreditCard },
  { key: "investimentos", label: "Investimentos", icon: BarChart3 },
  { key: "desempenho", label: "Desempenho", icon: LineChart },
  { key: "dividendos", label: "Dividendos", icon: Banknote },
  { key: "exterior", label: "Exterior/Dólar", icon: DollarSign },
  { key: "relatorios", label: "Relatórios", icon: FileBarChart },
  { key: "configuracoes", label: "Configurações", icon: Settings },
  { key: "integracoes", label: "Integrações", icon: Plug },
];

export function Sidebar({ current, onNavigate }: { current: PageKey; onNavigate: (page: PageKey) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 border-r border-slate-800 bg-[#0b1118] transition-all lg:flex lg:flex-col",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-12 items-center gap-2.5 border-b border-slate-800 px-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-500 text-white">
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
      <nav className="flex-1 space-y-0.5 p-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = current === item.key;
          return (
            <button
              key={item.key}
              className={cn(
                "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] font-medium transition",
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
