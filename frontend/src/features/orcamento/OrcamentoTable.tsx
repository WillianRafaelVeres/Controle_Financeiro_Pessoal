import { Eye, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { EmptyState } from "../../components/finance/EmptyState";
import { MoneyInput } from "../../components/finance/MoneyInput";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Td, Th, Table } from "../../components/ui/table";
import { api } from "../../lib/api";
import { formatMoney, formatMoneyCompact, formatMonthShort, formatPercent, toNumber } from "../../lib/formatters";
import { invalidatePlanningData } from "../../lib/queryInvalidation";
import type { NaturezaCategoria, OrcamentoLinha } from "../../lib/types";

interface OrcamentoTableProps {
  data: OrcamentoLinha[];
  natureza: NaturezaCategoria;
}

// Cada categoria e' um card com cor propria, na mesma linguagem visual que a
// tela de Investimentos usa para separar classes de ativo (cores fixas por
// tipo). Categoria e' texto livre do usuario, entao aqui o acento gira por
// indice em vez de vir de um enum.
const CATEGORY_ACCENTS = [
  { border: "border-blue-500/30", header: "bg-blue-500/10", accent: "text-blue-300", bar: "bg-blue-500" },
  { border: "border-brand-500/30", header: "bg-brand-500/10", accent: "text-brand-400", bar: "bg-brand-500" },
  { border: "border-amber-500/30", header: "bg-amber-500/10", accent: "text-amber-300", bar: "bg-amber-500" },
  { border: "border-purple-500/30", header: "bg-purple-500/10", accent: "text-purple-300", bar: "bg-purple-500" },
  { border: "border-cyan-500/30", header: "bg-cyan-500/10", accent: "text-cyan-300", bar: "bg-cyan-500" },
  { border: "border-rose-500/30", header: "bg-rose-500/10", accent: "text-rose-300", bar: "bg-rose-500" },
  { border: "border-teal-500/30", header: "bg-teal-500/10", accent: "text-teal-300", bar: "bg-teal-500" },
  { border: "border-orange-500/30", header: "bg-orange-500/10", accent: "text-orange-300", bar: "bg-orange-500" },
];

function categoryAccent(index: number) {
  return CATEGORY_ACCENTS[index % CATEGORY_ACCENTS.length];
}

