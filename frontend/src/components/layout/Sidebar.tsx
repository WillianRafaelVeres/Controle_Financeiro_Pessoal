import {
  BarChart3,
  Archive,
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

const APP_LOGO_SRC = "/app-icon.png";

const groups: Array<{ title: string; items: Array<{ key: PageKey; label: string; icon: typeof Gauge }> }> = [
  {
    title: "Financeiro geral",
    items: [
      { key: "dashboard", label: "Painel", icon: Gauge },
      { key: "lancamentos", label: "Lançamentos", icon: ReceiptText },
      { key: "contas", label: "Contas", icon: Landmark },
      { key: "contas_futuras", label: "Contas futuras", icon: CalendarClock },
      { key: "dinheiro_separado", label: "Dinheiro separado", icon: Archive },
      { key: "orcamento", label: "Orçamento", icon: Target },
      { key: "cartoes", label: "Cartões", icon: CreditCard },
    ],
  },
  {
    title: "Investimentos",
    items: [
      { key: "patrimonio", label: "Meu patrimônio", icon: WalletCards },
      { key: "investimentos", label: "Investimentos", icon: BarChart3 },
      { key: "desempenho", label: "Desempenho", icon: LineChart },
      { key: "dividendos", label: "Dividendos", icon: Banknote },
      { key: "exterior", label: "Exterior/Dólar", icon: DollarSign },
    ],
  },
  {
    title: "Sistema",
    items: [
      { key: "relatorios", label: "Relatórios", icon: FileBarChart },
      { key: "configuracoes", label: "Configurações", icon: Settings },
      { key: "integracoes", label: "Integrações", icon: Plug },
    ],
  },
];

export function Sidebar({ current, onNavigate }: { current: PageKey; onNavigate: (page: PageKey) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside
      className={cn(
        "sticky top-0 z-30 hidden h-screen max-h-screen shrink-0 self-start overflow-hidden border-r border-white/10 bg-slate-900/[0.58] shadow-[18px_0_60px_rgba(0,0,0,0.28)] ring-1 ring-inset ring-white/[0.04] backdrop-blur-2xl transition-all duration-200 lg:flex lg:flex-col",
        collapsed ? "w-[76px]" : "w-[260px]",
      )}
    >
      <div className={cn("flex h-16 items-center gap-3 border-b border-white/10 px-3.5", collapsed && "justify-center px-2")}>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-emerald-300/25 bg-slate-950/70 shadow-[0_0_30px_rgba(34,197,94,0.24),inset_0_1px_0_rgba(255,255,255,0.16)]">
          <img src={APP_LOGO_SRC} alt="" className="h-full w-full object-cover" draggable={false} />
        </div>
        <div className={cn("min-w-0", collapsed && "hidden")}>
          <p className="truncate text-sm font-semibold text-slate-100">Central Financeira</p>
          <p className="truncate text-[12px] text-slate-400">Controle local</p>
        </div>
        <button
          className="ml-auto hidden h-8 w-8 items-center justify-center rounded-xl border border-transparent text-slate-400 transition hover:border-white/10 hover:bg-white/[0.08] hover:text-slate-100 xl:flex"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-3">
        {groups.map((group) => (
          <div key={group.title} className="space-y-1">
            <div
              className={cn(
                "px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400/[0.78]",
                collapsed && "mx-auto h-px w-9 bg-white/10 px-0 pb-0 text-transparent",
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
                      "group flex min-h-11 w-full items-center gap-2.5 rounded-2xl px-2.5 text-left text-[14px] font-semibold transition duration-150",
                      active
                        ? "bg-gradient-to-r from-emerald-400/30 via-brand-500/20 to-emerald-300/10 text-emerald-100 ring-1 ring-emerald-300/30 shadow-[0_0_32px_rgba(34,197,94,0.26)]"
                        : "text-slate-400 hover:bg-white/[0.07] hover:text-slate-100",
                      collapsed && "justify-center px-0",
                    )}
                    onClick={() => onNavigate(item.key)}
                    title={item.label}
                    aria-label={accessibleLabel(item.label)}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition",
                        active ? "bg-emerald-300/[0.16] text-emerald-200" : "text-slate-500 group-hover:bg-white/[0.08] group-hover:text-slate-200",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className={cn("truncate", collapsed && "hidden")}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className={cn("rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2.5 text-[12px] text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]", collapsed && "px-1 text-center")}>
          <div className="font-semibold text-slate-100">{collapsed ? "DB" : "SQLite local"}</div>
          {!collapsed && <div>Dados neste computador</div>}
        </div>
      </div>
    </aside>
  );
}

function accessibleLabel(label: string) {
  return label.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
