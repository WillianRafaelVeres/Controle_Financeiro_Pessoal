import { CheckCircle2, TriangleAlert } from "lucide-react";

import { SectionCard } from "../../components/finance/SectionCard";
import { formatMoney, toNumber } from "../../lib/formatters";
import type { DashboardResumo } from "../../lib/types";

type ConciliacaoData = Partial<DashboardResumo> & {
  diferenca_nao_explicada?: string | number;
};

export function ConciliacaoBox({ data }: { data?: ConciliacaoData }) {
  const diferenca = toNumber(data?.diferenca_nao_explicada ?? data?.diferenca_conciliacao);
  const saldoFinal = data?.saldo_final ?? data?.saldo_explicado;
  const ok = Math.abs(diferenca) < 0.01;
  const alerta = ok
    ? "Tudo conciliado."
    : diferenca > 0
      ? `Existem ${formatMoney(Math.abs(diferenca))} a mais na conta.`
      : `Existem ${formatMoney(Math.abs(diferenca))} a menos na conta.`;

  return (
    <SectionCard title="Conciliação" description="Confere se o saldo informado nas contas bate com o saldo explicado pelo app.">
      <div className="space-y-2.5 text-[13px]">
        <Line label="Saldo em contas" value={data?.saldo_em_contas_informado ?? data?.saldo_em_contas} />
        <Line label="Saldo livre" value={data?.saldo_livre} highlight />
        <Line label="Reservado cartão" value={data?.reservado_cartao} />
        <Line label="Contas futuras" value={data?.reservado_contas_futuras} />
        <Line label="Dinheiro separado" value={data?.reservado_caixinhas} />
        <Line label="Saldo final" value={saldoFinal} />
        <div className="border-t border-slate-800 pt-2">
          <Line label="Diferença" value={data?.diferenca_nao_explicada ?? data?.diferenca_conciliacao} strong />
        </div>
        <div
          className={
            ok
              ? "flex items-center gap-2 rounded-xl border border-brand-500/25 bg-brand-500/15 px-3 py-2.5 text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              : "flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/15 px-3 py-2.5 text-amber-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          }
        >
          {ok ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
          <span className="font-medium leading-5">{alerta}</span>
        </div>
      </div>
    </SectionCard>
  );
}

function Line({
  label,
  value,
  strong,
  highlight,
}: {
  label: string;
  value?: string | number;
  strong?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? "flex items-center justify-between gap-4 rounded-xl border border-brand-500/15 bg-brand-500/[0.12] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" : "flex items-center justify-between gap-4 px-1 py-0.5"}>
      <span className={strong || highlight ? "font-semibold text-slate-100" : "text-slate-400"}>{label}</span>
      <span className={strong || highlight ? "font-semibold text-slate-100" : "text-slate-200"}>{formatMoney(value)}</span>
    </div>
  );
}
