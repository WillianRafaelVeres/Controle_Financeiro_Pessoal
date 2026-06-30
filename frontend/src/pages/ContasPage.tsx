import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarDays, History, Landmark, Pencil, Plus, Power, RefreshCw, WalletCards } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "../components/finance/EmptyState";
import { MoneyInput } from "../components/finance/MoneyInput";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Td, Th, Table } from "../components/ui/table";
import { api } from "../lib/api";
import { formatDate, formatMoney, toNumber } from "../lib/formatters";
import { invalidateSettingsData } from "../lib/queryInvalidation";
import type { Conta } from "../lib/types";

const tiposConta = [
  ["CONTA_CORRENTE", "Conta corrente"],
  ["CARTEIRA_DIGITAL", "Carteira digital"],
  ["CORRETORA", "Corretora"],
  ["CONTA_EXTERIOR", "Conta exterior"],
  ["DINHEIRO_FISICO", "Dinheiro fisico"],
  ["OUTRO", "Outro"],
];

const tiposContaForaConciliacao = new Set(["CORRETORA", "CONTA_EXTERIOR", "INVESTIMENTO"]);

function entraNaConciliacao(conta: Conta) {
  return Boolean(conta.entra_no_saldo_em_contas && conta.conta_gasto && !tiposContaForaConciliacao.has(conta.tipo_conta ?? ""));
}

