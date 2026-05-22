import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, Zap, BarChart3, Calendar } from "lucide-react";
import { useState } from "react";

import { FinancialKPICard } from "../components/finance/FinancialKPICard";
import { SectionCard } from "../components/finance/SectionCard";
import { api } from "../lib/api";
import { formatMoney, formatPercent } from "../lib/formatters";
import { currentMonth } from "../lib/utils";
import { GastosSection } from "../features/relatorios/GastosSection";
import { InvestimentosSection } from "../features/relatorios/InvestimentosSection";
import { ComparativosSection } from "../features/relatorios/ComparativosSection";
import { InsightsPanel } from "../features/relatorios/InsightsPanel";
import { PeriodSelector } from "../features/relatorios/PeriodSelector";

export function RelatoriosPage() {
  const [period, setPeriod] = useState<"mes" | "3meses" | "12meses" | "custom">("mes");
  const [showComparison, setShowComparison] = useState(true);
  const [customDates, setCustomDates] = useState<{ start: Date; end: Date } | null>(null);

  // Determinar período selecionado
  const now = new Date();
  let ano = now.getFullYear();
  let mes = now.getMonth() + 1;
  let anoInicio = ano;
  let mesInicio = mes;
  let anoFim = ano;
  let mesFim = mes;

  if (period === "3meses") {
    mesInicio = mes - 3;
    anoInicio = ano;
    if (mesInicio <= 0) {
      mesInicio += 12;
      anoInicio -= 1;
    }
  } else if (period === "12meses") {
    mesInicio = mes;
    anoInicio = ano - 1;
  } else if (period === "custom" && customDates) {
    anoInicio = customDates.start.getFullYear();
    mesInicio = customDates.start.getMonth() + 1;
    anoFim = customDates.end.getFullYear();
    mesFim = customDates.end.getMonth() + 1;
  }

  // Queries para KPIs
  const kpiAnoAtual = useQuery({
    queryKey: ["relatorios", "kpis", ano, mes],
    queryFn: async () => {
      const evolucao = await api.relEvolucaoMensal(ano, mes, ano, mes);
      return evolucao[0] || { receita: 0, gasto: 0, investimento: 0, saldo: 0 };
    },
  });

  const kpiMesAnterior = useQuery({
    queryKey: ["relatorios", "kpis-anterior", ano, mes],
    queryFn: async () => {
      const mesAnt = mes === 1 ? 12 : mes - 1;
      const anoAnt = mes === 1 ? ano - 1 : ano;
      const evolucao = await api.relEvolucaoMensal(anoAnt, mesAnt, anoAnt, mesAnt);
      return evolucao[0] || { receita: 0, gasto: 0, investimento: 0, saldo: 0 };
    },
    enabled: showComparison,
  });

  const insights = useQuery({
    queryKey: ["relatorios", "insights", ano, mes],
    queryFn: () => api.relInsights(ano, mes),
  });

  // Calcular KPIs
  const receita = kpiAnoAtual.data?.receita || 0;
  const gasto = kpiAnoAtual.data?.gasto || 0;
  const investimento = kpiAnoAtual.data?.investimento || 0;

  const receitaAnterior = kpiMesAnterior.data?.receita || 0;
  const gastoAnterior = kpiMesAnterior.data?.gasto || 0;
  const investimentoAnterior = kpiMesAnterior.data?.investimento || 0;

  // Taxa de economia
  const taxaEconomia = receita > 0 ? ((receita - gasto) / receita) * 100 : 0;
  const taxaEconomiaAnterior = receitaAnterior > 0 ? ((receitaAnterior - gastoAnterior) / receitaAnterior) * 100 : 0;
  const variacaoTaxaEconomia = taxaEconomiaAnterior > 0 ? ((taxaEconomia - taxaEconomiaAnterior) / taxaEconomiaAnterior) * 100 : 0;

  // Média de gasto (12 meses)
  const queryEvolucao = useQuery({
    queryKey: ["relatorios", "evolucao-12meses", ano, mes],
    queryFn: () => api.relEvolucaoMensal(ano - 1, mes, ano, mes),
  });

  const mediaGasto = queryEvolucao.data && queryEvolucao.data.length > 0 
    ? queryEvolucao.data.reduce((sum, item) => sum + item.gasto, 0) / queryEvolucao.data.length 
    : 0;

  // Variação de receita
  const variacaoReceita = receitaAnterior > 0 ? ((receita - receitaAnterior) / receitaAnterior) * 100 : 0;
  const variacaoGasto = gastoAnterior > 0 ? ((gasto - gastoAnterior) / gastoAnterior) * 100 : 0;
  const variacaoInvestimento = investimentoAnterior > 0 ? ((investimento - investimentoAnterior) / investimentoAnterior) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Painel de Insights */}
      {(insights.data?.length ?? 0) > 0 && (
        <InsightsPanel insights={insights.data || []} isLoading={insights.isLoading} />
      )}

      {/* KPIs Financeiros */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
        <FinancialKPICard
          title="Taxa de Economia"
          value={taxaEconomia}
          isPercentage
          trend={showComparison ? variacaoTaxaEconomia : undefined}
          icon={<Zap className="h-4 w-4" />}
          tone={taxaEconomia >= 20 ? "green" : taxaEconomia >= 10 ? "yellow" : "red"}
          alertThreshold={{ min: 20 }}
          description="% da receita que você economiza"
        />
        <FinancialKPICard
          title="Gastos Totais"
          value={gasto}
          trend={showComparison ? variacaoGasto : undefined}
          icon={<TrendingUp className="h-4 w-4" />}
          tone={variacaoGasto > 10 ? "red" : "default"}
          description={`Média: ${formatMoney(mediaGasto)}/mês`}
        />
        <FinancialKPICard
          title="Receita"
          value={receita}
          trend={showComparison ? variacaoReceita : undefined}
          icon={<DollarSign className="h-4 w-4" />}
          tone="blue"
          description="Receita total do período"
        />
        <FinancialKPICard
          title="Investimento"
          value={investimento}
          trend={showComparison ? variacaoInvestimento : undefined}
          icon={<BarChart3 className="h-4 w-4" />}
          tone="green"
          description="Aportado em investimentos"
        />
        <FinancialKPICard
          title="Saldo Livre"
          value={receita - gasto - investimento}
          icon={<Calendar className="h-4 w-4" />}
          tone={receita - gasto - investimento > 0 ? "green" : "red"}
          description="Receita - Gastos - Investimento"
        />
      </div>

      {/* Filtros e Período */}
      <SectionCard title="Período e Comparação" description="Ajuste o período de análise e compare com períodos anteriores">
        <PeriodSelector
          selectedPeriod={period}
          onPeriodChange={setPeriod}
          onDateRangeChange={(start, end) => setCustomDates({ start, end })}
          showComparison
          onComparisonToggle={setShowComparison}
          comparisonEnabled={showComparison}
        />
      </SectionCard>

      {/* Seção de Gastos */}
      <GastosSection ano={ano} mes={mes} showComparison={showComparison} />

      {/* Seção de Investimentos */}
      <InvestimentosSection ano={ano} mes={mes} />

      {/* Seção de Comparativos */}
      <ComparativosSection ano={ano} mes={mes} />
    </div>
  );
}