export function OrcamentoTable({ data, natureza }: OrcamentoTableProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<OrcamentoLinha | null>(null);
  const [removing, setRemoving] = useState<OrcamentoLinha | null>(null);
  const [details, setDetails] = useState<OrcamentoLinha | null>(null);

  const atualizarItem = useMutation({
    mutationFn: (payload: { itemId: string; valor: number; escopo: string }) =>
      api.atualizarItemOrcamento(payload.itemId, { valor_orcado: payload.valor, escopo: payload.escopo }),
    onSuccess: () => invalidatePlanningData(queryClient),
  });

  const removerItem = useMutation({
    mutationFn: (payload: { itemId: string; escopo: string }) => api.removerItemOrcamento(payload.itemId, payload.escopo),
    onSuccess: () => invalidatePlanningData(queryClient),
  });

  const grouped = useMemo(() => {
    return data.reduce(
      (acc, item) => {
        if (!acc[item.categoria_id]) acc[item.categoria_id] = { categoria: item.categoria, itens: [] };
        acc[item.categoria_id].itens.push(item);
        return acc;
      },
      {} as Record<string, { categoria: string; itens: OrcamentoLinha[] }>,
    );
  }, [data]);

  if (data.length === 0) {
    return (
      <EmptyState
        title={
          natureza === "RECEITA"
            ? "Nenhum recebimento planejado."
            : natureza === "INVESTIMENTO"
              ? "Nenhum investimento planejado."
              : "Nenhum gasto planejado."
        }
        description="Use Adicionar item para escolher categorias ou subcategorias para este mes."
      />
    );
  }

  function tone(status: string, itemNatureza?: NaturezaCategoria) {
    if (status === "DENTRO" || status === "DENTRO_DO_PLANEJADO" || status === "CONCLUIDO") return "green";
    if (status === "ATENCAO" || status === "ABAIXO_DO_PLANEJADO" || status === "NAO_INICIADO") return "yellow";
    if (status === "ESTOURADO" && itemNatureza !== "INVESTIMENTO") return "red";
    return "blue";
  }

  function statusLabel(status: string) {
    const labels: Record<string, string> = {
      ABAIXO_DO_PLANEJADO: "Falta realizar",
      ATENCAO: "Atencao",
      CONCLUIDO: "Meta atingida",
      DENTRO: "Dentro",
      DENTRO_DO_PLANEJADO: "No plano",
      ESTOURADO: "Acima",
      NAO_INICIADO: "Nao iniciado",
      SEM_PLANEJAMENTO: "Sem plano",
    };
    return labels[status] ?? status.replaceAll("_", " ");
  }

  function label(item: OrcamentoLinha) {
    return item.tipo_item === "SUBCATEGORIA" && item.subcategoria ? item.subcategoria : item.categoria;
  }

  function diferencaClass(item: OrcamentoLinha) {
    const diff = toNumber(item.diferenca);
    if (item.natureza === "GASTO") return diff < 0 ? "text-right font-semibold text-danger-600" : "text-right font-semibold text-brand-400";
    return diff <= 0 ? "text-right font-semibold text-brand-400" : "text-right font-semibold text-amber-300";
  }

  return (
    <>
      <div className="space-y-3">
        {Object.entries(grouped).map(([categoriaId, group], index) => {
          const accent = categoryAccent(index);
          const planejadoGrupo = group.itens.reduce((acc, item) => acc + toNumber(item.valor_orcado), 0);
          const executadoGrupo = group.itens.reduce((acc, item) => acc + toNumber(item.gasto_real), 0);
          return (
            <div key={categoriaId} className={`overflow-hidden rounded-md border bg-[#101720]/80 shadow-sm ${accent.border}`}>
              <div className={`relative flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 ${accent.header}`}>
                <div className={`absolute left-0 top-0 h-full w-1 ${accent.bar}`} />
                <div className="flex min-w-0 items-center gap-2 pl-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accent.bar}`} />
                  <p className={`truncate text-sm font-semibold ${accent.accent}`}>{group.categoria}</p>
                  <span className="text-[11px] text-slate-500">
                    {group.itens.length} {group.itens.length === 1 ? "item" : "itens"}
                  </span>
                </div>
                <div className="flex gap-3 pl-2 text-[11px] text-slate-400">
                  <span>
                    Planejado <span className="font-semibold text-slate-200">{formatMoney(planejadoGrupo)}</span>
                  </span>
                  <span>
                    Executado <span className="font-semibold text-slate-200">{formatMoney(executadoGrupo)}</span>
                  </span>
                </div>
              </div>
              <Table className="min-w-[860px] table-fixed text-[13px]">
                <thead>
                  <tr>
                    <Th className="w-[26%]">Item</Th>
                    <Th className="w-[12%] text-right">Planejado</Th>
                    <Th className="w-[13%] text-right">Executado</Th>
                    <Th className="w-[12%] text-right">Diferenca</Th>
                    <Th className="w-[19%]">Historico (ate 6 meses)</Th>
                    <Th className="w-[11%]">Situacao</Th>
                    <Th className="w-[84px] text-center">Acoes</Th>
                  </tr>
                </thead>
                <tbody>
                  {group.itens.map((item) => (
                    <tr key={item.item_orcamento_id} className="odd:bg-white/[0.02] transition-colors duration-150 hover:bg-slate-800/50">
                      <Td>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-slate-100">{label(item)}</div>
                          <Badge tone={item.tipo_item === "SUBCATEGORIA" ? "blue" : "neutral"}>{item.tipo_item === "SUBCATEGORIA" ? "Subitem" : "Categoria"}</Badge>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-slate-500">
                          <span>{item.tipo_item === "SUBCATEGORIA" ? `${item.categoria} > ${item.subcategoria}` : item.categoria}</span>
                          {item.inativo_hoje && <Badge tone="neutral">inativo hoje</Badge>}
                        </div>
                      </Td>
                      <Td className="text-right font-semibold text-slate-100">{formatMoney(item.valor_orcado)}</Td>
                      <Td className="text-right">
                        <div className="font-medium text-slate-200">{formatMoney(item.gasto_real)}</div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={tone(item.situacao, item.natureza) === "red" ? "h-full rounded-full bg-danger-600" : tone(item.situacao, item.natureza) === "yellow" ? "h-full rounded-full bg-amber-500" : "h-full rounded-full bg-brand-500"}
                            style={{ width: `${Math.min(toNumber(item.percentual_usado), 100)}%` }}
                          />
                        </div>
                      </Td>
                      <Td className={diferencaClass(item)}>
                        {formatMoney(item.diferenca)}
                      </Td>
                      <Td>
                        <HistoricoCell item={item} />
                      </Td>
                      <Td>
                        <Badge tone={tone(item.situacao, item.natureza)}>{statusLabel(item.situacao)}</Badge>
                      </Td>
                      <Td>
                        <div className="flex justify-center gap-1">
                          <Button size="icon" variant="secondary" title="Editar valor" aria-label="Editar valor" onClick={() => setEditing(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="quiet" title="Remover item" aria-label="Remover item" onClick={() => setRemoving(item)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Ver medias" aria-label="Ver medias" onClick={() => setDetails(item)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          );
        })}
      </div>

      <EditValueDialog
        item={editing}
        pending={atualizarItem.isPending}
        onClose={() => setEditing(null)}
        onApply={async (valor, escopo) => {
          if (!editing?.item_orcamento_id) return;
          await atualizarItem.mutateAsync({ itemId: editing.item_orcamento_id, valor, escopo });
          setEditing(null);
        }}
      />
      <RemoveDialog
        item={removing}
        pending={removerItem.isPending}
        onClose={() => setRemoving(null)}
        onApply={async (escopo) => {
          if (!removing?.item_orcamento_id) return;
          await removerItem.mutateAsync({ itemId: removing.item_orcamento_id, escopo });
          setRemoving(null);
        }}
      />
      <DetailsDialog item={details} onClose={() => setDetails(null)} />
    </>
  );
}

function HistoricoCell({ item }: { item: OrcamentoLinha }) {
  const historico = item.historico ?? [];

  if (historico.length === 0) {
    return <span className="text-[11px] text-slate-500">Sem meses anteriores</span>;
  }

  const maior = Math.max(...historico.map((mes) => toNumber(mes.valor)), 0);

  return (
    <div>
      <div className="flex items-end gap-1">
        {historico.map((mes) => {
          const valor = toNumber(mes.valor);
          const altura = maior > 0 && valor > 0 ? Math.max((valor / maior) * 100, 14) : 4;
          const rotulo = formatMonthShort(mes.ano, mes.mes);
          return (
            <div
              key={`${mes.ano}-${mes.mes}`}
              className="flex min-w-0 flex-1 flex-col items-center gap-0.5"
              title={`${rotulo}: ${formatMoney(valor)}`}
            >
              <div className="flex h-7 w-full items-end rounded-sm bg-slate-800/70">
                <div className="w-full rounded-sm bg-brand-500/70" style={{ height: `${altura}%` }} />
              </div>
              <span className="text-[9px] leading-tight text-slate-400">{rotulo}</span>
              <span className="text-[9px] leading-tight text-slate-500">{formatMoneyCompact(valor)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 text-[10px] text-slate-500">Media {formatMoney(item.media_historico ?? 0)}</div>
    </div>
  );
}

function EditValueDialog({
  item,
  pending,
  onClose,
  onApply,
}: {
  item: OrcamentoLinha | null;
  pending: boolean;
  onClose: () => void;
  onApply: (valor: number, escopo: string) => Promise<void>;
}) {
  const [valor, setValor] = useState("");

  useEffect(() => {
    setValor(item ? String(toNumber(item.valor_orcado)) : "");
  }, [item]);

  return (
    <Dialog open={item !== null} title="Editar valor planejado" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-400">Como deseja aplicar esta alteracao?</p>
        <MoneyInput value={valor || String(toNumber(item?.valor_orcado))} onChange={(event) => setValor(event.target.value)} />
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => onApply(Number(valor || item?.valor_orcado || 0), "SOMENTE_ESTE_MES")}>
            Alterar apenas este mes
          </Button>
          <Button disabled={pending} onClick={() => onApply(Number(valor || item?.valor_orcado || 0), "DESTE_MES_EM_DIANTE")}>
            Alterar deste mes em diante
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function RemoveDialog({
  item,
  pending,
  onClose,
  onApply,
}: {
  item: OrcamentoLinha | null;
  pending: boolean;
  onClose: () => void;
  onApply: (escopo: string) => Promise<void>;
}) {
  return (
    <Dialog open={item !== null} title="Remover do planejamento" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-400">Como deseja remover este item do planejamento?</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => onApply("SOMENTE_ESTE_MES")}>
            Remover apenas deste mes
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => onApply("DESTE_MES_EM_DIANTE")}>
            Remover deste mes em diante
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function DetailsDialog({ item, onClose }: { item: OrcamentoLinha | null; onClose: () => void }) {
  const historico = item?.historico ?? [];

  return (
    <Dialog open={item !== null} title="Detalhes do item" onClose={onClose}>
      {item && (
        <div className="grid gap-2 text-[13px] text-slate-300">
          {historico.length > 0 && (
            <div className="rounded-md bg-slate-950/60 p-2.5">
              <p className="text-[11px] font-semibold uppercase text-slate-500">Executado mes a mes</p>
              <div className="mt-2 space-y-1">
                {[...historico].reverse().map((mes) => (
                  <div key={`${mes.ano}-${mes.mes}`} className="flex justify-between gap-3">
                    <span className="text-slate-400">{formatMonthShort(mes.ano, mes.mes)}</span>
                    <span className="font-medium text-slate-200">{formatMoney(mes.valor)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-3 border-t border-slate-800 pt-1">
                  <span className="text-slate-400">Media do periodo</span>
                  <span className="font-semibold text-slate-100">{formatMoney(item.media_historico ?? 0)}</span>
                </div>
              </div>
            </div>
          )}
          <div className="rounded-md bg-slate-950/60 p-2.5">Media 3M: {formatMoney(item.media_3_meses)}</div>
          <div className="rounded-md bg-slate-950/60 p-2.5">Media 6M: {formatMoney(item.media_6_meses)}</div>
          <div className="rounded-md bg-slate-950/60 p-2.5">Media 12M: {formatMoney(item.media_12_meses)}</div>
          <div className="rounded-md bg-slate-950/60 p-2.5">Uso atual: {formatPercent(item.percentual_usado)}</div>
        </div>
      )}
    </Dialog>
  );
}
