import { CheckCircle2, TriangleAlert } from "lucide-react";

import { SectionCard } from "../../components/finance/SectionCard";
import { formatMoney, toNumber } from "../../lib/formatters";

export function ConciliacaoBox({ data }: { data?: Record<string, string | number> }) {
  const diferenca = toNumber(data?.diferenca_nao_explicada ?? data?.diferenca_conciliacao);
  const saldoFinal = data?.saldo_final ?? data?.saldo_explicado;
  const ok = Math.abs(diferenca) < 0.01;
  const alerta = ok
    ? "Tudo conciliado."
    : diferenca > 0
      ? `Existem ${formatMoney(Math.abs(diferenca))} a mais na conta.`
      : `Existem ${formatMoney(Math.abs(diferenca))} a menos na conta.`;

  return (
    <SectionCard title="Conciliacao" description="Conferencia entre o saldo real informado e os valores do sistema.">
      <div className="space-y-2 text-[13px]">
        <Line label="Saldo em contas" value={data?.saldo_em_contas_informado ?? data?.saldo_em_contas} />
        <Line label="Saldo livre" value={data?.saldo_livre} highlight />
        <Line label="Reservado cartao" value={data?.reservado_cartao} />
        <Line label="Contas futuras" value={data?.reservado_contas_futuras} />
        <Line label="Saldo final" value={saldoFinal} />
        <div className="border-t border-slate-800 pt-2">
          <Line label="Diferenca" value={data?.diferenca_nao_explicada ?? data?.diferenca_conciliacao} strong />
        </div>
        <div
          className={
            ok
              ? "flex items-center gap-2 rounded-md bg-brand-500/15 p-2 text-brand-500"
              : "flex items-center gap-2 rounded-md bg-amber-500/15 p-2 text-amber-400"
          }
        >
          {ok ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
          <span className="font-medium">{alerta}</span>
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
    <div className={highlight ? "flex items-center justify-between gap-4 rounded-md bg-brand-500/10 px-2 py-1.5" : "flex items-center justify-between gap-4"}>
      <span className={strong || highlight ? "font-semibold text-slate-100" : "text-slate-400"}>{label}</span>
      <span className={strong || highlight ? "font-semibold text-slate-100" : "text-slate-200"}>{formatMoney(value)}</span>
    </div>
  );
}
