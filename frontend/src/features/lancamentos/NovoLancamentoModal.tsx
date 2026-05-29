import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Dialog } from "../../components/ui/dialog";
import { api } from "../../lib/api";
import type { NaturezaCategoria, TipoLancamento } from "../../lib/types";
import { LancamentoForm } from "./LancamentoForm";

interface NovoLancamentoModalProps {
  open: boolean;
  onClose: () => void;
  initialType?: TipoLancamento;
}

export function NovoLancamentoModal({ open, onClose, initialType = "GASTO" }: NovoLancamentoModalProps) {
  const queryClient = useQueryClient();
  const categorias = useQuery({
    queryKey: ["categorias", "novo-lancamento"],
    queryFn: () => api.categorias(undefined, true),
    enabled: open,
  });
  const subcategorias = useQuery({
    queryKey: ["subcategorias", "novo-lancamento"],
    queryFn: () => api.subcategorias(undefined, true),
    enabled: open,
  });
  const metodos = useQuery({ queryKey: ["metodos", "novo-lancamento"], queryFn: api.metodos, enabled: open });
  const cartoes = useQuery({ queryKey: ["cartoes", "novo-lancamento"], queryFn: api.cartoes, enabled: open });

  const criarLancamento = useMutation({ mutationFn: api.criarLancamento });
  const criarContaFutura = useMutation({ mutationFn: api.criarContaFutura });
  const criarCategoria = useMutation({ mutationFn: api.criarCategoria });
  const criarSubcategoria = useMutation({ mutationFn: api.criarSubcategoria });
  const criarMetodo = useMutation({ mutationFn: api.criarMetodo });

  async function atualizarDadosRelacionados() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["painel"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] }),
      queryClient.invalidateQueries({ queryKey: ["planejamento"] }),
      queryClient.invalidateQueries({ queryKey: ["orcamentos"] }),
      queryClient.invalidateQueries({ queryKey: ["cartoes"] }),
      queryClient.invalidateQueries({ queryKey: ["contas"] }),
      queryClient.invalidateQueries({ queryKey: ["compromissos"] }),
      queryClient.invalidateQueries({ queryKey: ["contas_futuras"] }),
      queryClient.invalidateQueries({ queryKey: ["caixinhas"] }),
      queryClient.invalidateQueries({ queryKey: ["relatorios"] }),
    ]);
  }

  return (
    <Dialog open={open} title="Novo lancamento" onClose={onClose} className="max-w-6xl">
      <LancamentoForm
        categorias={categorias.data ?? []}
        subcategorias={subcategorias.data ?? []}
        metodos={metodos.data ?? []}
        cartoes={cartoes.data ?? []}
        initialType={initialType}
        onSubmit={async (payload) => {
          await criarLancamento.mutateAsync(payload);
          await atualizarDadosRelacionados();
          onClose();
        }}
        onCreateContaFutura={async (payload) => {
          await criarContaFutura.mutateAsync(payload);
          await atualizarDadosRelacionados();
          onClose();
        }}
        onCreateCategoria={async (nome, natureza: NaturezaCategoria) => {
          const categoria = await criarCategoria.mutateAsync({ nome, natureza });
          await queryClient.invalidateQueries({ queryKey: ["categorias"] });
          return { id: categoria.id, label: categoria.nome };
        }}
        onCreateSubcategoria={async (nome, categoria_id) => {
          const subcategoria = await criarSubcategoria.mutateAsync({ nome, categoria_id });
          await queryClient.invalidateQueries({ queryKey: ["subcategorias"] });
          return { id: subcategoria.id, label: subcategoria.nome };
        }}
        onCreateMetodo={async (nome) => {
          const metodo = await criarMetodo.mutateAsync({ nome });
          await queryClient.invalidateQueries({ queryKey: ["metodos"] });
          return { id: metodo.id, label: metodo.nome };
        }}
      />
    </Dialog>
  );
}
