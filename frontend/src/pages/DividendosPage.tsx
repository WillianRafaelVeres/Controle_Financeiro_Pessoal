import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote } from "lucide-react";

import { EmptyState } from "../components/finance/EmptyState";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Td, Th, Table } from "../components/ui/table";
import { DividendosForm } from "../features/investimentos/DividendosForm";
import { api } from "../lib/api";
import { formatDate, formatMoney } from "../lib/formatters";
import { INVESTMENT_TYPE_LABELS } from "../lib/investmentProfiles";

export function DividendosPage() {
  const queryClient = useQueryClient();
  const ativos = useQuery({ queryKey: ["ativos-dividendos"], queryFn: api.ativosDividendos });
  const dividendos = useQuery({ queryKey: ["dividendos"], queryFn: api.dividendos });
  const criar = useMutation({ mutationFn: api.criarDividendo, onSuccess: () => queryClient.invalidateQueries() });
  const ativoPorId = (id: string) => ativos.data?.find((item) => item.id === id);

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
                    <Td>{item.tipo_provento}</Td>
                    <Td className="text-right font-semibold text-slate-100">{formatMoney(item.valor, item.moeda === "USD" ? "USD" : "BRL")}</Td>
                    <Td className="text-right font-semibold text-amber-300">{formatMoney(item.valor_brl ?? item.valor)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
