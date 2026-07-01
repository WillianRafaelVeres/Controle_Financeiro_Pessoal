import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Dialog } from "../../components/ui/dialog";
import { api } from "../../lib/api";
import { invalidateLaunchData } from "../../lib/queryInvalidation";
import type { NaturezaCategoria, TipoLancamento } from "../../lib/types";
import { LancamentoForm } from "./LancamentoForm";

interface NovoLancamentoModalProps {
  open: boolean;
  onClose: () => void;
  initialType?: TipoLancamento;
}

export function NovoLancamentoModal({ open, onClose, initialType = "GASTO" }: NovoLancamentoModalProps) {
  const queryClient = useQueryClient();
  const opcoes = useQuery({
    queryKey: ["lancamentos", "opcoes"],
    queryFn: api.lancamentoOpcoes,
    enabled: open,
  });

  const criarLancamento = useMutation({ mutationFn: api.criarLancamento });
  const criarContaFutura = useMutation({ mutationFn: api.criarContaFutura });
  const criarCategoria = useMutation({ mutationFn: api.criarCategoria });
  const criarSubcategoria = useMutation({ mutationFn: api.criarSubcategoria });
  const criarMetodo = useMutation({ mutationFn: api.criarMetodo });

  function atualizarDadosRelacionados() {
    invalidateLaunchData(queryClient);
  }

  return (
    <Dialog open={open} title="Novo lancamento" onClose={onClose} className="max-w-6xl">
      <LancamentoForm
        categorias={opcoes.data?.categorias ?? []}
        subcategorias={opcoes.data?.subcategorias ?? []}
        metodos={opcoes.data?.metodos ?? []}
        cartoes={opcoes.data?.cartoes ?? []}
        initialType={initialType}
        onSubmit={async (payload) => {
          await criarLancamento.mutateAsync(payload);
          atualizarDadosRelacionados();
          onClose();
        }}
        onCreateContaFutura={async (payload) => {
          await criarContaFutura.mutateAsync(payload);
          atualizarDadosRelacionados();
          onClose();
        }}
        onCreateCategoria={async (nome, natureza: NaturezaCategoria) => {
          const categoria = await criarCategoria.mutateAsync({ nome, natureza });
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["categorias"] }),
            queryClient.invalidateQueries({ queryKey: ["lancamentos", "opcoes"] }),
          ]);
          return { id: categoria.id, label: categoria.nome };
        }}
        onCreateSubcategoria={async (nome, categoria_id) => {
          const subcategoria = await criarSubcategoria.mutateAsync({ nome, categoria_id });
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["subcategorias"] }),
            queryClient.invalidateQueries({ queryKey: ["lancamentos", "opcoes"] }),
          ]);
          return { id: subcategoria.id, label: subcategoria.nome };
        }}
        onCreateMetodo={async (nome) => {
          const metodo = await criarMetodo.mutateAsync({ nome });
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["metodos"] }),
            queryClient.invalidateQueries({ queryKey: ["lancamentos", "opcoes"] }),
          ]);
          return { id: metodo.id, label: metodo.nome };
        }}
      />
    </Dialog>
  );
}
