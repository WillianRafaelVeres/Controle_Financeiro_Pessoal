import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy, Plus, Target, TrendingDown, TrendingUp } from "lucide-react";
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
import { formatMoney, toNumber } from "../lib/formatters";
import { invalidatePlanningData } from "../lib/queryInvalidation";
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
    onSuccess: () => invalidatePlanningData(queryClient),
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
  const saldoPrevisto = receitasPlanejadas - gastosPlanejados;
  const saldoAtual = receitasRealizadas - gastosRealizados;

  return (
    <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <PlanningCard kind="receita" title="Recebimentos" planned={receitasPlanejadas} actual={receitasRealizadas} />
        <PlanningCard kind="gasto" title="Gastos" planned={gastosPlanejados} actual={gastosRealizados} />
        <PlanningCard kind="investimento" title="Investimentos" planned={investimentosPlanejados} actual={investimentosRealizados} />
        <PlanningCard kind="saldo" title="Saldo operacional" planned={saldoPrevisto} actual={saldoAtual} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-800 text-[12px]">
        <div className="min-w-[520px]">
          <div className="grid grid-cols-[1fr_repeat(4,minmax(72px,auto))] gap-2 bg-slate-900 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500">
            <span>Tipo</span>
            <span className="text-right">Planejado</span>
            <span className="text-right">Dentro</span>
            <span className="text-right">Fora</span>
            <span className="text-right">Total</span>
          </div>
          <ExecutionBreakdown
            label="Recebimentos"
            natureza="RECEITA"
            planned={receitasPlanejadas}
            inside={receitasPlanejadasRealizadas}
            outside={receitasNaoPlanejadasTotal}
            total={receitasRealizadas}
          />
          <ExecutionBreakdown
            label="Gastos"
            natureza="GASTO"
            planned={gastosPlanejados}
            inside={gastosPlanejadosRealizados}
            outside={gastosNaoPlanejadosTotal}
            total={gastosRealizados}
          />
          <ExecutionBreakdown
            label="Investimentos"
            natureza="INVESTIMENTO"
            planned={investimentosPlanejados}
            inside={investimentosPlanejadosRealizados}
            outside={investimentosNaoPlanejadosTotal}
            total={investimentosRealizados}
          />
        </div>
      </div>
    </div>
  );
}

type PlanningKind = "receita" | "gasto" | "investimento" | "saldo";

function PlanningCard({ kind, title, planned, actual }: { kind: PlanningKind; title: string; planned: number; actual: number }) {
  const status = planningStatus(kind, planned, actual);
  const progressBase = Math.abs(planned);
  const progress = progressBase > 0 ? Math.min(Math.abs(actual) / progressBase * 100, 100) : actual !== 0 ? 100 : 0;
  const Icon = status.good ? CheckCircle2 : status.bad ? AlertTriangle : kind === "gasto" ? TrendingDown : TrendingUp;
  const toneClass = status.bad
    ? "border-danger-600/35 bg-danger-600/10 text-danger-600"
    : status.good
      ? "border-brand-500/25 bg-brand-500/10 text-brand-400"
      : "border-amber-500/25 bg-amber-500/10 text-amber-300";
  const barClass = status.bad ? "bg-danger-600" : status.good ? "bg-brand-500" : "bg-amber-500";

  return (
    <section className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-slate-500">{title}</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">{formatMoney(actual)}</p>
          <p className="mt-0.5 text-xs text-slate-500">Planejado: {formatMoney(planned)}</p>
        </div>
        <Icon className="h-5 w-5 shrink-0" />
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium">{status.label}</span>
        <span className="text-slate-400">{status.deltaLabel}</span>
      </div>
    </section>
  );
}

function planningStatus(kind: PlanningKind, planned: number, actual: number) {
  if (kind === "receita") {
    const delta = actual - planned;
    if (planned <= 0 && actual > 0) return { good: true, bad: false, label: "Receita extra", deltaLabel: `+${formatMoney(delta)}` };
    if (actual >= planned) return { good: true, bad: false, label: "Acima do planejado", deltaLabel: `+${formatMoney(delta)}` };
    return { good: false, bad: true, label: "Abaixo do planejado", deltaLabel: formatMoney(delta) };
  }
  if (kind === "gasto") {
    const sobra = planned - actual;
    if (planned <= 0 && actual > 0) return { good: false, bad: true, label: "Gasto sem planejamento", deltaLabel: formatMoney(-actual) };
    if (actual <= planned) return { good: true, bad: false, label: "Dentro do limite", deltaLabel: `Sobra ${formatMoney(sobra)}` };
    return { good: false, bad: true, label: "Acima do limite", deltaLabel: formatMoney(sobra) };
  }
  if (kind === "investimento") {
    const delta = actual - planned;
    if (planned <= 0 && actual > 0) return { good: true, bad: false, label: "Investimento extra", deltaLabel: `+${formatMoney(delta)}` };
    if (actual >= planned) return { good: true, bad: false, label: "Meta atingida", deltaLabel: `+${formatMoney(delta)}` };
    return { good: false, bad: false, label: "Falta investir", deltaLabel: formatMoney(delta) };
  }
  const delta = actual - planned;
  if (actual >= planned) return { good: true, bad: false, label: "Melhor que o previsto", deltaLabel: `+${formatMoney(delta)}` };
  return { good: false, bad: true, label: "Abaixo do previsto", deltaLabel: formatMoney(delta) };
}

function ExecutionBreakdown({ label, natureza, planned, inside, outside, total }: {
  label: string;
  natureza: NaturezaCategoria;
  planned: number;
  inside: number;
  outside: number;
  total: number;
}) {
  return (
    <div className="grid grid-cols-[1fr_repeat(4,minmax(72px,auto))] gap-2 border-t border-slate-800 px-3 py-2">
      <span className="font-medium text-slate-300">{label}</span>
      <Value value={planned} />
      <Value value={inside} />
      <Value value={outside} tone={outsideTone(natureza, outside)} />
      <Value value={total} strong />
    </div>
  );
}

function outsideTone(natureza: NaturezaCategoria, value: number): "green" | "red" | "yellow" | undefined {
  if (value <= 0) return undefined;
  if (natureza === "RECEITA" || natureza === "INVESTIMENTO") return "green";
  return "red";
}

function Value({ value, tone, strong }: { value: number; tone?: "green" | "red" | "yellow"; strong?: boolean }) {
  const className =
    tone === "red"
      ? "text-right font-semibold text-danger-600"
      : tone === "green"
        ? "text-right font-semibold text-brand-400"
        : tone === "yellow"
          ? "text-right font-semibold text-amber-300"
          : strong
            ? "text-right font-semibold text-slate-100"
            : "text-right text-slate-300";
  return <span className={className}>{formatMoney(value)}</span>;
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
              <Td className="font-medium text-slate-100">{item.subcategoria ? `${item.categoria} > ${item.subcategoria}` : item.categoria}</Td>
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
