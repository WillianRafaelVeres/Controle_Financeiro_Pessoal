import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote } from "lucide-react";

import { EmptyState } from "../components/finance/EmptyState";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Td, Th, Table } from "../components/ui/table";
import { DividendosForm } from "../features/investimentos/DividendosForm";
import { api } from "../lib/api";
import { formatDate, formatMoney } from "../lib/formatters";

export function DividendosPage() {
  const queryClient = useQueryClient();
  const ativos = useQuery({ queryKey: ["ativos-dividendos"], queryFn: api.ativosDividendos });
  const dividendos = useQuery({ queryKey: ["dividendos"], queryFn: api.dividendos });
  const criar = useMutation({ mutationFn: api.criarDividendo, onSuccess: () => queryClient.invalidateQueries() });
  const ativoNome = (id: string) => ativos.data?.find((item) => item.id === id)?.ticker ?? "-";

  return (
    <div className="space-y-2">
      <PageHeader title="Dividendos" description="Registro de proventos apenas para ativos com posição maior que zero." />
      <SectionCard title="Novo dividendo">
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
      <SectionCard title="Histórico">
        {(dividendos.data?.length ?? 0) === 0 ? (
          <EmptyState title="Sem dividendos registrados" description="Os proventos recebidos aparecerão neste histórico." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Ativo</Th>
                <Th>Tipo</Th>
                <Th>Valor</Th>
                <Th>Moeda</Th>
              </tr>
            </thead>
            <tbody>
              {(dividendos.data ?? []).map((item) => (
                <tr key={item.id}>
                  <Td>{formatDate(item.data_recebimento)}</Td>
                  <Td>{ativoNome(item.ativo_id)}</Td>
                  <Td>{item.tipo_provento}</Td>
                  <Td>{formatMoney(item.valor, item.moeda === "USD" ? "USD" : "BRL")}</Td>
                  <Td>{item.moeda}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
