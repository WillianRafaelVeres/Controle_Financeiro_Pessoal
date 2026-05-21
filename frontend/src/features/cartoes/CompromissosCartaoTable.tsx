import { useState } from "react";

import { CategoryBadge } from "../../components/finance/CategoryBadge";
import { MoneyInput } from "../../components/finance/MoneyInput";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Td, Th, Table } from "../../components/ui/table";
import { formatDate, formatMoney } from "../../lib/formatters";
import type { CartaoResumo, Categoria, CompromissoCartao, Subcategoria } from "../../lib/types";

interface Props {
  compromissos: CompromissoCartao[];
  cartoes: CartaoResumo[];
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  onSeparar: (id: string, valor: number) => Promise<void>;
}

export function CompromissosCartaoTable({ compromissos, cartoes, categorias, subcategorias, onSeparar }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const cartaoNome = (id: string) => cartoes.find((item) => item.id === id)?.nome ?? "-";
  const categoria = (id?: string) => categorias.find((item) => item.id === id)?.nome ?? "-";
  const subcategoria = (id?: string) => subcategorias.find((item) => item.id === id)?.nome ?? "-";

  return (
    <Table>
      <thead>
        <tr>
          <Th>Data</Th>
          <Th>Cartao</Th>
          <Th>Item</Th>
          <Th>Subitem</Th>
          <Th>Compra</Th>
          <Th>A vista</Th>
          <Th>Parcelado</Th>
          <Th>Status</Th>
          <Th>Separar</Th>
        </tr>
      </thead>
      <tbody>
        {compromissos.map((item) => (
          <tr key={item.id}>
            <Td>{formatDate(item.data_compra)}</Td>
            <Td>{cartaoNome(item.cartao_id)}</Td>
            <Td>
              <CategoryBadge>{categoria(item.categoria_id)}</CategoryBadge>
            </Td>
            <Td>{subcategoria(item.subcategoria_id)}</Td>
            <Td>{formatMoney(item.valor_original)}</Td>
            <Td>{formatMoney(item.valor_separado)}</Td>
            <Td className="font-medium text-slate-950">{formatMoney(item.valor_em_aberto)}</Td>
            <Td>
              <Badge tone={item.status === "QUITADO" ? "green" : item.status === "PARCIAL" ? "yellow" : "red"}>{item.status}</Badge>
            </Td>
            <Td>
              <div className="flex min-w-56 items-center gap-2">
                <MoneyInput
                  className="w-28"
                  value={drafts[item.id] ?? ""}
                  onChange={(event) => setDrafts({ ...drafts, [item.id]: event.target.value })}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await onSeparar(item.id, Number(drafts[item.id] ?? 0));
                    setDrafts({ ...drafts, [item.id]: "" });
                  }}
                >
                  Separar
                </Button>
              </div>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
