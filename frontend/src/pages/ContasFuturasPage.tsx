import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Plus } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { CategoryBadge } from "../components/finance/CategoryBadge";
import { EmptyState } from "../components/finance/EmptyState";
import { MoneyInput } from "../components/finance/MoneyInput";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Td, Th, Table } from "../components/ui/table";
import { api } from "../lib/api";
import { formatDate, formatMoney, toNumber } from "../lib/formatters";
import { invalidateLaunchData } from "../lib/queryInvalidation";
import type { ContaFutura } from "../lib/types";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function ContasFuturasPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    descricao: "",
    valor: "",
    categoria_id: "",
    subcategoria_id: "",
    metodo_pagamento_id: "",
    conta_id: "",
    data_vencimento: "",
    observacao: "",
  });
  const [pagamento, setPagamento] = useState<ContaFutura | null>(null);
  const [pagamentoForm, setPagamentoForm] = useState({ metodo_pagamento_id: "", conta_id: "", data_pagamento: todayIso(), observacao: "" });

  const contas = useQuery({ queryKey: ["contas", "contas-futuras"], queryFn: () => api.contas(false) });
  const contasAtivas = (contas.data ?? []).filter((item) => item.ativa !== false);
  const contasFuturas = useQuery({ queryKey: ["contas-futuras"], queryFn: () => api.contasFuturas(false) });
  const categorias = useQuery({ queryKey: ["categorias", "contas-futuras"], queryFn: () => api.categorias("GASTO", true) });
  const subcategorias = useQuery({ queryKey: ["subcategorias", "contas-futuras"], queryFn: () => api.subcategorias(undefined, true) });
  const metodos = useQuery({ queryKey: ["metodos", "contas-futuras"], queryFn: api.metodos });

  const metodosPagamento = (metodos.data ?? []).filter((item) => item.ativo && item.tipo_metodo !== "CARTAO_CREDITO");
  const categoriasAtivas = (categorias.data ?? []).filter((item) => item.ativa);
  const subcategoriasAtivas = useMemo(
    () =>
      (subcategorias.data ?? []).filter(
        (item) => item.ativa && (!form.categoria_id || item.categoria_id === form.categoria_id),
      ),
    [form.categoria_id, subcategorias.data],
  );
  const abertas = (contasFuturas.data ?? []).filter((item) => item.status === "ABERTA");
  const totalAberto = abertas.reduce((acc, item) => acc + toNumber(item.valor), 0);
  const contaNome = (id?: string | null) => contas.data?.find((item) => item.id === id)?.nome ?? "-";

  const criar = useMutation({
    mutationFn: api.criarContaFutura,
    onSuccess: () => invalidateLaunchData(queryClient),
  });
  const pagar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.pagarContaFutura(id, payload),
    onSuccess: () => invalidateLaunchData(queryClient),
  });
  const categoriaNome = (id: string) => categorias.data?.find((item) => item.id === id)?.nome ?? "-";
  const subcategoriaNome = (id: string) => subcategorias.data?.find((item) => item.id === id)?.nome ?? "-";
  const metodoNome = (id?: string | null) => metodos.data?.find((item) => item.id === id)?.nome ?? "-";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.descricao.trim() || Number(form.valor || 0) <= 0 || !form.categoria_id || !form.subcategoria_id || !form.metodo_pagamento_id) return;
    await criar.mutateAsync({
      descricao: form.descricao.trim(),
      valor: Number(form.valor),
      categoria_id: form.categoria_id,
      subcategoria_id: form.subcategoria_id,
      metodo_pagamento_id: form.metodo_pagamento_id,
      conta_id: form.conta_id || null,
      data_vencimento: form.data_vencimento || null,
      observacao: form.observacao.trim() || null,
    });
    setForm({ descricao: "", valor: "", categoria_id: "", subcategoria_id: "", metodo_pagamento_id: "", conta_id: "", data_vencimento: "", observacao: "" });
  }

  function abrirPagamento(item: ContaFutura) {
    setPagamentoForm({
      metodo_pagamento_id: item.metodo_pagamento_id ?? metodosPagamento[0]?.id ?? "",
      conta_id: item.conta_id ?? contasAtivas[0]?.id ?? "",
      data_pagamento: todayIso(),
      observacao: "",
    });
    setPagamento(item);
  }

  async function confirmarPagamento(event: FormEvent) {
    event.preventDefault();
    if (!pagamento || !pagamentoForm.metodo_pagamento_id) return;
    await pagar.mutateAsync({
      id: pagamento.id,
      payload: {
        metodo_pagamento_id: pagamentoForm.metodo_pagamento_id,
        conta_id: pagamentoForm.conta_id || null,
        data_pagamento: pagamentoForm.data_pagamento || null,
        observacao: pagamentoForm.observacao.trim() || null,
      },
    });
    setPagamento(null);
  }

  return (
    <div className="space-y-3">
      <PageHeader title="Contas futuras" description="Valores separados agora para contas que serao pagas depois." />

      <div className="grid gap-3 sm:grid-cols-2">
        <Resumo label="Reservado" value={formatMoney(totalAberto)} detail="Sai do saldo livre" />
        <Resumo label="Abertas" value={String(abertas.length)} detail="Aguardando pagamento" />
      </div>

      <SectionCard title="Separar conta" description="Informe item e subitem para o gasto entrar no orcamento quando for pago.">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_140px_150px_1fr_1fr_1fr_1fr_auto]" onSubmit={submit}>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Conta</span>
            <Input value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} placeholder="Ex.: Energia" required />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Valor</span>
            <MoneyInput value={form.valor} onChange={(event) => setForm({ ...form, valor: event.target.value })} required />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Vencimento</span>
            <Input type="date" value={form.data_vencimento} onChange={(event) => setForm({ ...form, data_vencimento: event.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Item</span>
            <Select
              value={form.categoria_id}
              onChange={(event) => setForm({ ...form, categoria_id: event.target.value, subcategoria_id: "" })}
              required
            >
              <option value="">Selecione</option>
              {categoriasAtivas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Subitem</span>
            <Select
              value={form.subcategoria_id}
              onChange={(event) => setForm({ ...form, subcategoria_id: event.target.value })}
              disabled={!form.categoria_id}
              required
            >
              <option value="">Selecione</option>
              {subcategoriasAtivas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Conta (opcional)</span>
            <Select value={form.conta_id} onChange={(event) => setForm({ ...form, conta_id: event.target.value })}>
              <option value="">Nenhuma</option>
              {contasAtivas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Metodo</span>
            <Select
              value={form.metodo_pagamento_id}
              onChange={(event) => setForm({ ...form, metodo_pagamento_id: event.target.value })}
              required
            >
              <option value="">Selecione</option>
              {metodosPagamento.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex items-end md:col-span-2 xl:col-span-1">
            <Button className="w-full" type="submit" disabled={criar.isPending}>
              <Plus className="h-4 w-4" />
              Separar
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Contas a pagar" description="Ao pagar, a conta sai daqui e entra no historico de lancamentos.">
        {abertas.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-6 w-6" />}
            title="Nenhuma conta futura"
            description="Contas separadas para pagamento futuro aparecerao aqui."
          />
        ) : (
          <Table className="min-w-[880px] table-fixed">
            <thead>
              <tr>
                <Th className="w-[110px]">Vencimento</Th>
                <Th>Descricao</Th>
                <Th className="w-[150px]">Item</Th>
                <Th className="w-[150px]">Subitem</Th>
                <Th className="w-[130px]">Metodo</Th>
                <Th className="w-[130px]">Conta</Th>
                <Th className="w-[120px] text-right">Valor</Th>
                <Th className="w-[56px] text-center">Acao</Th>
              </tr>
            </thead>
            <tbody>
              {abertas.map((item) => (
                <tr key={item.id}>
                  <Td>{formatDate(item.data_vencimento)}</Td>
                  <Td className="truncate font-medium text-slate-100" title={item.descricao}>
                    {item.descricao}
                  </Td>
                  <Td>
                    <CategoryBadge>{categoriaNome(item.categoria_id)}</CategoryBadge>
                  </Td>
                  <Td className="truncate">{subcategoriaNome(item.subcategoria_id)}</Td>
                  <Td className="truncate">{metodoNome(item.metodo_pagamento_id)}</Td>
                  <Td className="truncate">{contaNome(item.conta_id)}</Td>
                  <Td className="text-right font-medium text-slate-100">{formatMoney(item.valor)}</Td>
                  <Td className="text-center">
                    <Button size="icon" variant="secondary" onClick={() => abrirPagamento(item)} title="Pagar" aria-label="Pagar">
                      <Check className="h-4 w-4" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>

      <Dialog open={Boolean(pagamento)} title="Pagar conta futura" onClose={() => setPagamento(null)}>
        <form className="grid gap-3" onSubmit={confirmarPagamento}>
          <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-xs font-medium text-slate-500">{pagamento?.descricao}</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{formatMoney(pagamento?.valor)}</p>
          </div>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Metodo de pagamento</span>
            <Select
              value={pagamentoForm.metodo_pagamento_id}
              onChange={(event) => setPagamentoForm({ ...pagamentoForm, metodo_pagamento_id: event.target.value })}
              required
            >
              <option value="">Selecione</option>
              {metodosPagamento.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Conta (opcional)</span>
            <Select value={pagamentoForm.conta_id} onChange={(event) => setPagamentoForm({ ...pagamentoForm, conta_id: event.target.value })}>
              <option value="">Nenhuma</option>
              {contasAtivas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Data de pagamento</span>
            <Input
              type="date"
              value={pagamentoForm.data_pagamento}
              onChange={(event) => setPagamentoForm({ ...pagamentoForm, data_pagamento: event.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Observacao</span>
            <Input value={pagamentoForm.observacao} onChange={(event) => setPagamentoForm({ ...pagamentoForm, observacao: event.target.value })} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPagamento(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pagar.isPending || !pagamentoForm.metodo_pagamento_id}>
              Confirmar pagamento
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function Resumo({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-[#111821] p-2.5">
      <p className="text-[11px] font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-100">{value}</p>
      <p className="mt-0.5 truncate text-xs text-slate-500">{detail}</p>
    </div>
  );
}
