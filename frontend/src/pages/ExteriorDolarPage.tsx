import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Minus, Plus, SlidersHorizontal } from "lucide-react";
import type React from "react";
import { useState } from "react";

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

export type ActionType = "ENVIO" | "RETIRADA" | "AJUSTE_POSITIVO" | "AJUSTE_NEGATIVO" | "SALDO";

export function ExteriorDolarPage() {
  const queryClient = useQueryClient();
  const resumo = useQuery({ queryKey: ["dolar-resumo"], queryFn: api.dolarResumo });
  const extrato = useQuery({ queryKey: ["dolar-extrato"], queryFn: api.dolarExtrato });
  const movimento = useMutation({ mutationFn: api.dolarMovimento, onSuccess: () => queryClient.invalidateQueries() });
  const informarSaldo = useMutation({ mutationFn: api.dolarInformarSaldo, onSuccess: () => queryClient.invalidateQueries() });
  const [action, setAction] = useState<ActionType | null>(null);

  const data = resumo.data;
  const diferenca = toNumber(data?.diferenca_conciliacao_usd);
  const conciliado = Math.abs(diferenca) < 0.01;

  return (
    <div className="space-y-2">
      <PageHeader
        title="Exterior/Dólar"
        description="Conta dólar teórica com entradas, saídas, dividendos, compras e vendas no exterior."
        actions={
          <>
            <Button onClick={() => setAction("ENVIO")}>
              <Plus className="h-4 w-4" />
              Enviar dólar
            </Button>
            <Button variant="secondary" onClick={() => setAction("RETIRADA")}>
              <Minus className="h-4 w-4" />
              Retirar dólar
            </Button>
            <Button variant="secondary" onClick={() => setAction("AJUSTE_POSITIVO")}>
              <SlidersHorizontal className="h-4 w-4" />
              Ajuste manual
            </Button>
            <Button variant="secondary" onClick={() => setAction("SALDO")}>
              Informar saldo real
            </Button>
          </>
        }
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <UsdCard title="Saldo teórico em USD" value={data?.saldo_teorico_usd} subtitle="Calculado pelo extrato dólar" />
        <UsdCard title="Saldo informado" value={data?.saldo_informado_usd} subtitle="Valor da conta real" />
        <UsdCard title="Diferença" value={data?.diferenca_conciliacao_usd} subtitle={conciliado ? "Conta dólar conciliada" : "Verifique movimentos"} danger={!conciliado} />
        <section className="rounded-md border border-slate-800 bg-[#111821] p-3">
          <p className="text-xs font-medium uppercase text-slate-500">Dolar medio</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">{formatMoney(data?.dolar_medio)}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {formatMoney(data?.total_brl_enviado)} enviados | {formatMoney(data?.total_usd_recebido, "USD")} recebidos
          </p>
        </section>
      </div>
      <SectionCard title="Conferência">
        <div className={conciliado ? "rounded-md bg-brand-500/15 p-2 text-[13px] font-medium text-brand-500" : "rounded-md bg-amber-500/15 p-2 text-[13px] font-medium text-amber-400"}>
          {conciliado
            ? "Conta dólar conciliada."
            : "Existe diferença entre o saldo teórico e o saldo informado. Verifique envios, retiradas, dividendos, compras ou vendas."}
        </div>
      </SectionCard>
      <SectionCard title="Extrato dólar">
        {(extrato.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<DollarSign className="h-6 w-6" />}
            title="Sem movimentos em dólar"
            description="Envios, retiradas, compras, vendas e dividendos em USD aparecerão aqui."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Tipo</Th>
                <Th>Descrição</Th>
                <Th>Entrada USD</Th>
                <Th>Saída USD</Th>
                <Th>BRL</Th>
                <Th>Cotação</Th>
                <Th>Saldo acumulado</Th>
                <Th>Origem</Th>
              </tr>
            </thead>
            <tbody>
              {(extrato.data ?? []).map((item) => (
                <tr key={item.id}>
                  <Td>{formatDate(item.data_movimento)}</Td>
                  <Td>{item.tipo}</Td>
                  <Td>{item.descricao ?? "-"}</Td>
                  <Td>{formatMoney(item.entrada_usd, "USD")}</Td>
                  <Td>{formatMoney(item.saida_usd, "USD")}</Td>
                  <Td>{formatMoney(item.valor_brl)}</Td>
                  <Td>{formatMoney(item.cotacao_efetiva)}</Td>
                  <Td className="font-medium text-slate-950">{formatMoney(item.saldo_acumulado_usd, "USD")}</Td>
                  <Td>{item.origem}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>
      <DolarActionDialog
        action={action}
        onClose={() => setAction(null)}
        onMovimento={(payload) => movimento.mutateAsync(payload).then(() => undefined)}
        onSaldo={(payload) => informarSaldo.mutateAsync(payload).then(() => undefined)}
      />
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
  onClose,
  onMovimento,
  onSaldo,
}: {
  action: ActionType | null;
  onClose: () => void;
  onMovimento: (payload: Record<string, unknown>) => Promise<void>;
  onSaldo: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [tipo, setTipo] = useState<ActionType>("AJUSTE_POSITIVO");
  const [valorUsd, setValorUsd] = useState("");
  const [valorBrl, setValorBrl] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState("");
  const [cotacao, setCotacao] = useState("");
  const isSaldo = action === "SALDO";
  const isEnvio = action === "ENVIO";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (isSaldo) {
      await onSaldo({ saldo_usd: Number(valorUsd), cotacao_brl: cotacao ? Number(cotacao) : null });
    } else {
      await onMovimento({
        tipo: action === "AJUSTE_POSITIVO" || action === "AJUSTE_NEGATIVO" ? tipo : action,
        valor_usd: Number(valorUsd),
        valor_brl: isEnvio ? Number(valorBrl || 0) : null,
        descricao: descricao || null,
        data_movimento: data || null,
      });
    }
    setValorUsd("");
    setValorBrl("");
    setDescricao("");
    setData("");
    setCotacao("");
    onClose();
  }

  return (
    <Dialog open={action !== null} title={isSaldo ? "Informar saldo real" : action === "ENVIO" ? "Enviar dolar" : "Movimento em dolar"} onClose={onClose}>
      <form className="grid gap-3" onSubmit={submit}>
        {!isSaldo && (action === "AJUSTE_POSITIVO" || action === "AJUSTE_NEGATIVO") && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Tipo de ajuste</span>
            <Select value={tipo} onChange={(event) => setTipo(event.target.value as ActionType)}>
              <option value="AJUSTE_POSITIVO">Ajuste positivo</option>
              <option value="AJUSTE_NEGATIVO">Ajuste negativo</option>
            </Select>
          </label>
        )}
        {isEnvio && (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Valor enviado em BRL</span>
            <MoneyInput value={valorBrl} onChange={(event) => setValorBrl(event.target.value)} required />
          </label>
        )}
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">{isSaldo ? "Saldo USD" : isEnvio ? "Valor recebido em USD" : "Valor USD"}</span>
          <MoneyInput value={valorUsd} onChange={(event) => setValorUsd(event.target.value)} required />
        </label>
        {isSaldo ? (
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Cotação BRL opcional</span>
            <MoneyInput value={cotacao} onChange={(event) => setCotacao(event.target.value)} />
          </label>
        ) : (
          <>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">Data</span>
              <Input type="date" value={data} onChange={(event) => setData(event.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">Descrição</span>
              <Input value={descricao} onChange={(event) => setDescricao(event.target.value)} />
            </label>
          </>
        )}
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
