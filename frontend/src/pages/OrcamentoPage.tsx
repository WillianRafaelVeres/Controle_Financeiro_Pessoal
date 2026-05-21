import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Target } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "../components/finance/EmptyState";
import { MonthSelector } from "../components/finance/MonthSelector";
import { SectionCard } from "../components/finance/SectionCard";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Td, Th, Table } from "../components/ui/table";
import { AdicionarItemOrcamentoModal } from "../features/orcamento/AdicionarItemOrcamentoModal";
import { OrcamentoTable } from "../features/orcamento/OrcamentoTable";
import { api } from "../lib/api";
import { formatMoney, formatPercent, toNumber } from "../lib/formatters";
import type { NaturezaCategoria, PlanejamentoNaoPlanejado } from "../lib/types";
import { currentMonth } from "../lib/utils";

export function OrcamentoPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [openAdicionarModal, setOpenAdicionarModal] = useState(false);
  const [initialItem, setInitialItem] = useState<{
    natureza: NaturezaCategoria;
    categoria_id?: string;
    subcategoria_id?: string | null;
  } | null>(null);
  const [copyPrompt, setCopyPrompt] = useState(false);

  const planejamento = useQuery({
    queryKey: ["planejamento", "resumo", month],
    queryFn: () => api.planejamentoResumo(month.ano, month.mes),
  });

  const copiarMes = useMutation({
    mutationFn: (modo: string) => api.copiarMesAnteriorOrcamento(month.ano, month.mes, modo),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const resumo = planejamento.data;
  const receitas = resumo?.itens_receitas ?? [];
  const gastos = resumo?.itens_gastos ?? [];
  const investimentos = resumo?.itens_investimentos ?? [];
  const dados = [...receitas, ...gastos, ...investimentos];
  const receitasFora = resumo?.receitas_nao_planejadas ?? [];
  const gastosFora = resumo?.gastos_nao_planejados ?? [];
  const investimentosFora = resumo?.investimentos_nao_planejados ?? [];
  const fora = [...receitasFora, ...gastosFora, ...investimentosFora];

  const receitasPlanejadas = toNumber(resumo?.receitas_planejadas);
  const receitasPlanejadasRealizadas = toNumber(resumo?.receitas_executadas);
  const receitasNaoPlanejadasTotal = toNumber(resumo?.receitas_nao_planejadas_total);
  const receitasRealizadas = receitasPlanejadasRealizadas + receitasNaoPlanejadasTotal;
  const gastosPlanejados = toNumber(resumo?.gastos_planejados);
  const gastosPlanejadosRealizados = toNumber(resumo?.gastos_executados);
  const gastosNaoPlanejadosTotal = toNumber(resumo?.gastos_nao_planejados_total);
  const gastosRealizados = gastosPlanejadosRealizados + gastosNaoPlanejadosTotal;
  const investimentosPlanejados = toNumber(resumo?.investimentos_planejados);
  const investimentosPlanejadosRealizados = toNumber(resumo?.investimentos_executados);
  const investimentosNaoPlanejadosTotal = toNumber(resumo?.investimentos_nao_planejados_total);
  const investimentosRealizados = investimentosPlanejadosRealizados + investimentosNaoPlanejadosTotal;
  const totalPlanejado = toNumber(resumo?.planejado_total);
  const totalExecutado = toNumber(resumo?.executado_total_com_nao_planejado) || gastosRealizados + investimentosRealizados;
  const totalExecutadoPlanejado = gastosPlanejadosRealizados + investimentosPlanejadosRealizados;
  const totalExecutadoFora = gastosNaoPlanejadosTotal + investimentosNaoPlanejadosTotal;

  function openAdd(item?: PlanejamentoNaoPlanejado) {
    setInitialItem(
      item
        ? {
            natureza: item.natureza,
            categoria_id: item.categoria_id,
            subcategoria_id: item.subcategoria_id,
          }
        : null,
    );
    setOpenAdicionarModal(true);
  }

  function handleCopy() {
    if (dados.length > 0) {
      setCopyPrompt(true);
      return;
    }
    copiarMes.mutate("AUSENTES");
  }

  return (
    <div className="space-y-2">
      <SectionCard
        title="Planejamento mensal"
        description="Planejado x executado, sem misturar gastos comuns com investimentos."
        action={
          <div className="flex flex-wrap gap-2">
            <MonthSelector ano={month.ano} mes={month.mes} onChange={setMonth} />
            <Button variant="secondary" size="sm" onClick={handleCopy} disabled={copiarMes.isPending}>
              <Copy className="h-4 w-4" />
              Copiar mes anterior
            </Button>
            <Button size="sm" onClick={() => openAdd()}>
              <Plus className="h-4 w-4" />
              Adicionar item
            </Button>
          </div>
        }
      >
        {dados.length === 0 && fora.length === 0 ? (
          <EmptyState
            icon={<Target className="h-6 w-6" />}
            title="Nenhum item no planejamento deste mes."
            description="Adicione categorias ou subcategorias que voce deseja controlar mensalmente."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => openAdd()}>
                  <Plus className="h-4 w-4" />
                  Adicionar item
                </Button>
                <Button variant="secondary" onClick={handleCopy} disabled={copiarMes.isPending}>
                  <Copy className="h-4 w-4" />
                  Copiar mes anterior
                </Button>
              </div>
            }
          />
        ) : (
          <ResumoMes
            totalPlanejado={totalPlanejado}
            totalExecutado={totalExecutado}
            totalExecutadoPlanejado={totalExecutadoPlanejado}
            totalExecutadoFora={totalExecutadoFora}
            receitasPlanejadas={receitasPlanejadas}
            receitasPlanejadasRealizadas={receitasPlanejadasRealizadas}
            receitasNaoPlanejadasTotal={receitasNaoPlanejadasTotal}
            receitasRealizadas={receitasRealizadas}
            gastosPlanejados={gastosPlanejados}
            gastosPlanejadosRealizados={gastosPlanejadosRealizados}
            gastosNaoPlanejadosTotal={gastosNaoPlanejadosTotal}
            gastosRealizados={gastosRealizados}
            investimentosPlanejados={investimentosPlanejados}
            investimentosPlanejadosRealizados={investimentosPlanejadosRealizados}
            investimentosNaoPlanejadosTotal={investimentosNaoPlanejadosTotal}
            investimentosRealizados={investimentosRealizados}
          />
        )}
      </SectionCard>

      <SectionCard title="Planejamento de recebimentos" description="Receitas que voce espera receber no mes.">
        <OrcamentoTable data={receitas} natureza="RECEITA" />
      </SectionCard>

      <SectionCard title="Orcamento de gastos" description="Itens planejados de natureza GASTO.">
        <OrcamentoTable data={gastos} natureza="GASTO" />
      </SectionCard>

      <SectionCard title="Planejamento de investimentos" description="Aportes planejados separados dos gastos comuns.">
        <OrcamentoTable data={investimentos} natureza="INVESTIMENTO" />
      </SectionCard>

      <NaoPlanejadosSection title="Recebimentos nao planejados" itens={receitasFora} onAdd={openAdd} />
      <NaoPlanejadosSection title="Gastos nao planejados" itens={gastosFora} onAdd={openAdd} />
      <NaoPlanejadosSection title="Investimentos nao planejados" itens={investimentosFora} onAdd={openAdd} />

      <AdicionarItemOrcamentoModal
        open={openAdicionarModal}
        ano={month.ano}
        mes={month.mes}
        initialItem={initialItem}
        onClose={() => setOpenAdicionarModal(false)}
        onSuccess={() => {
          setOpenAdicionarModal(false);
          setInitialItem(null);
          queryClient.invalidateQueries({ queryKey: ["planejamento"] });
          queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
        }}
      />

      <Dialog open={copyPrompt} title="Copiar mes anterior" onClose={() => setCopyPrompt(false)}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">O mes atual ja possui itens planejados. O que deseja fazer?</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setCopyPrompt(false)}>
              Cancelar
            </Button>
            <Button
              variant="secondary"
              disabled={copiarMes.isPending}
              onClick={() => {
                copiarMes.mutate("AUSENTES");
                setCopyPrompt(false);
              }}
            >
              Copiar apenas ausentes
            </Button>
            <Button
              variant="danger"
              disabled={copiarMes.isPending}
              onClick={() => {
                copiarMes.mutate("SUBSTITUIR");
                setCopyPrompt(false);
              }}
            >
              Substituir planejamento do mes
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function ResumoMes({
  totalPlanejado,
  totalExecutado,
  totalExecutadoPlanejado,
  totalExecutadoFora,
  receitasPlanejadas,
  receitasPlanejadasRealizadas,
  receitasNaoPlanejadasTotal,
  receitasRealizadas,
  gastosPlanejados,
  gastosPlanejadosRealizados,
  gastosNaoPlanejadosTotal,
  gastosRealizados,
  investimentosPlanejados,
  investimentosPlanejadosRealizados,
  investimentosNaoPlanejadosTotal,
  investimentosRealizados,
}: {
  totalPlanejado: number;
  totalExecutado: number;
  totalExecutadoPlanejado: number;
  totalExecutadoFora: number;
  receitasPlanejadas: number;
  receitasPlanejadasRealizadas: number;
  receitasNaoPlanejadasTotal: number;
  receitasRealizadas: number;
  gastosPlanejados: number;
  gastosPlanejadosRealizados: number;
  gastosNaoPlanejadosTotal: number;
  gastosRealizados: number;
  investimentosPlanejados: number;
  investimentosPlanejadosRealizados: number;
  investimentosNaoPlanejadosTotal: number;
  investimentosRealizados: number;
}) {
  const disponivel = totalPlanejado - totalExecutado;
  const percentual = totalPlanejado > 0 ? (totalExecutado / totalPlanejado) * 100 : 0;
  const progress = Math.min(percentual, 100);
  const tone = percentual > 100 ? "bg-danger-600" : percentual >= 85 ? "bg-amber-500" : "bg-brand-500";
  const saldoPrevisto = receitasPlanejadas - gastosPlanejados;
  const saldoAtual = receitasRealizadas - gastosRealizados;

  return (
    <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase text-slate-500">Resumo do mes</p>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <SummaryMetric label="Receber plan." value={formatMoney(receitasPlanejadas)} />
          <SummaryMetric label="Recebido" value={formatMoney(receitasRealizadas)} />
          <SummaryMetric label="Gastar plan." value={formatMoney(gastosPlanejados)} />
          <SummaryMetric label="Gasto" value={formatMoney(gastosRealizados)} danger={gastosRealizados > gastosPlanejados && gastosPlanejados > 0} />
          <SummaryMetric label="Saldo previsto" value={formatMoney(saldoPrevisto)} danger={saldoPrevisto < 0} />
          <SummaryMetric label="Saldo atual" value={formatMoney(saldoAtual)} danger={saldoAtual < 0} />
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div className={`h-full rounded-full ${tone}`} style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="overflow-hidden rounded-md border border-slate-800 text-[12px]">
        <div className="grid grid-cols-[1fr_repeat(4,minmax(72px,auto))] gap-2 bg-slate-900 px-2 py-1.5 text-[11px] font-semibold uppercase text-slate-500">
          <span>Tipo</span>
          <span className="text-right">Planejado</span>
          <span className="text-right">Dentro</span>
          <span className="text-right">Fora</span>
          <span className="text-right">Total</span>
        </div>
        <ExecutionBreakdown
          label="Recebimentos"
          planned={receitasPlanejadas}
          inside={receitasPlanejadasRealizadas}
          outside={receitasNaoPlanejadasTotal}
          total={receitasRealizadas}
        />
        <ExecutionBreakdown
          label="Gastos"
          planned={gastosPlanejados}
          inside={gastosPlanejadosRealizados}
          outside={gastosNaoPlanejadosTotal}
          total={gastosRealizados}
        />
        <ExecutionBreakdown
          label="Investimentos"
          planned={investimentosPlanejados}
          inside={investimentosPlanejadosRealizados}
          outside={investimentosNaoPlanejadosTotal}
          total={investimentosRealizados}
        />
      </div>
    </div>
  );
}

function ExecutionBreakdown({ label, planned, inside, outside, total }: {
  label: string;
  planned: number;
  inside: number;
  outside: number;
  total: number;
}) {
  return (
    <div className="grid grid-cols-[1fr_repeat(4,minmax(72px,auto))] gap-2 border-t border-slate-800 px-2 py-1.5">
      <span className="font-medium text-slate-300">{label}</span>
      <Value value={planned} />
      <Value value={inside} />
      <Value value={outside} danger={outside > 0} />
      <Value value={total} strong />
    </div>
  );
}

function Value({ value, danger, strong }: { value: number; danger?: boolean; strong?: boolean }) {
  const className = danger ? "text-right font-semibold text-amber-300" : strong ? "text-right font-semibold text-slate-100" : "text-right text-slate-300";
  return <span className={className}>{formatMoney(value)}</span>;
}

function SummaryMetric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="min-w-0 border-l border-slate-800 pl-2 first:border-l-0 first:pl-0">
      <p className="truncate text-[11px] font-medium text-slate-500">{label}</p>
      <p className={danger ? "mt-0.5 truncate text-base font-semibold text-danger-600" : "mt-0.5 truncate text-base font-semibold text-slate-100"}>{value}</p>
    </div>
  );
}

function NaoPlanejadosSection({
  title,
  itens,
  onAdd,
}: {
  title: string;
  itens: PlanejamentoNaoPlanejado[];
  onAdd: (item: PlanejamentoNaoPlanejado) => void;
}) {
  if (itens.length === 0) return null;

  return (
    <SectionCard title={title} description="Lancamentos executados no mes que ainda nao fazem parte do planejamento.">
      <Table className="min-w-0">
        <thead>
          <tr>
            <Th>Item</Th>
            <Th className="text-right">Executado</Th>
            <Th className="text-right">Lancamentos</Th>
            <Th className="w-[72px] text-center">Acoes</Th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={`${item.natureza}-${item.categoria_id}-${item.subcategoria_id ?? "categoria"}`}>
              <Td className="font-medium text-slate-950">{item.subcategoria ? `${item.categoria} > ${item.subcategoria}` : item.categoria}</Td>
              <Td className="text-right">{formatMoney(item.valor_realizado)}</Td>
              <Td className="text-right">{item.quantidade_lancamentos}</Td>
              <Td>
                <Button size="icon" variant="secondary" title="Adicionar ao planejamento" aria-label="Adicionar ao planejamento" onClick={() => onAdd(item)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </SectionCard>
  );
}
