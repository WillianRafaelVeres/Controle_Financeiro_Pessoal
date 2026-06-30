import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Banknote, Pencil, Trash2 } from "lucide-react";

import { EmptyState } from "../components/finance/EmptyState";
import { MoneyInput } from "../components/finance/MoneyInput";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Td, Th, Table } from "../components/ui/table";
import { DividendosForm } from "../features/investimentos/DividendosForm";
import { api } from "../lib/api";
import { formatDate, formatMoney, toNumber } from "../lib/formatters";
import { INVESTMENT_TYPE_LABELS } from "../lib/investmentProfiles";
import { invalidateInvestmentData } from "../lib/queryInvalidation";
import type { Ativo, Dividendo, TipoProvento } from "../lib/types";

const PROVENTO_OPTIONS: Array<{ value: TipoProvento; label: string }> = [
  { value: "DIVIDENDO", label: "Dividendo" },
  { value: "JCP", label: "JCP" },
  { value: "RENDIMENTO_FII", label: "Rendimento FII" },
  { value: "JUROS_RENDA_FIXA", label: "Juros" },
  { value: "DIVIDENDO_EXTERIOR", label: "Dividendo exterior" },
  { value: "OUTRO", label: "Outro" },
];

function proventoLabel(value: string) {
  return PROVENTO_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

export function DividendosPage() {
  const queryClient = useQueryClient();
  const ativos = useQuery({ queryKey: ["ativos-dividendos"], queryFn: api.ativosDividendos });
  const dividendos = useQuery({ queryKey: ["dividendos"], queryFn: api.dividendos });
  const criar = useMutation({ mutationFn: api.criarDividendo, onSuccess: () => invalidateInvestmentData(queryClient) });
  const atualizar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.atualizarDividendo(id, payload),
    onSuccess: () => invalidateInvestmentData(queryClient),
  });
  const excluir = useMutation({ mutationFn: api.excluirDividendo, onSuccess: () => invalidateInvestmentData(queryClient) });
  const [editingDividendo, setEditingDividendo] = useState<Dividendo | null>(null);
  const [deleteDividendo, setDeleteDividendo] = useState<Dividendo | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const ativoPorId = (id: string) => ativos.data?.find((item) => item.id === id);

  async function confirmarExclusao() {
    if (!deleteDividendo) return;
    setDeleteError("");
    try {
      await excluir.mutateAsync(deleteDividendo.id);
      setDeleteDividendo(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Nao foi possivel excluir o dividendo.");
    }
  }

  return (
    <div className="space-y-2">
      <PageHeader title="Dividendos" description="Registro de proventos apenas para ativos com posicao maior que zero." />
      <SectionCard title="Novo dividendo" description="Escolha primeiro a classe, depois o ativo da carteira.">
        {(ativos.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Banknote className="h-6 w-6" />}
            title="Nenhum ativo em carteira"
            description="Somente ativos com quantidade atual maior que zero aparecem na lista de dividendos."
          />
        ) : (
          <DividendosForm
            ativos={ativos.data ?? []}
            onSubmit={async (payload) => {
              await criar.mutateAsync(payload);
            }}
          />
        )}
      </SectionCard>
      <SectionCard title="Historico" description="Proventos registrados por ativo.">
        {(dividendos.data?.length ?? 0) === 0 ? (
          <EmptyState title="Sem dividendos registrados" description="Os proventos recebidos aparecerao neste historico." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Ativo</Th>
                <Th>Classe</Th>
                <Th>Tipo</Th>
                <Th className="text-right">Valor</Th>
                <Th className="text-right">Valor em BRL</Th>
                <Th className="w-[74px] text-center">Acoes</Th>
              </tr>
            </thead>
            <tbody>
              {(dividendos.data ?? []).map((item) => {
                const ativo = ativoPorId(item.ativo_id);
                return (
                  <tr key={item.id}>
                    <Td>{formatDate(item.data_recebimento)}</Td>
                    <Td>
                      <div className="font-semibold text-slate-100">{ativo?.ticker ?? "-"}</div>
                      <div className="text-[11px] text-slate-500">{ativo?.nome ?? "Ativo removido"}</div>
                    </Td>
                    <Td>{ativo ? INVESTMENT_TYPE_LABELS[ativo.tipo_ativo] : "-"}</Td>
                    <Td>
                      <div>{proventoLabel(item.tipo_provento)}</div>
                      {item.observacao && <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-slate-500">{item.observacao}</div>}
                    </Td>
                    <Td className="text-right font-semibold text-slate-100">{formatMoney(item.valor, item.moeda === "USD" ? "USD" : "BRL")}</Td>
                    <Td className="text-right font-semibold text-amber-300">{formatMoney(item.valor_brl ?? item.valor)}</Td>
                    <Td className="text-center">
                      <div className="inline-flex items-center gap-1">
                        <Button size="icon" variant="secondary" title="Editar dividendo" aria-label="Editar dividendo" onClick={() => setEditingDividendo(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Excluir dividendo"
                          aria-label="Excluir dividendo"
                          onClick={() => {
                            setDeleteError("");
                            setDeleteDividendo(item);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </SectionCard>
      <DividendoDialog
        dividendo={editingDividendo}
        ativo={editingDividendo ? ativoPorId(editingDividendo.ativo_id) ?? null : null}
        onClose={() => setEditingDividendo(null)}
        onSubmit={(id, payload) => atualizar.mutateAsync({ id, payload }).then(() => undefined)}
      />
      <Dialog open={deleteDividendo !== null} title="Excluir dividendo" onClose={() => setDeleteDividendo(null)}>
        <div className="space-y-3">
          <p className="text-sm text-slate-300">O provento sera removido do historico. Se houver extrato dolar vinculado, ele sera ajustado junto.</p>
          {deleteDividendo && (
            <div className="rounded-md border border-slate-800 bg-slate-950/45 p-3 text-sm">
              <p className="font-semibold text-slate-100">
                {ativoPorId(deleteDividendo.ativo_id)?.ticker ?? "Ativo"} - {proventoLabel(deleteDividendo.tipo_provento)}
              </p>
              <p className="mt-1 text-slate-400">
                {formatDate(deleteDividendo.data_recebimento)} - {formatMoney(deleteDividendo.valor, deleteDividendo.moeda === "USD" ? "USD" : "BRL")}
              </p>
            </div>
          )}
          {deleteError && <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs font-medium text-red-300">{deleteError}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteDividendo(null)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={excluir.isPending} onClick={confirmarExclusao}>
              Excluir
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function DividendoDialog({
  dividendo,
  ativo,
  onClose,
  onSubmit,
}: {
  dividendo: Dividendo | null;
  ativo: Ativo | null;
  onClose: () => void;
  onSubmit: (id: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    data_recebimento: "",
    valor: "",
    moeda: "BRL",
    tipo_provento: "DIVIDENDO" as TipoProvento,
    observacao: "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!dividendo) return;
    setForm({
      data_recebimento: dividendo.data_recebimento,
      valor: String(toNumber(dividendo.valor)),
      moeda: dividendo.moeda || "BRL",
      tipo_provento: (dividendo.tipo_provento || "DIVIDENDO") as TipoProvento,
      observacao: dividendo.observacao || "",
    });
    setErro("");
    setSalvando(false);
  }, [dividendo]);

  if (!dividendo) return null;
  const dividendoAtual = dividendo;

  function changeMoeda(moeda: string) {
    setForm((current) => ({
      ...current,
      moeda,
      tipo_provento:
        moeda === "USD" && current.tipo_provento === "DIVIDENDO"
          ? "DIVIDENDO_EXTERIOR"
          : moeda === "BRL" && current.tipo_provento === "DIVIDENDO_EXTERIOR"
            ? "DIVIDENDO"
            : current.tipo_provento,
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErro("");
    if (!form.data_recebimento) {
      setErro("Informe a data de recebimento.");
      return;
    }
    if (toNumber(form.valor) <= 0) {
      setErro("Informe um valor maior que zero.");
      return;
    }
    setSalvando(true);
    try {
      await onSubmit(dividendoAtual.id, {
        data_recebimento: form.data_recebimento,
        valor: toNumber(form.valor),
        moeda: form.moeda,
        tipo_provento: form.tipo_provento,
        observacao: form.observacao.trim() || null,
      });
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel salvar o dividendo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={dividendo !== null} title="Editar dividendo" onClose={onClose} className="max-w-2xl">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <div className="rounded-md border border-slate-800 bg-slate-950/45 p-3 sm:col-span-2">
          <p className="text-sm font-semibold text-slate-100">{ativo ? `${ativo.ticker} - ${ativo.nome}` : "Ativo nao encontrado"}</p>
          <p className="mt-1 text-xs text-slate-500">{ativo ? INVESTMENT_TYPE_LABELS[ativo.tipo_ativo] : dividendoAtual.ativo_id}</p>
        </div>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Provento</span>
          <Select value={form.tipo_provento} onChange={(event) => setForm({ ...form, tipo_provento: event.target.value as TipoProvento })}>
            {PROVENTO_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Moeda</span>
          <Select value={form.moeda} onChange={(event) => changeMoeda(event.target.value)}>
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Valor</span>
          <MoneyInput currency={form.moeda} value={form.valor} onChange={(event) => setForm({ ...form, valor: event.target.value })} required />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Recebido em</span>
          <Input type="date" value={form.data_recebimento} onChange={(event) => setForm({ ...form, data_recebimento: event.target.value })} required />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-slate-500">Observacao</span>
          <Input value={form.observacao} onChange={(event) => setForm({ ...form, observacao: event.target.value })} />
        </label>
        {erro && <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs font-medium text-red-300 sm:col-span-2">{erro}</div>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={salvando}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
