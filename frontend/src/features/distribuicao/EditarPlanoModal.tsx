import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "../../components/finance/ConfirmDialog";
import { PercentInput } from "../../components/finance/PercentInput";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { api } from "../../lib/api";
import { validarSoma100 } from "../../lib/distribuicao";
import type { DistribuicaoPlano } from "../../lib/types";

interface ItemDraft {
  id: string;
  nome: string;
  percentual: string;
  subplano_id?: string | null;
}

function novoItem(): ItemDraft {
  return { id: crypto.randomUUID(), nome: "", percentual: "0" };
}

function planoParaDraft(plano: DistribuicaoPlano): ItemDraft[] {
  return plano.itens.map((item) => ({
    id: item.id,
    nome: item.nome,
    percentual: String(item.percentual),
    subplano_id: item.subplano_id,
  }));
}

export function EditarPlanoModal({
  open,
  planos,
  planoInicialId,
  onClose,
  onChanged,
}: {
  open: boolean;
  planos: DistribuicaoPlano[];
  planoInicialId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [planoId, setPlanoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [itens, setItens] = useState<ItemDraft[]>([]);
  const [erro, setErro] = useState("");
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const criar = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.criarDistribuicaoPlano(payload),
  });
  const atualizar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api.atualizarDistribuicaoPlano(id, payload),
  });
  const excluir = useMutation({
    mutationFn: (id: string) => api.excluirDistribuicaoPlano(id),
  });

  function carregarPlano(id: string | null) {
    const plano = planos.find((item) => item.id === id);
    if (plano) {
      setPlanoId(plano.id);
      setNome(plano.nome);
      setItens(planoParaDraft(plano));
    } else {
      setPlanoId(null);
      setNome("Novo plano");
      setItens([{ ...novoItem(), nome: "Novo destino", percentual: "100" }]);
    }
    setErro("");
  }

  useEffect(() => {
    if (!open) return;
    carregarPlano(planoInicialId ?? planos[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planoInicialId]);

  if (!open) return null;

  const validacao = validarSoma100(itens.map((item) => ({ id: item.id, nome: item.nome, percentual: item.percentual })));
  const salvando = criar.isPending || atualizar.isPending;
  const planoAtualNasListaOriginal = planos.find((item) => item.id === planoId) ?? null;

  function atualizarItem(id: string, patch: Partial<ItemDraft>) {
    setItens((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removerItem(id: string) {
    setItens((current) => current.filter((item) => item.id !== id));
  }

  function adicionarItem() {
    setItens((current) => [...current, novoItem()]);
  }

  function moverItem(index: number, direcao: -1 | 1) {
    setItens((current) => {
      const alvo = index + direcao;
      if (alvo < 0 || alvo >= current.length) return current;
      const copia = [...current];
      [copia[index], copia[alvo]] = [copia[alvo], copia[index]];
      return copia;
    });
  }

  async function salvar() {
    setErro("");
    if (!nome.trim()) {
      setErro("Informe um nome para o plano.");
      return;
    }
    if (itens.some((item) => !item.nome.trim())) {
      setErro("Todo destino precisa de um nome.");
      return;
    }
    if (!validacao.valido) {
      setErro(
        validacao.diferenca > 0
          ? `Total atual: ${validacao.soma}% -- faltam ${validacao.diferenca}%.`
          : `Total atual: ${validacao.soma}% -- excedem ${Math.abs(validacao.diferenca)}%.`,
      );
      return;
    }

    const payload = {
      nome: nome.trim(),
      itens: itens.map((item) => ({
        id: item.id,
        nome: item.nome.trim(),
        percentual: item.percentual,
        subplano_id: item.subplano_id ?? null,
      })),
    };

    try {
      if (planoAtualNasListaOriginal) {
        await atualizar.mutateAsync({ id: planoAtualNasListaOriginal.id, payload });
      } else {
        await criar.mutateAsync(payload);
      }
      onChanged();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel salvar o plano.");
    }
  }

  async function confirmarExclusao() {
    if (!planoAtualNasListaOriginal) return;
    setConfirmandoExclusao(false);
    try {
      await excluir.mutateAsync(planoAtualNasListaOriginal.id);
      await queryClient.invalidateQueries({ queryKey: ["distribuicao-planos"] });
      onChanged();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel excluir o plano.");
    }
  }

  return (
    <>
      <Dialog open={open} title="Editar distribuicao" onClose={onClose} className="max-w-2xl">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">Plano</span>
              <Select value={planoId ?? ""} onChange={(event) => carregarPlano(event.target.value)}>
                {!planoId && <option value="">Novo plano</option>}
                {planos.map((plano) => (
                  <option key={plano.id} value={plano.id}>
                    {plano.nome}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex items-end">
              <Button variant="secondary" size="sm" onClick={() => carregarPlano(null)}>
                <Plus className="h-4 w-4" />
                Novo plano
              </Button>
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-500">Nome do plano</span>
            <Input value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Ex.: Renda Extra" />
          </label>

          <div className="space-y-2">
            <span className="text-xs font-medium text-slate-500">Destinos</span>
            <div className="space-y-1.5">
              {itens.map((item, index) => (
                <div key={item.id} className="flex items-center gap-1.5">
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      className="text-slate-500 hover:text-slate-200 disabled:opacity-30"
                      disabled={index === 0}
                      onClick={() => moverItem(index, -1)}
                      aria-label="Mover para cima"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="text-slate-500 hover:text-slate-200 disabled:opacity-30"
                      disabled={index === itens.length - 1}
                      onClick={() => moverItem(index, 1)}
                      aria-label="Mover para baixo"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Input
                    className="min-w-0 flex-1"
                    value={item.nome}
                    onChange={(event) => atualizarItem(item.id, { nome: event.target.value })}
                    placeholder="Nome do destino"
                    aria-label={`Nome do destino ${index + 1}`}
                  />
                  <PercentInput
                    className="w-20 shrink-0 text-right"
                    value={item.percentual}
                    onChange={(event) => atualizarItem(item.id, { percentual: event.target.value })}
                    aria-label={`Percentual do destino ${index + 1}`}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Remover destino"
                    aria-label="Remover destino"
                    disabled={itens.length <= 1}
                    onClick={() => removerItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={adicionarItem}>
              <Plus className="h-4 w-4" />
              Adicionar destino
            </Button>
          </div>

          <div
            className={
              validacao.valido
                ? "rounded-md border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm font-medium text-brand-400"
                : "rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300"
            }
          >
            {validacao.valido
              ? `Total: ${validacao.soma}% -- pronto para salvar.`
              : `Total atual: ${validacao.soma}% -- ${validacao.diferenca > 0 ? `faltam ${validacao.diferenca}%` : `excedem ${Math.abs(validacao.diferenca)}%`}.`}
          </div>

          {erro && <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs font-medium text-red-300">{erro}</div>}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            {planoAtualNasListaOriginal ? (
              <Button variant="ghost" className="text-red-300 hover:text-red-200" disabled={excluir.isPending} onClick={() => setConfirmandoExclusao(true)}>
                Excluir plano
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button disabled={salvando || !validacao.valido} onClick={salvar}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmandoExclusao}
        title="Excluir plano"
        description={`O plano "${nome}" sera excluido. Isso e' so uma configuracao da calculadora -- nao afeta nenhum lancamento, conta ou investimento.`}
        onConfirm={confirmarExclusao}
        onCancel={() => setConfirmandoExclusao(false)}
      />
    </>
  );
}
