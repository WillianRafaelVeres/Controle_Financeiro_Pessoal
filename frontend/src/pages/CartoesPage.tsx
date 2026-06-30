import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "../components/finance/EmptyState";
import { SectionCard } from "../components/finance/SectionCard";
import { Select } from "../components/ui/select";
import { PageHeader } from "../components/layout/PageHeader";
import { CartaoResumoCard } from "../features/cartoes/CartaoResumoCard";
import { CompromissosCartaoTable } from "../features/cartoes/CompromissosCartaoTable";
import { api } from "../lib/api";
import { invalidateCardData, invalidateLaunchData } from "../lib/queryInvalidation";

export function CartoesPage() {
  const queryClient = useQueryClient();
  const [cartaoFiltro, setCartaoFiltro] = useState("");
  const cartoes = useQuery({ queryKey: ["cartoes"], queryFn: api.cartoes });
  const compromissos = useQuery({ queryKey: ["compromissos"], queryFn: api.compromissos });
  const categorias = useQuery({ queryKey: ["categorias", "cartoes"], queryFn: () => api.categorias(undefined, true) });
  const subcategorias = useQuery({ queryKey: ["subcategorias", "cartoes"], queryFn: () => api.subcategorias(undefined, true) });
  const compromissosAbertos = (compromissos.data ?? [])
    .filter((item) => Number(item.valor_em_aberto) > 0)
    .filter((item) => !cartaoFiltro || item.cartao_id === cartaoFiltro)
    .sort((a, b) => {
      const cardCompare = (cartoes.data?.find((item) => item.id === a.cartao_id)?.nome ?? "").localeCompare(cartoes.data?.find((item) => item.id === b.cartao_id)?.nome ?? "");
      if (cardCompare !== 0) return cardCompare;
      return b.data_compra.localeCompare(a.data_compra);
    });
  const atualizarCartao = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.atualizarCartao(id, payload),
    onSuccess: () => invalidateCardData(queryClient),
  });
  const pagarFatura = useMutation({
    mutationFn: ({ id, valor }: { id: string; valor: number }) => api.pagarFatura(id, valor),
    onSuccess: () => invalidateCardData(queryClient),
  });
  const separar = useMutation({
    mutationFn: ({ id, valor }: { id: string; valor: number }) => api.separarCompromisso(id, valor),
    onSuccess: () => invalidateLaunchData(queryClient),
  });

  return (
    <div className="space-y-3">
      <PageHeader title="Cartões" description="Conferencia entre limite utilizado, compras a vista e compras parceladas." />
      {(cartoes.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-6 w-6" />}
          title="Nenhum cartao cadastrado"
          description="Cadastre um cartao em Configuracoes para controlar compras a vista e parceladas."
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {(cartoes.data ?? []).map((cartao) => (
            <CartaoResumoCard
              key={cartao.id}
              cartao={cartao}
              onInformarLimite={async (cartaoId, valor) => {
                await atualizarCartao.mutateAsync({ id: cartaoId, payload: { limite_utilizado_informado: valor } });
              }}
              onPagarFatura={async (cartaoId, valor) => {
                await pagarFatura.mutateAsync({ id: cartaoId, valor });
              }}
            />
          ))}
        </div>
      )}
      <SectionCard
        title="Compras parceladas a separar"
        description="Ao separar um valor, ele vira gasto do mes e entra no orcamento pelo item e subitem informados."
        action={
          <div className="w-full sm:w-56">
            <Select value={cartaoFiltro} onChange={(event) => setCartaoFiltro(event.target.value)}>
              <option value="">Todos os cartões</option>
              {(cartoes.data ?? []).map((cartao) => (
                <option key={cartao.id} value={cartao.id}>
                  {cartao.nome}
                </option>
              ))}
            </Select>
          </div>
        }
      >
        {compromissosAbertos.length === 0 ? (
          <EmptyState title="Nenhuma compra parcelada" description="Compras no cartao com valor futuro aparecerao aqui." />
        ) : (
          <CompromissosCartaoTable
            compromissos={compromissosAbertos}
            cartoes={cartoes.data ?? []}
            categorias={categorias.data ?? []}
            subcategorias={subcategorias.data ?? []}
            onSeparar={async (id, valor) => {
              await separar.mutateAsync({ id, valor });
            }}
          />
        )}
      </SectionCard>
    </div>
  );
}
