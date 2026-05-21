import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Plus, RefreshCw } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

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
import type { Conta } from "../lib/types";

const tiposConta = [
  ["CONTA_CORRENTE", "Conta corrente"],
  ["CARTEIRA_DIGITAL", "Carteira digital"],
  ["CORRETORA", "Corretora"],
  ["CONTA_EXTERIOR", "Conta exterior"],
  ["DINHEIRO_FISICO", "Dinheiro fisico"],
  ["OUTRO", "Outro"],
];

export function ContasPage() {
  const queryClient = useQueryClient();
  const contas = useQuery({ queryKey: ["contas", "todas"], queryFn: () => api.contas(true) });
  const criar = useMutation({ mutationFn: api.criarConta, onSuccess: () => queryClient.invalidateQueries() });
  const atualizar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.atualizarConta(id, payload),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const atualizarSaldo = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.atualizarSaldoConta(id, payload),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const inativar = useMutation({ mutationFn: api.inativarConta, onSuccess: () => queryClient.invalidateQueries() });
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
    .filter((conta) => conta.entra_no_saldo_em_contas)
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
        description="Saldos informados manualmente para alimentar Painel e Conciliação."
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

      <div className="grid gap-2 md:grid-cols-4">
        <Summary label="Total em contas" value={formatMoney(total)} />
        <Summary label="Contas ativas" value={String(ativas.length)} />
        <Summary label="Entram no saldo" value={String(ativas.filter((conta) => conta.entra_no_saldo_em_contas).length)} />
        <Summary label="Ultima atualização" value={ultimaAtualizacao ? formatDate(ultimaAtualizacao) : "-"} />
      </div>

      <SectionCard title="Contas cadastradas">
        {lista.length === 0 ? (
          <EmptyState
            icon={<Landmark className="h-6 w-6" />}
            title="Nenhuma conta cadastrada"
            description="Cadastre suas contas e informe os saldos olhando seus bancos."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Conta</Th>
                <Th>Instituição</Th>
                <Th>Tipo</Th>
                <Th>Saldo informado</Th>
                <Th>Moeda</Th>
                <Th>Conciliação</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((conta) => (
                <tr key={conta.id} className={conta.ativa === false ? "opacity-60" : undefined}>
                  <Td className="font-medium text-slate-950">{conta.nome}</Td>
                  <Td>{conta.instituicao ?? conta.banco ?? "-"}</Td>
                  <Td>{tiposConta.find(([key]) => key === conta.tipo_conta)?.[1] ?? conta.tipo_conta ?? "-"}</Td>
                  <Td>{formatMoney(conta.saldo_atual_informado)}</Td>
                  <Td>{conta.moeda ?? "BRL"}</Td>
                  <Td>{conta.entra_no_saldo_em_contas ? "Entra" : "Não entra"}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setSaldoConta(conta)}>
                        <RefreshCw className="h-4 w-4" />
                        Atualizar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditing(conta);
                          setFormOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setHistoryConta(conta)}>
                        Histórico
                      </Button>
                      {conta.ativa !== false && (
                        <Button size="sm" variant="danger" onClick={() => inativar.mutate(conta.id)}>
                          Inativar
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
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

      <Dialog open={Boolean(historyConta)} title="Histórico de saldos" onClose={() => setHistoryConta(null)} className="max-w-3xl">
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Saldo</Th>
              <Th>Observação</Th>
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

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-md border border-slate-800 bg-[#111821] p-2.5">
      <p className="text-[11px] font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-100">{value}</p>
    </section>
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
      entra_no_saldo_em_contas: entra,
      conta_gasto: entra,
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
          <span className="text-xs font-medium text-slate-500">Instituição</span>
          <Input value={instituicao} onChange={(event) => setInstituicao(event.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Tipo</span>
            <Select value={tipo} onChange={(event) => setTipo(event.target.value)}>
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
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={entra} onChange={(event) => setEntra(event.target.checked)} />
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
          Saldo atual anterior: <strong className="text-slate-950">{formatMoney(conta?.saldo_atual_informado)}</strong>
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
          <span className="text-xs font-medium text-slate-500">Observação</span>
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
