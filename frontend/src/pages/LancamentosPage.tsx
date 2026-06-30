import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, Plus } from "lucide-react";
import { useState } from "react";

import { MonthSelector } from "../components/finance/MonthSelector";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/select";
import { EditarLancamentoModal } from "../features/lancamentos/EditarLancamentoModal";
import { LancamentosTable } from "../features/lancamentos/LancamentosTable";
import { NovoLancamentoModal } from "../features/lancamentos/NovoLancamentoModal";
import { api } from "../lib/api";
import type { Lancamento } from "../lib/types";
import { invalidateLaunchData } from "../lib/queryInvalidation";
import { currentMonth } from "../lib/utils";

export function LancamentosPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lancamento | null>(null);
  const [tipoFiltro, setTipoFiltro] = useState("");
  const opcoes = useQuery({ queryKey: ["lancamentos", "opcoes"], queryFn: api.lancamentoOpcoes });
  const lancamentos = useQuery({ queryKey: ["lancamentos", month], queryFn: () => api.lancamentos(month.ano, month.mes) });
  const atualizar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.atualizarLancamento(id, payload),
    onSuccess: () => invalidateLaunchData(queryClient),
  });
  const excluir = useMutation({ mutationFn: api.excluirLancamento, onSuccess: () => invalidateLaunchData(queryClient) });

  const filtrados = (lancamentos.data ?? []).filter((item) => !tipoFiltro || item.tipo === tipoFiltro);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Lançamentos"
        description="Registre receitas, despesas, reservas e movimentos do mês."
        actions={
          <Button onClick={() => setOpen(true)} aria-label="Novo lancamento">
            <Plus className="h-4 w-4" />
            Novo lançamento
          </Button>
        }
      />
      <SectionCard title="Filtros" description="Escolha o mês e filtre o histórico sem alterar os dados." compact>
        <div className="flex flex-wrap items-center gap-2">
          <MonthSelector ano={month.ano} mes={month.mes} onChange={setMonth} />
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Filter className="h-4 w-4" />
            Tipo
          </div>
          <div className="w-full sm:w-44">
            <Select value={tipoFiltro} onChange={(event) => setTipoFiltro(event.target.value)}>
              <option value="">Todos os tipos</option>
              <option value="GASTO">Gasto</option>
              <option value="SEPARAR">Separar</option>
              <option value="RECEITA">Receita</option>
              <option value="INVESTIMENTO">Investimento</option>
            </Select>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Histórico do período" description="Todos os lançamentos do mês selecionado.">
        <LancamentosTable
          lancamentos={filtrados}
          categorias={opcoes.data?.categorias ?? []}
          subcategorias={opcoes.data?.subcategorias ?? []}
          metodos={opcoes.data?.metodos ?? []}
          cartoes={opcoes.data?.cartoes ?? []}
          onEdit={setEditing}
          onDelete={(lancamento) => {
            if (window.confirm("Excluir este lançamento?")) excluir.mutate(lancamento.id);
          }}
        />
      </SectionCard>
      <EditarLancamentoModal
        lancamento={editing}
        categorias={opcoes.data?.categorias ?? []}
        subcategorias={opcoes.data?.subcategorias ?? []}
        metodos={opcoes.data?.metodos ?? []}
        onClose={() => setEditing(null)}
        onSubmit={async (id, payload) => {
          await atualizar.mutateAsync({ id, payload });
        }}
      />
      <NovoLancamentoModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
