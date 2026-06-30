import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, WalletCards } from "lucide-react";
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
import { formatMoney, toNumber } from "../lib/formatters";
import { invalidateLaunchData } from "../lib/queryInvalidation";
import type { Caixinha } from "../lib/types";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function DinheiroSeparadoPage() {
  const queryClient = useQueryClient();
  const [gasto, setGasto] = useState<Caixinha | null>(null);
  const [form, setForm] = useState({ valor: "", data_lancamento: todayIso(), metodo_pagamento_id: "", conta_id: "", observacao: "" });

  const caixinhas = useQuery({ queryKey: ["caixinhas"], queryFn: api.caixinhas });
  const categorias = useQuery({ queryKey: ["categorias", "caixinhas"], queryFn: () => api.categorias("GASTO", true) });
  const subcategorias = useQuery({ queryKey: ["subcategorias", "caixinhas"], queryFn: () => api.subcategorias(undefined, true) });
  const metodos = useQuery({ queryKey: ["metodos", "caixinhas"], queryFn: api.metodos });
  const cartoes = useQuery({ queryKey: ["cartoes", "caixinhas"], queryFn: api.cartoes });
  const contas = useQuery({ queryKey: ["contas", "caixinhas"], queryFn: () => api.contas(false) });

  const usar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.usarCaixinha(id, payload),
    onSuccess: () => invalidateLaunchData(queryClient),
  });

  const lista = useMemo(() => (caixinhas.data ?? []).filter((item) => toNumber(item.valor_total) > 0), [caixinhas.data]);
  const total = lista.reduce((acc, item) => acc + toNumber(item.valor_total), 0);
  const maiorCaixinha = [...lista].sort((a, b) => toNumber(b.valor_total) - toNumber(a.valor_total))[0];
  const categoriaNome = (id?: string | null) => categorias.data?.find((item) => item.id === id)?.nome ?? "-";
  const subcategoriaNome = (id?: string | null) => subcategorias.data?.find((item) => item.id === id)?.nome ?? "-";
  const contaNome = (id?: string | null) => contas.data?.find((item) => item.id === id)?.nome ?? "-";
  const metodosAtivos = (metodos.data ?? []).filter((item) => item.ativo && item.tipo_metodo !== "CARTAO_CREDITO");
  const cartoesAtivos = cartoes.data ?? [];
  const contasAtivas = (contas.data ?? []).filter((item) => item.ativa !== false);

  function abrirGasto(item: Caixinha) {
    setGasto(item);
    setForm({
      valor: "",
      data_lancamento: todayIso(),
      metodo_pagamento_id: item.metodo_pagamento_id ?? "",
      conta_id: item.conta_id ?? "",
      observacao: "",
    });
  }

  async function confirmarGasto(event: FormEvent) {
    event.preventDefault();
    if (!gasto || toNumber(form.valor) <= 0) return;
    await usar.mutateAsync({
      id: gasto.id,
      payload: {
        valor: toNumber(form.valor),
        data_lancamento: form.data_lancamento || null,
        metodo_pagamento_id: form.metodo_pagamento_id.startsWith("cartao:") ? null : form.metodo_pagamento_id || null,
        cartao_id: form.metodo_pagamento_id.startsWith("cartao:") ? form.metodo_pagamento_id.replace("cartao:", "") : null,
        conta_id: form.conta_id || null,
        observacao: form.observacao.trim() || null,
      },
    });
    setGasto(null);
  }

  return (
    <div className="space-y-3">
      <PageHeader title="Dinheiro separado" description="Caixinhas que ja sairam do saldo livre e continuam dentro das contas." />

      <div className="grid gap-3 md:grid-cols-[1.3fr_1fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">Total reservado</p>
              <p className="mt-1 text-2xl font-semibold text-slate-100">{formatMoney(total)}</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
              <Archive className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {lista.length === 1 ? "1 caixinha com saldo" : `${lista.length} caixinhas com saldo`}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Maior caixinha</p>
          <p className="mt-1 truncate text-lg font-semibold text-slate-100">{maiorCaixinha?.nome ?? "-"}</p>
          <p className="mt-1 text-sm text-slate-500">{formatMoney(maiorCaixinha?.valor_total ?? 0)}</p>
        </div>
      </div>

      <SectionCard title="Caixinhas" description="Use o botao de gastar quando o dinheiro sair da conta de verdade.">
        {lista.length === 0 ? (
          <EmptyState
            icon={<WalletCards className="h-6 w-6" />}
            title="Nenhum dinheiro separado"
            description="As caixinhas com saldo aparecerao aqui."
          />
        ) : (
          <Table className="min-w-[920px] table-fixed">
            <thead>
              <tr>
                <Th>Caixinha</Th>
                <Th className="w-[160px]">Categoria</Th>
                <Th className="w-[170px]">Subcategoria</Th>
                <Th className="w-[130px]">Conta</Th>
                <Th className="w-[130px] text-right">Saldo</Th>
                <Th className="w-[88px] text-center">Acao</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((item) => (
                <tr key={item.id}>
                  <Td>
                    <div>
                      <p className="font-semibold text-slate-100">{item.nome}</p>
                      {item.descricao && <p className="truncate text-xs text-slate-500">{item.descricao}</p>}
                    </div>
                  </Td>
                  <Td>
                    <CategoryBadge>{categoriaNome(item.categoria_id)}</CategoryBadge>
                  </Td>
                  <Td className="truncate">{subcategoriaNome(item.subcategoria_id)}</Td>
                  <Td className="truncate">{contaNome(item.conta_id)}</Td>
                  <Td className="text-right font-semibold text-slate-100">{formatMoney(item.valor_total)}</Td>
                  <Td className="text-center">
                    <Button size="sm" variant="secondary" onClick={() => abrirGasto(item)}>
                      <Check className="h-4 w-4" />
                      Gastar
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>

      <Dialog open={Boolean(gasto)} title="Gastar dinheiro separado" onClose={() => setGasto(null)} className="max-w-xl">
        <form className="grid gap-3" onSubmit={confirmarGasto}>
          <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-xs font-medium text-slate-500">{gasto?.nome}</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{formatMoney(gasto?.valor_total)}</p>
          </div>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Valor gasto</span>
            <MoneyInput value={form.valor} onChange={(event) => setForm({ ...form, valor: event.target.value })} required />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">Data</span>
              <Input type="date" value={form.data_lancamento} onChange={(event) => setForm({ ...form, data_lancamento: event.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">Metodo usado agora</span>
              <Select value={form.metodo_pagamento_id} onChange={(event) => setForm({ ...form, metodo_pagamento_id: event.target.value })}>
                <option value="">Nao informar</option>
                {metodosAtivos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
                {cartoesAtivos.map((item) => (
                  <option key={item.id} value={`cartao:${item.id}`}>
                    {item.nome} (cartao)
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Conta</span>
            <Select value={form.conta_id} onChange={(event) => setForm({ ...form, conta_id: event.target.value })}>
              <option value="">Nao informar</option>
              {contasAtivas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Observacao</span>
            <Input value={form.observacao} onChange={(event) => setForm({ ...form, observacao: event.target.value })} placeholder="Opcional" />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGasto(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={usar.isPending || toNumber(form.valor) <= 0}>
              Confirmar
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
