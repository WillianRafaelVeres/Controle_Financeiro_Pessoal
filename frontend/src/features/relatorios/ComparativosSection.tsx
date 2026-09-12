import { useQuery } from "@tanstack/react-query";
import { FinancialKPICard } from "../../components/finance/FinancialKPICard";
import { SectionCard } from "../../components/finance/SectionCard";
import { api } from "../../lib/api";
import { formatMoney } from "../../lib/formatters";
import { DollarSign, TrendingUp, TrendingDown, Award, Sparkles, CheckCircle2 } from "lucide-react";

interface ComparativosSectionProps {
  ano: number;
  mes: number;
}

export function ComparativosSection({ ano, mes }: ComparativosSectionProps) {
  // Query para histórico dos últimos 12 meses
  const evolucaoMeses = useQuery({
    queryKey: ["relatorios", "evolucao-mensal", ano, mes],
    queryFn: () => {
      let aIni = ano;
      let mIni = mes - 11;
      while (mIni <= 0) {
        aIni -= 1;
        mIni += 12;
      }
      return api.relEvolucaoMensal(aIni, mIni, ano, mes);
    },
  });

  const dados = evolucaoMeses.data || [];
  if (dados.length === 0) {
    return (
      <SectionCard title="Comparativos">
        <p className="text-xs text-slate-500">Dados insuficientes para comparativos</p>
      </SectionCard>
    );
  }

  // Identificar mês atual e mês anterior selecionados
  const mesAtual = dados.find((d) => d.ano === ano && d.mes === mes) || dados[dados.length - 1];
  const mesIndex = dados.findIndex((d) => d.ano === mesAtual.ano && d.mes === mesAtual.mes);
  const mesAnterior = mesIndex > 0 ? dados[mesIndex - 1] : (dados.length >= 2 ? dados[dados.length - 2] : null);

  // Variações vs mês anterior
  const variacaoReceita = mesAnterior && mesAnterior.receita > 0
    ? ((mesAtual.receita - mesAnterior.receita) / mesAnterior.receita) * 100
    : 0;
  const variacaoGasto = mesAnterior && mesAnterior.gasto > 0
    ? ((mesAtual.gasto - mesAnterior.gasto) / mesAnterior.gasto) * 100
    : 0;
  const variacaoInvestimento = mesAnterior && mesAnterior.investimento > 0
    ? ((mesAtual.investimento - mesAnterior.investimento) / mesAnterior.investimento) * 100
    : 0;
  const variacaoSaldo = mesAnterior && mesAnterior.saldo !== 0
    ? ((mesAtual.saldo - mesAnterior.saldo) / Math.abs(mesAnterior.saldo)) * 100
    : 0;

  // Métricas motivacionais
  const difGasto = mesAnterior ? mesAtual.gasto - mesAnterior.gasto : 0;
  const taxaInvestimentoAtual = mesAtual.receita > 0 ? (mesAtual.investimento / mesAtual.receita) * 100 : 0;
  const mesesComReceita = dados.filter((d) => d.receita > 0);
  const mediaInvestimento = mesesComReceita.length > 0
    ? mesesComReceita.reduce((acc, d) => acc + (d.investimento / d.receita) * 100, 0) / mesesComReceita.length
    : taxaInvestimentoAtual;

  return (
    <div className="space-y-4">
      {/* Seção 5.1: Mês vs Mês */}
      <SectionCard title="Comparativo mês a mês" description="Como este mês se compara ao anterior com números e metas claras">
        {/* Badges de Feedback Motivacional */}
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {mesAnterior ? (
            difGasto <= 0 ? (
              <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                <Sparkles className="h-5 w-5 shrink-0 text-emerald-400" />
                <div>
                  <span className="font-semibold text-emerald-300">Economia no período:</span>{" "}
                  Você gastou <strong>{formatMoney(Math.abs(difGasto))}</strong> a menos que no mês anterior! Continue assim!
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <TrendingUp className="h-5 w-5 shrink-0 text-amber-400" />
                <div>
                  <span className="font-semibold text-amber-300">Atenção aos gastos:</span>{" "}
                  Seus gastos aumentaram <strong>{formatMoney(difGasto)}</strong> em relação ao mês anterior.
                </div>
              </div>
            )
          ) : (
            <div className="flex items-center gap-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-400" />
              <div>
                <span className="font-semibold text-blue-300">Primeiro mês registrado!</span>{" "}
                Mantenha suas movimentações em dia para acompanhar a evolução comparativa.
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200">
            <Award className="h-5 w-5 shrink-0 text-blue-400" />
            <div>
              <span className="font-semibold text-blue-300">Taxa de investimento:</span>{" "}
              Você investiu <strong>{taxaInvestimentoAtual.toFixed(0)}%</strong> da sua receita neste mês{" "}
              {dados.length > 1 && (
                <span className="text-slate-400">(média recente de {mediaInvestimento.toFixed(0)}%)</span>
              )}.
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <FinancialKPICard
            title="Receita"
            value={mesAtual.receita}
            trend={mesAnterior ? variacaoReceita : undefined}
            icon={<DollarSign className="h-4 w-4" />}
            tone="blue"
            description={mesAnterior ? `vs mês anterior: ${formatMoney(mesAtual.receita - mesAnterior.receita)}` : "Mês atual"}
          />
          <FinancialKPICard
            title="Gastos"
            value={mesAtual.gasto}
            trend={mesAnterior ? variacaoGasto : undefined}
            icon={<TrendingDown className="h-4 w-4" />}
            tone={variacaoGasto > 10 ? "red" : "default"}
            description={mesAnterior ? `vs mês anterior: ${formatMoney(mesAtual.gasto - mesAnterior.gasto)}` : "Mês atual"}
          />
          <FinancialKPICard
            title="Investimento"
            value={mesAtual.investimento}
            trend={mesAnterior ? variacaoInvestimento : undefined}
            icon={<TrendingUp className="h-4 w-4" />}
            tone="green"
            description={mesAnterior ? `vs mês anterior: ${formatMoney(mesAtual.investimento - mesAnterior.investimento)}` : "Mês atual"}
          />
          <FinancialKPICard
            title="Saldo"
            value={mesAtual.saldo}
            trend={mesAnterior ? variacaoSaldo : undefined}
            icon={<DollarSign className="h-4 w-4" />}
            tone={mesAtual.saldo >= (mesAnterior?.saldo ?? 0) ? "green" : "red"}
            description={mesAnterior ? `vs mês anterior: ${formatMoney(mesAtual.saldo - mesAnterior.saldo)}` : "Mês atual"}
          />
        </div>
      </SectionCard>
    </div>
  );
}
