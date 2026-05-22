import { useQuery } from "@tanstack/react-query";
import { FinancialKPICard } from "../../components/finance/FinancialKPICard";
import { SectionCard } from "../../components/finance/SectionCard";
import { api } from "../../lib/api";
import { formatMoney } from "../../lib/formatters";
import { DollarSign, TrendingUp, TrendingDown } from "lucide-react";

interface ComparativosSectionProps {
  ano: number;
  mes: number;
}

export function ComparativosSection({ ano, mes }: ComparativosSectionProps) {
  // Query para comparativos mensais
  const evolucaoMeses = useQuery({
    queryKey: ["relatorios", "evolucao-mensal", ano - 1, mes, ano, mes],
    queryFn: () => {
      // Pegar dados dos últimos 12 meses
      const mesAnterior = mes === 1 ? 12 : mes - 1;
      const anoAnterior = mes === 1 ? ano - 1 : ano;

      return api.relEvolucaoMensal(anoAnterior, mesAnterior, ano, mes);
    },
  });

  // Calcular variações
  const dados = evolucaoMeses.data || [];
  if (dados.length < 2) {
    return (
      <SectionCard title="Comparativos">
        <p className="text-xs text-slate-500">Dados insuficientes para comparativos</p>
      </SectionCard>
    );
  }

  const mesAtual = dados[dados.length - 1];
  const mesPosterior = dados[dados.length - 2] || mesAtual;

  // Calcular variações percentuais
  const variacaoReceita = mesPosterior.receita > 0 ? ((mesAtual.receita - mesPosterior.receita) / mesPosterior.receita) * 100 : 0;
  const variacaoGasto = mesPosterior.gasto > 0 ? ((mesAtual.gasto - mesPosterior.gasto) / mesPosterior.gasto) * 100 : 0;
  const variacaoInvestimento = mesPosterior.investimento > 0 ? ((mesAtual.investimento - mesPosterior.investimento) / mesPosterior.investimento) * 100 : 0;
  const variacaoSaldo = mesPosterior.saldo > 0 ? ((mesAtual.saldo - mesPosterior.saldo) / mesPosterior.saldo) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Seção 5.1: Mês vs Mês */}
      <SectionCard title="Comparativo mês a mês" description="Como este mês se compara ao anterior">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <FinancialKPICard
            title="Receita"
            value={mesAtual.receita}
            trend={variacaoReceita}
            icon={<DollarSign className="h-4 w-4" />}
            tone="blue"
            description={`vs mês anterior: ${formatMoney(mesAtual.receita - mesPosterior.receita)}`}
          />
          <FinancialKPICard
            title="Gastos"
            value={mesAtual.gasto}
            trend={variacaoGasto}
            icon={<TrendingDown className="h-4 w-4" />}
            tone={variacaoGasto > 10 ? "red" : "default"}
            description={`vs mês anterior: ${formatMoney(mesAtual.gasto - mesPosterior.gasto)}`}
          />
          <FinancialKPICard
            title="Investimento"
            value={mesAtual.investimento}
            trend={variacaoInvestimento}
            icon={<TrendingUp className="h-4 w-4" />}
            tone="green"
            description={`vs mês anterior: ${formatMoney(mesAtual.investimento - mesPosterior.investimento)}`}
          />
          <FinancialKPICard
            title="Saldo"
            value={mesAtual.saldo}
            trend={variacaoSaldo}
            icon={<DollarSign className="h-4 w-4" />}
            tone={mesAtual.saldo > mesPosterior.saldo ? "green" : "red"}
            description={`vs mês anterior: ${formatMoney(mesAtual.saldo - mesPosterior.saldo)}`}
          />
        </div>
      </SectionCard>
    </div>
  );
}
