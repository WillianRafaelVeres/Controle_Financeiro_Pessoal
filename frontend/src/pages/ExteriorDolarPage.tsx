import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Minus, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

import { EmptyState } from "../components/finance/EmptyState";
import { MoneyInput } from "../components/finance/MoneyInput";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Td, Th, Table } from "../components/ui/table";
import { api } from "../lib/api";
import { formatDate, formatMoney, toNumber } from "../lib/formatters";
import type { ExtratoDolar } from "../lib/types";

export type ActionType = "ENVIO" | "RETIRADA";

export function ExteriorDolarPage() {
  const queryClient = useQueryClient();
  const resumo = useQuery({ queryKey: ["dolar-resumo"], queryFn: api.dolarResumo });
  const extrato = useQuery({ queryKey: ["dolar-extrato"], queryFn: api.dolarExtrato });
  const cotacaoAtual = useQuery({
    queryKey: ["dolar-cotacao-atual"],
    queryFn: api.dolarCotacaoAtual,
    refetchInterval: 60_000,
    retry: false,
  });
  const movimento = useMutation({ mutationFn: api.dolarMovimento, onSuccess: () => queryClient.invalidateQueries() });
  const atualizarMovimento = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.dolarAtualizarMovimento(id, payload),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const excluirMovimento = useMutation({ mutationFn: api.dolarExcluirMovimento, onSuccess: () => queryClient.invalidateQueries() });
  const informarSaldo = useMutation({ mutationFn: api.dolarInformarSaldo, onSuccess: () => queryClient.invalidateQueries() });
  const [action, setAction] = useState<ActionType | null>(null);
  const [editing, setEditing] = useState<ExtratoDolar | null>(null);
  const [editingAction, setEditingAction] = useState<ActionType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExtratoDolar | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [saldoRealUsd, setSaldoRealUsd] = useState("");

  const data = resumo.data;
  const diferenca = toNumber(data?.diferenca_conciliacao_usd);
  const conciliado = Math.abs(diferenca) < 0.01;
  const cotacaoReferencia = toNumber(cotacaoAtual.data?.cotacao_brl ?? data?.cotacao_brl);
  const valorAtualBrl = toNumber(data?.saldo_teorico_usd) * cotacaoReferencia;

  useEffect(() => {
    setSaldoRealUsd(data?.saldo_informado_usd ? String(toNumber(data.saldo_informado_usd)) : "");
  }, [data?.saldo_informado_usd]);

  useEffect(() => {
    if (!cotacaoAtual.data?.cotacao_brl) return;
    queryClient.invalidateQueries({ queryKey: ["dolar-resumo"] });
  }, [cotacaoAtual.data?.cotacao_brl, queryClient]);

  async function salvarSaldoReal(event: React.FormEvent) {
    event.preventDefault();
    await informarSaldo.mutateAsync({
      saldo_usd: toNumber(saldoRealUsd),
    });
  }

  function actionFromItem(item: ExtratoDolar): ActionType | null {
    if (item.tipo === "ENVIO") return "ENVIO";
    if (item.tipo === "RETIRADA") return "RETIRADA";
    return null;
  }

  function editar(item: ExtratoDolar) {
    const tipo = actionFromItem(item);
    if (!tipo) return;
    setEditing(item);
    setEditingAction(tipo);
  }

  function pedirExclusao(item: ExtratoDolar) {
    setDeleteError("");
    setDeleteTarget(item);
  }

  async function confirmarExclusao() {
    if (!deleteTarget) return;
    setDeleteError("");
    try {
      await excluirMovimento.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Nao foi possivel excluir o movimento.");
    }
  }

  return (
    <div className="space-y-2">
      <PageHeader
        title="Exterior/Dolar"
        description="Conta dolar teorica com entradas, saidas, dividendos, compras e vendas no exterior."
        actions={
          <>
            <Button onClick={() => setAction("ENVIO")}>
              <Plus className="h-4 w-4" />
              Enviar dolar
            </Button>
            <Button variant="secondary" onClick={() => setAction("RETIRADA")}>
              <Minus className="h-4 w-4" />
              Retirar dolar
            </Button>
            <Button variant="secondary" disabled={cotacaoAtual.isFetching} onClick={() => cotacaoAtual.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Atualizar cotacao
            </Button>
          </>
        }
      />

      <section className="rounded-md border border-brand-500/40 bg-brand-500/10 p-4 shadow-[0_0_0_1px_rgba(34,197,94,0.08)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-brand-400">Cotacao USD/BRL atual</p>
            <p className="mt-1 text-3xl font-semibold text-slate-50">{formatMoney(cotacaoReferencia)}</p>
            <p className="mt-1 text-xs text-slate-400">
              {cotacaoAtual.data?.fonte ?? data?.cotacao_brl_fonte ?? "Atual"} {cotacaoAtual.data?.data_cotacao ?? data?.cotacao_brl_data ?? ""}
            </p>
          </div>
          <div className="text-left md:text-right">
            <p className="text-xs font-semibold uppercase text-slate-500">Exterior hoje em BRL</p>
            <p className="mt-1 text-2xl font-semibold text-slate-50">{formatMoney(valorAtualBrl)}</p>
            <p className="mt-1 text-xs text-slate-400">{formatMoney(data?.saldo_teorico_usd, "USD")} convertidos pela cotacao atual</p>
          </div>
        </div>
      </section>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <UsdCard title="Saldo teorico em USD" value={data?.saldo_teorico_usd} subtitle="Calculado pelo extrato dolar" />
        <UsdCard title="Saldo informado" value={data?.saldo_informado_usd} subtitle="Valor da conta real" />
        <UsdCard title="Diferenca" value={data?.diferenca_conciliacao_usd} subtitle={conciliado ? "Conta dolar conciliada" : "Verifique movimentos"} danger={!conciliado} />
        <section className="rounded-md border border-slate-800 bg-[#111821] p-3">
          <p className="text-xs font-medium uppercase text-slate-500">Dolar medio</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">{formatMoney(data?.dolar_medio)}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {formatMoney(data?.total_brl_enviado)} enviados | {formatMoney(data?.total_usd_recebido, "USD")} recebidos
          </p>
        </section>
      </div>

      <SectionCard title="Conferencia">
        <form className="mb-2 grid gap-2 md:grid-cols-[minmax(160px,240px)_auto]" onSubmit={salvarSaldoReal}>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Saldo real na conta USD</span>
            <MoneyInput currency="USD" value={saldoRealUsd} onChange={(event) => setSaldoRealUsd(event.target.value)} required />
          </label>
          <div className="flex items-end">
            <Button className="w-full md:w-auto" type="submit" disabled={informarSaldo.isPending}>
              Salvar saldo real
            </Button>
          </div>
        </form>
        <div className={conciliado ? "rounded-md bg-brand-500/15 p-2 text-[13px] font-medium text-brand-500" : "rounded-md bg-amber-500/15 p-2 text-[13px] font-medium text-amber-400"}>
          {conciliado
            ? "Conta dolar conciliada."
            : "Existe diferenca entre o saldo teorico e o saldo informado. Verifique envios, retiradas, dividendos, compras ou vendas."}
        </div>
      </SectionCard>

      <SectionCard title="Extrato dolar">
        {(extrato.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<DollarSign className="h-6 w-6" />}
            title="Sem movimentos em dolar"
            description="Envios, retiradas, compras, vendas e dividendos em USD aparecerao aqui."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Tipo</Th>
                <Th>Descricao</Th>
                <Th>Entrada USD</Th>
                <Th>Saida USD</Th>
                <Th>BRL</Th>
                <Th>Cotacao</Th>
                <Th>Saldo acumulado</Th>
                <Th>Origem</Th>
                <Th className="w-[74px] text-center">Acoes</Th>
              </tr>
            </thead>
            <tbody>
              {(extrato.data ?? []).map((item) => {
                const actionType = actionFromItem(item);
                const editable = Boolean(item.editavel || item.origem === "MANUAL");
                return (
                  <tr key={item.id}>
                    <Td>{formatDate(item.data_movimento)}</Td>
                    <Td>{item.tipo}</Td>
                    <Td>{item.descricao ?? "-"}</Td>
                    <Td>{formatMoney(item.entrada_usd, "USD")}</Td>
                    <Td>{formatMoney(item.saida_usd, "USD")}</Td>
                    <Td>{formatMoney(item.valor_brl)}</Td>
                    <Td>{formatMoney(item.cotacao_efetiva)}</Td>
                    <Td className="font-medium text-slate-100">{formatMoney(item.saldo_acumulado_usd, "USD")}</Td>
                    <Td>{item.origem}</Td>
                    <Td className="text-center">
                      {editable ? (
                        <div className="inline-flex items-center gap-1">
                          {actionType && (
                            <Button size="icon" variant="secondary" title="Editar movimento" aria-label="Editar movimento" onClick={() => editar(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" title="Excluir movimento" aria-label="Excluir movimento" onClick={() => pedirExclusao(item)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">-</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </SectionCard>

      <DolarActionDialog
        action={action}
        onClose={() => setAction(null)}
        onMovimento={(payload) => movimento.mutateAsync(payload).then(() => undefined)}
        cotacaoAtual={cotacaoReferencia}
      />
      <DolarActionDialog
        action={editingAction}
        movimentoInicial={editing}
        onClose={() => {
          setEditing(null);
          setEditingAction(null);
        }}
        onMovimento={(payload) =>
          editing ? atualizarMovimento.mutateAsync({ id: editing.id, payload }).then(() => undefined) : Promise.resolve()
        }
        cotacaoAtual={cotacaoReferencia}
      />
      <Dialog open={deleteTarget !== null} title="Excluir movimento em dolar" onClose={() => setDeleteTarget(null)}>
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Este movimento sera removido do extrato dolar e o lancamento em BRL vinculado tambem sera removido, quando existir.
          </p>
          {deleteTarget && (
            <div className="rounded-md border border-slate-800 bg-slate-950/45 p-3 text-sm">
              <p className="font-semibold text-slate-100">{deleteTarget.tipo}</p>
              <p className="mt-1 text-slate-400">
                {formatDate(deleteTarget.data_movimento)} · {formatMoney(Math.max(toNumber(deleteTarget.entrada_usd), toNumber(deleteTarget.saida_usd)), "USD")}
              </p>
            </div>
          )}
          {deleteError && <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs font-medium text-red-300">{deleteError}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={excluirMovimento.isPending} onClick={confirmarExclusao}>
              Excluir
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function UsdCard({ title, value, subtitle, danger }: { title: string; value?: string | number; subtitle: string; danger?: boolean }) {
  return (
    <section className="rounded-md border border-slate-800 bg-[#111821] p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{title}</p>
      <p className={danger ? "mt-1 text-xl font-semibold text-danger-600" : "mt-1 text-xl font-semibold text-slate-100"}>
        {formatMoney(value, "USD")}
      </p>
      <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>
    </section>
  );
}

export function DolarActionDialog({
  action,
  movimentoInicial,
  onClose,
  onMovimento,
  cotacaoAtual = 0,
}: {
  action: ActionType | null;
  movimentoInicial?: ExtratoDolar | null;
  onClose: () => void;
  onMovimento: (payload: Record<string, unknown>) => Promise<void>;
  cotacaoAtual?: number;
}) {
  const [valorUsd, setValorUsd] = useState("");
  const [valorBrl, setValorBrl] = useState("");
  const [valorUsdManual, setValorUsdManual] = useState(false);
  const [valorBrlManual, setValorBrlManual] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const isEnvio = action === "ENVIO";
  const isEditing = Boolean(movimentoInicial);
  const cotacaoEfetiva = toNumber(valorUsd) > 0 && toNumber(valorBrl) > 0 ? toNumber(valorBrl) / toNumber(valorUsd) : 0;

  useEffect(() => {
    const usdInicial = movimentoInicial
      ? isEnvio
        ? toNumber(movimentoInicial.entrada_usd)
        : toNumber(movimentoInicial.saida_usd)
      : 0;
    setValorUsd(usdInicial > 0 ? String(usdInicial) : "");
    setValorBrl(movimentoInicial?.valor_brl ? String(toNumber(movimentoInicial.valor_brl)) : "");
    setValorUsdManual(false);
    setValorBrlManual(false);
    setDescricao(movimentoInicial?.descricao ?? "");
    setData(movimentoInicial?.data_movimento ?? "");
    setErro("");
    setSalvando(false);
  }, [action, movimentoInicial?.id, isEnvio]);

  useEffect(() => {
    if (isEditing || !isEnvio || valorUsdManual || cotacaoAtual <= 0 || toNumber(valorBrl) <= 0) return;
    setValorUsd((toNumber(valorBrl) / cotacaoAtual).toFixed(2));
  }, [cotacaoAtual, isEditing, isEnvio, valorBrl, valorUsdManual]);

  useEffect(() => {
    if (isEditing || isEnvio || valorBrlManual || cotacaoAtual <= 0 || toNumber(valorUsd) <= 0) return;
    setValorBrl((toNumber(valorUsd) * cotacaoAtual).toFixed(2));
  }, [cotacaoAtual, isEditing, isEnvio, valorUsd, valorBrlManual]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!action) return;
    setErro("");
    setSalvando(true);
    try {
      await onMovimento({
        tipo: action,
        valor_usd: toNumber(valorUsd),
        valor_brl: toNumber(valorBrl) > 0 ? toNumber(valorBrl) : null,
        descricao: descricao || null,
        data_movimento: data || null,
      });
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel salvar o movimento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog
      open={action !== null}
      title={isEditing ? (isEnvio ? "Editar envio de dolar" : "Editar retirada de dolar") : isEnvio ? "Enviar dolar" : "Retirar dolar"}
      onClose={onClose}
    >
      <form className="grid gap-3" onSubmit={submit}>
        {isEnvio && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Valor enviado em BRL</span>
            <MoneyInput value={valorBrl} onChange={(event) => setValorBrl(event.target.value)} required />
          </label>
        )}
        {cotacaoAtual > 0 && (
          <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2 text-xs text-slate-400">
            Cotacao atual de referencia: {formatMoney(cotacaoAtual)} por USD.
          </div>
        )}
        {cotacaoEfetiva > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
            Cotacao efetiva: {formatMoney(cotacaoEfetiva)} por USD.
          </div>
        )}
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">{isEnvio ? "Valor recebido em USD" : "Valor retirado em USD"}</span>
          <MoneyInput
            currency="USD"
            value={valorUsd}
            onChange={(event) => {
              setValorUsdManual(true);
              setValorUsd(event.target.value);
            }}
            required
          />
        </label>
        {!isEnvio && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Valor recebido em BRL</span>
            <MoneyInput
              value={valorBrl}
              onChange={(event) => {
                setValorBrlManual(true);
                setValorBrl(event.target.value);
              }}
              required
            />
          </label>
        )}
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Data</span>
          <Input type="date" value={data} onChange={(event) => setData(event.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Descricao</span>
          <Input value={descricao} onChange={(event) => setDescricao(event.target.value)} />
        </label>
        {erro && <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs font-medium text-red-300">{erro}</div>}
        <div className="flex justify-end gap-2">
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