export function ContasPage() {
  const queryClient = useQueryClient();
  const contas = useQuery({ queryKey: ["contas", "todas"], queryFn: () => api.contas(true) });
  const criar = useMutation({ mutationFn: api.criarConta, onSuccess: () => invalidateSettingsData(queryClient) });
  const atualizar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.atualizarConta(id, payload),
    onSuccess: () => invalidateSettingsData(queryClient),
  });
  const atualizarSaldo = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.atualizarSaldoConta(id, payload),
    onSuccess: () => invalidateSettingsData(queryClient),
  });
  const inativar = useMutation({ mutationFn: api.inativarConta, onSuccess: () => invalidateSettingsData(queryClient) });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Conta | null>(null);
  const [saldoConta, setSaldoConta] = useState<Conta | null>(null);
  const [historyConta, setHistoryConta] = useState<Conta | null>(null);
  const historico = useQuery({
    queryKey: ["contas", historyConta?.id, "historico"],
    queryFn: () => api.historicoSaldosConta(historyConta?.id ?? ""),
    enabled: Boolean(historyConta),
  });

  const lista = contas.data ?? [];
  const ativas = lista.filter((conta) => conta.ativa !== false);
  const total = ativas
    .filter(entraNaConciliacao)
    .reduce((acc, conta) => acc + toNumber(conta.saldo_atual_informado), 0);
  const ultimaAtualizacao = useMemo(
    () =>
      ativas
        .map((conta) => conta.atualizado_em)
        .filter(Boolean)
        .sort()
        .at(-1),
    [ativas],
  );

  return (
    <div className="space-y-2">
      <PageHeader
        title="Contas"
        description="Saldos informados manualmente para alimentar Painel e Conciliacao."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Adicionar conta
          </Button>
        }
      />

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Saldo em contas" value={formatMoney(total)} subtitle="Contas que entram na conciliacao" tone="green" icon={<WalletCards className="h-4 w-4" />} />
        <Summary label="Contas ativas" value={String(ativas.length)} subtitle={`${lista.length} cadastrada${lista.length === 1 ? "" : "s"}`} tone="blue" icon={<Landmark className="h-4 w-4" />} />
        <Summary label="Entram no saldo" value={String(ativas.filter(entraNaConciliacao).length)} subtitle="Usadas na conciliacao" tone="yellow" icon={<RefreshCw className="h-4 w-4" />} />
        <Summary label="Ultima atualizacao" value={ultimaAtualizacao ? formatDate(ultimaAtualizacao) : "-"} subtitle="Base do saldo informado" tone="neutral" icon={<CalendarDays className="h-4 w-4" />} />
      </div>

      <SectionCard title="Contas cadastradas" description="Atualize saldos olhando o app do banco. O sistema nao altera estes valores automaticamente.">
        {lista.length === 0 ? (
          <EmptyState
            icon={<Landmark className="h-6 w-6" />}
            title="Nenhuma conta cadastrada"
            description="Cadastre suas contas e informe os saldos olhando seus bancos."
          />
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {lista.map((conta) => (
              <ContaCard
                key={conta.id}
                conta={conta}
                onAtualizar={() => setSaldoConta(conta)}
                onEditar={() => {
                  setEditing(conta);
                  setFormOpen(true);
                }}
                onHistorico={() => setHistoryConta(conta)}
                onInativar={() => inativar.mutate(conta.id)}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <ContaFormDialog
        open={formOpen}
        conta={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={async (payload) => {
          if (editing) await atualizar.mutateAsync({ id: editing.id, payload });
          else await criar.mutateAsync(payload);
          setFormOpen(false);
        }}
      />

      <AtualizarSaldoDialog
        conta={saldoConta}
        onClose={() => setSaldoConta(null)}
        onSubmit={async (payload) => {
          if (!saldoConta) return;
          await atualizarSaldo.mutateAsync({ id: saldoConta.id, payload });
          setSaldoConta(null);
        }}
      />

      <Dialog open={Boolean(historyConta)} title="Historico de saldos" onClose={() => setHistoryConta(null)} className="max-w-3xl">
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Saldo</Th>
              <Th>Observacao</Th>
            </tr>
          </thead>
          <tbody>
            {(historico.data ?? []).map((item) => (
              <tr key={item.id}>
                <Td>{formatDate(item.data_referencia)}</Td>
                <Td>{formatMoney(item.saldo_informado)}</Td>
                <Td>{item.observacao ?? "-"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Dialog>
    </div>
  );
}

function Summary({
  label,
  value,
  subtitle,
  tone,
  icon,
}: {
  label: string;
  value: string;
  subtitle: string;
  tone: "green" | "blue" | "yellow" | "neutral";
  icon: React.ReactNode;
}) {
  const toneClass = {
    green: "bg-brand-500/15 text-brand-400",
    blue: "bg-blue-500/15 text-blue-300",
    yellow: "bg-amber-500/15 text-amber-300",
    neutral: "bg-slate-800 text-slate-300",
  }[tone];
  return (
    <section className="rounded-md border border-slate-800 bg-[#111821] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">{value}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${toneClass}`}>{icon}</div>
      </div>
    </section>
  );
}

function ContaCard({
  conta,
  onAtualizar,
  onEditar,
  onHistorico,
  onInativar,
}: {
  conta: Conta;
  onAtualizar: () => void;
  onEditar: () => void;
  onHistorico: () => void;
  onInativar: () => void;
}) {
  const ativa = conta.ativa !== false;
  const tipo = tiposConta.find(([key]) => key === conta.tipo_conta)?.[1] ?? conta.tipo_conta ?? "-";
  const moedaFormatada = conta.moeda === "USD" ? "USD" : conta.moeda === "EUR" ? "EUR" : "BRL";
  return (
    <article className={`rounded-md border bg-slate-950/25 p-3 transition hover:border-slate-600 hover:bg-slate-950/40 ${ativa ? "border-slate-800" : "border-slate-800 opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-100">{conta.nome}</h3>
            <Badge tone={ativa ? "green" : "neutral"}>{ativa ? "Ativa" : "Inativa"}</Badge>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <Building2 className="h-3.5 w-3.5" />
            {conta.instituicao ?? conta.banco ?? "Sem instituicao"}
          </p>
        </div>
        <Badge tone={entraNaConciliacao(conta) ? "blue" : "yellow"}>{entraNaConciliacao(conta) ? "Entra no saldo" : "Fora do saldo"}</Badge>
      </div>

      <div className="mt-4 rounded-md bg-slate-950/50 px-3 py-2">
        <p className="text-[11px] font-medium uppercase text-slate-500">Saldo informado</p>
        <p className="mt-0.5 text-2xl font-semibold text-slate-100">{formatMoney(conta.saldo_atual_informado, moedaFormatada)}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-slate-800 px-2.5 py-2">
          <p className="text-slate-500">Tipo</p>
          <p className="mt-0.5 font-medium text-slate-200">{tipo}</p>
        </div>
        <div className="rounded-md border border-slate-800 px-2.5 py-2">
          <p className="text-slate-500">Moeda</p>
          <p className="mt-0.5 font-medium text-slate-200">{conta.moeda ?? "BRL"}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onAtualizar}>
          <RefreshCw className="h-4 w-4" />
          Atualizar saldo
        </Button>
        <Button size="sm" variant="secondary" onClick={onEditar}>
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
        <Button size="sm" variant="secondary" onClick={onHistorico}>
          <History className="h-4 w-4" />
          Historico
        </Button>
        {ativa && (
          <Button size="sm" variant="danger" onClick={onInativar}>
            <Power className="h-4 w-4" />
            Inativar
          </Button>
        )}
      </div>
    </article>
  );
}

function ContaFormDialog({
  open,
  conta,
  onClose,
  onSubmit,
}: {
  open: boolean;
  conta: Conta | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [instituicao, setInstituicao] = useState("");
  const [tipo, setTipo] = useState("CONTA_CORRENTE");
  const [moeda, setMoeda] = useState("BRL");
  const [saldoInicial, setSaldoInicial] = useState("");
  const [saldoAtual, setSaldoAtual] = useState("");
  const [entra, setEntra] = useState(true);
  const tipoForaConciliacao = tiposContaForaConciliacao.has(tipo);

  useEffect(() => {
    if (!open) return;
    setNome(conta?.nome ?? "");
    setInstituicao(conta?.instituicao ?? conta?.banco ?? "");
    setTipo(conta?.tipo_conta ?? "CONTA_CORRENTE");
    setMoeda(conta?.moeda ?? "BRL");
    setSaldoInicial(String(conta?.saldo_inicial ?? ""));
    setSaldoAtual(String(conta?.saldo_atual_informado ?? conta?.saldo_inicial ?? ""));
    setEntra(conta?.entra_no_saldo_em_contas ?? true);
  }, [conta, open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await onSubmit({
      nome,
      instituicao: instituicao || null,
      banco: instituicao || null,
      tipo_conta: tipo,
      moeda,
      saldo_inicial: Number(saldoInicial || 0),
      saldo_atual_informado: Number(saldoAtual || saldoInicial || 0),
      entra_no_saldo_em_contas: tipoForaConciliacao ? false : entra,
      conta_gasto: tipoForaConciliacao ? false : entra,
    });
  }

  return (
    <Dialog open={open} title={conta ? "Editar conta" : "Adicionar conta"} onClose={onClose}>
      <form className="grid gap-3" onSubmit={submit}>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Nome</span>
          <Input value={nome} onChange={(event) => setNome(event.target.value)} required />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Instituicao</span>
          <Input value={instituicao} onChange={(event) => setInstituicao(event.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Tipo</span>
            <Select
              value={tipo}
              onChange={(event) => {
                setTipo(event.target.value);
                if (tiposContaForaConciliacao.has(event.target.value)) setEntra(false);
              }}
            >
              {tiposConta.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Moeda</span>
            <Select value={moeda} onChange={(event) => setMoeda(event.target.value)}>
              <option value="BRL">BRL</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="OUTRA">Outra</option>
            </Select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Saldo inicial</span>
            <MoneyInput value={saldoInicial} onChange={(event) => setSaldoInicial(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Saldo atual informado</span>
            <MoneyInput value={saldoAtual} onChange={(event) => setSaldoAtual(event.target.value)} />
          </label>
        </div>
        <label className={`flex items-center gap-2 text-sm ${tipoForaConciliacao ? "text-slate-500" : "text-slate-300"}`}>
          <input type="checkbox" checked={!tipoForaConciliacao && entra} disabled={tipoForaConciliacao} onChange={(event) => setEntra(event.target.checked)} />
          Entra no saldo em contas
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Salvar</Button>
        </div>
      </form>
    </Dialog>
  );
}

function AtualizarSaldoDialog({
  conta,
  onClose,
  onSubmit,
}: {
  conta: Conta | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [saldo, setSaldo] = useState("");
  const [data, setData] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!conta) return;
    setSaldo(String(conta.saldo_atual_informado ?? ""));
    setData("");
    setObservacao("");
  }, [conta]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await onSubmit({
      saldo_informado: Number(saldo || 0),
      data_referencia: data || null,
      observacao: observacao || null,
    });
  }

  return (
    <Dialog open={Boolean(conta)} title="Atualizar saldo da conta" onClose={onClose}>
      <form className="grid gap-3" onSubmit={submit}>
        <div className="rounded-md bg-slate-950/60 p-2.5 text-[13px] text-slate-400">
          Saldo atual anterior: <strong className="text-slate-100">{formatMoney(conta?.saldo_atual_informado)}</strong>
        </div>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Novo saldo informado</span>
          <MoneyInput value={saldo} onChange={(event) => setSaldo(event.target.value)} required />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Data</span>
          <Input type="date" value={data} onChange={(event) => setData(event.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Observacao</span>
          <Input value={observacao} onChange={(event) => setObservacao(event.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Salvar saldo</Button>
        </div>
      </form>
    </Dialog>
  );
}
