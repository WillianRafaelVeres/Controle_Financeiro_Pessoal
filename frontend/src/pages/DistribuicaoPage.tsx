import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, Percent } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

import { EmptyState } from "../components/finance/EmptyState";
import { MoneyInput } from "../components/finance/MoneyInput";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/select";
import { Td, Th, Table } from "../components/ui/table";
import { EditarPlanoModal } from "../features/distribuicao/EditarPlanoModal";
import { api } from "../lib/api";
import { calcularDistribuicao } from "../lib/distribuicao";
import { formatMoney, formatPercent, toNumber } from "../lib/formatters";
import type { DistribuicaoPlano } from "../lib/types";

export function DistribuicaoPage() {
  const queryClient = useQueryClient();
  const planosQuery = useQuery({ queryKey: ["distribuicao-planos"], queryFn: api.distribuicaoPlanos });
  const planos = useMemo(() => planosQuery.data ?? [], [planosQuery.data]);
  const planoPorId = useMemo(() => new Map(planos.map((plano) => [plano.id, plano])), [planos]);

  const [planoId, setPlanoId] = useState("");
  const [valor, setValor] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    if (planos.length === 0) {
      setPlanoId("");
      return;
    }
    if (!planoPorId.has(planoId)) {
      setPlanoId(planos[0].id);
    }
  }, [planoId, planoPorId, planos]);

  const planoAtual = planoPorId.get(planoId) ?? null;
  const resultado = useMemo(
    () => (planoAtual ? calcularDistribuicao(toNumber(valor), planoAtual.itens) : []),
    [planoAtual, valor],
  );
  const totalCalculado = resultado.reduce((acc, item) => acc + item.valor, 0);

  function alternarExpandido(itemId: string) {
    setExpandidos((current) => {
      const proximo = new Set(current);
      if (proximo.has(itemId)) proximo.delete(itemId);
      else proximo.add(itemId);
      return proximo;
    });
  }

  function aoMudarPlanos() {
    queryClient.invalidateQueries({ queryKey: ["distribuicao-planos"] });
  }

  return (
    <div className="space-y-2">
      <PageHeader
        title="Distribuicao"
        description="Calculadora de rateio percentual. So calcula e exibe valores -- nao cria lancamento, nao mexe em saldo, conta ou investimento."
      />
      <SectionCard
        title="Calcular"
        description="Escolha um plano e digite o valor: o rateio aparece na hora, sem precisar clicar em nada."
        action={
          planos.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setEditModalOpen(true)}>
              <Pencil className="h-4 w-4" />
              Editar distribuicao
            </Button>
          )
        }
      >
        {planosQuery.isLoading ? (
          <p className="text-sm text-slate-500">Carregando planos...</p>
        ) : planos.length === 0 ? (
          <EmptyState
            icon={<Percent className="h-6 w-6" />}
            title="Nenhum plano de distribuicao"
            description="Crie um plano com os destinos e percentuais que quiser pra comecar a calcular."
            actionLabel="Criar plano"
            onAction={() => setEditModalOpen(true)}
          />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Plano</span>
                <Select value={planoId} onChange={(event) => setPlanoId(event.target.value)}>
                  {planos.map((plano) => (
                    <option key={plano.id} value={plano.id}>
                      {plano.nome}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Valor para distribuir</span>
                <MoneyInput value={valor} onChange={(event) => setValor(event.target.value)} placeholder="0,00" />
              </label>
            </div>

            {planoAtual && (
              <Table>
                <thead>
                  <tr>
                    <Th>Destino</Th>
                    <Th className="text-right">Percentual</Th>
                    <Th className="text-right">Valor</Th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.map(({ item, valor: valorItem }) => {
                    const subplano = item.subplano_id ? planoPorId.get(item.subplano_id) : null;
                    const expandido = expandidos.has(item.id);
                    return (
                      <Fragment key={item.id}>
                        <tr>
                          <Td>
                            <div className="flex items-center gap-1.5">
                              {subplano ? (
                                <button
                                  type="button"
                                  className="shrink-0 text-slate-500 transition hover:text-slate-200"
                                  onClick={() => alternarExpandido(item.id)}
                                  aria-label={expandido ? `Recolher ${item.nome}` : `Expandir ${item.nome}`}
                                  aria-expanded={expandido}
                                >
                                  {expandido ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </button>
                              ) : (
                                <span className="w-4 shrink-0" />
                              )}
                              <span className="font-medium text-slate-100">{item.nome}</span>
                            </div>
                          </Td>
                          <Td className="text-right text-slate-400">{formatPercent(item.percentual)}</Td>
                          <Td className="text-right font-semibold text-slate-100">{formatMoney(valorItem)}</Td>
                        </tr>
                        {subplano && expandido && (
                          <tr>
                            <Td colSpan={3} className="bg-slate-950/50 p-0">
                              <div className="p-3 pl-9">
                                <p className="mb-2 text-[11px] font-semibold uppercase text-slate-500">
                                  Rateio de {formatMoney(valorItem)} pelo plano &quot;{subplano.nome}&quot;
                                </p>
                                <SubDistribuicaoTable valor={valorItem} plano={subplano} />
                              </div>
                            </Td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  <tr className="bg-slate-900/60 font-semibold">
                    <Td>Total</Td>
                    <Td className="text-right text-slate-300">100%</Td>
                    <Td className="text-right text-brand-400">{formatMoney(totalCalculado)}</Td>
                  </tr>
                </tbody>
              </Table>
            )}
          </div>
        )}
      </SectionCard>

      <EditarPlanoModal
        open={editModalOpen}
        planos={planos}
        planoInicialId={planoAtual?.id ?? null}
        onClose={() => setEditModalOpen(false)}
        onChanged={aoMudarPlanos}
      />
    </div>
  );
}

function SubDistribuicaoTable({ valor, plano }: { valor: number; plano: DistribuicaoPlano }) {
  const resultado = calcularDistribuicao(valor, plano.itens);
  return (
    <div className="overflow-hidden rounded-md border border-slate-800">
      <table className="w-full text-[12px]">
        <tbody>
          {resultado.map(({ item, valor: valorItem }) => (
            <tr key={item.id} className="border-b border-slate-800/60 last:border-0">
              <Td className="py-1.5 text-slate-300">{item.nome}</Td>
              <Td className="py-1.5 text-right text-slate-500">{formatPercent(item.percentual)}</Td>
              <Td className="py-1.5 text-right font-medium text-slate-200">{formatMoney(valorItem)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
