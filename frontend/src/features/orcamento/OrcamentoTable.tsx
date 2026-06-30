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
import { formatMoney, formatPercent, toNumber } from "../../lib/formatters";
import { invalidatePlanningData } from "../../lib/queryInvalidation";
import type { NaturezaCategoria, OrcamentoLinha } from "../../lib/types";

interface OrcamentoTableProps {
  data: OrcamentoLinha[];
  natureza: NaturezaCategoria;
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
      <Table className="min-w-[760px] table-fixed text-[13px]">
        <thead>
          <tr>
            <Th className="w-[34%]">Item</Th>
            <Th className="w-[14%] text-right">Planejado</Th>
            <Th className="w-[14%] text-right">Executado</Th>
            <Th className="w-[14%] text-right">Diferenca</Th>
            <Th className="w-[12%]">Situacao</Th>
            <Th className="w-[84px] text-center">Acoes</Th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(grouped).flatMap(([categoriaId, group]) => [
            <tr key={`${categoriaId}-header`} className="bg-slate-900/80">
              <Td colSpan={6} className="py-1.5 font-semibold text-slate-100">
                {group.categoria}
              </Td>
            </tr>,
            ...group.itens.map((item) => (
              <tr key={item.item_orcamento_id}>
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
            )),
          ])}
        </tbody>
      </Table>

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
  return (
    <Dialog open={item !== null} title="Detalhes do item" onClose={onClose}>
      {item && (
        <div className="grid gap-2 text-[13px] text-slate-300">
          <div className="rounded-md bg-slate-950/60 p-2.5">Media 3M: {formatMoney(item.media_3_meses)}</div>
          <div className="rounded-md bg-slate-950/60 p-2.5">Media 6M: {formatMoney(item.media_6_meses)}</div>
          <div className="rounded-md bg-slate-950/60 p-2.5">Media 12M: {formatMoney(item.media_12_meses)}</div>
          <div className="rounded-md bg-slate-950/60 p-2.5">Uso atual: {formatPercent(item.percentual_usado)}</div>
        </div>
      )}
    </Dialog>
  );
}
