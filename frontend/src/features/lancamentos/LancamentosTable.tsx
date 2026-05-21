import { Pencil, ReceiptText, Trash2 } from "lucide-react";

import { CategoryBadge } from "../../components/finance/CategoryBadge";
import { DataTable } from "../../components/finance/DataTable";
import { EmptyState } from "../../components/finance/EmptyState";
import { PaymentMethodBadge } from "../../components/finance/PaymentMethodBadge";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Td, Th } from "../../components/ui/table";
import { formatDate, formatMoney } from "../../lib/formatters";
import type { Categoria, Lancamento, MetodoPagamento, Subcategoria } from "../../lib/types";

interface LancamentosTableProps {
  lancamentos: Lancamento[];
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  metodos: MetodoPagamento[];
  onEdit?: (lancamento: Lancamento) => void;
  onDelete?: (lancamento: Lancamento) => void;
}

export function LancamentosTable({ lancamentos, categorias, subcategorias, metodos, onEdit, onDelete }: LancamentosTableProps) {
  const catObj = (id?: string) => categorias.find((item) => item.id === id);
  const subObj = (id?: string) => subcategorias.find((item) => item.id === id);
  const cat = (item: Lancamento) => item.categoria_nome_snapshot ?? catObj(item.categoria_id)?.nome ?? "-";
  const sub = (item: Lancamento) => item.subcategoria_nome_snapshot ?? subObj(item.subcategoria_id)?.nome ?? "-";
  const metodo = (id?: string) => metodos.find((item) => item.id === id);

  return (
    <DataTable
      data={lancamentos}
      searchText={(item) => `${item.tipo} ${item.observacao ?? ""} ${cat(item)}`}
      empty={
        <EmptyState
          icon={<ReceiptText className="h-6 w-6" />}
          title="Nenhum lancamento neste mes"
          description="Comece registrando sua primeira receita ou despesa."
        />
      }
    >
      {(items) => (
        <>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Tipo</Th>
              <Th>Valor</Th>
              <Th>Categoria</Th>
              <Th>Subcategoria</Th>
              <Th>Metodo</Th>
              <Th>Observacao</Th>
              {(onEdit || onDelete) && <Th className="w-[74px] text-center">Acoes</Th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const method = metodo(item.metodo_pagamento_id);
              return (
                <tr key={item.id}>
                  <Td>{formatDate(item.data_lancamento)}</Td>
                  <Td>
                    <Badge tone={item.tipo === "GASTO" ? "red" : item.tipo === "RECEITA" ? "green" : "blue"}>{item.tipo}</Badge>
                  </Td>
                  <Td className="font-medium text-slate-950">{formatMoney(item.valor)}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1">
                      <CategoryBadge>{cat(item)}</CategoryBadge>
                      {catObj(item.categoria_id)?.ativa === false && <Badge tone="neutral">inativa</Badge>}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1">
                      <span>{sub(item)}</span>
                      {subObj(item.subcategoria_id)?.ativa === false && <Badge tone="neutral">inativa</Badge>}
                    </div>
                  </Td>
                  <Td>{method ? <PaymentMethodBadge nome={method.nome} tipo={method.tipo_metodo} /> : "-"}</Td>
                  <Td className="max-w-64 truncate">{item.observacao ?? "-"}</Td>
                  {(onEdit || onDelete) && (
                    <Td className="text-center">
                      <div className="inline-flex items-center gap-1">
                        {onEdit && (
                          <Button size="icon" variant="secondary" title="Editar lancamento" aria-label="Editar lancamento" onClick={() => onEdit(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {onDelete && (
                          <Button size="icon" variant="ghost" title="Excluir lancamento" aria-label="Excluir lancamento" onClick={() => onDelete(item)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </>
      )}
    </DataTable>
  );
}
