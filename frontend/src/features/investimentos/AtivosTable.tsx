import { CircleDollarSign, RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Td, Th, Table } from "../../components/ui/table";
import { formatMoney, toNumber } from "../../lib/formatters";
import { INVESTMENT_TYPE_LABELS, needsTicker } from "../../lib/investmentProfiles";
import type { Posicao } from "../../lib/types";

interface AtivosTableProps {
  posicoes: Posicao[];
  onSell?: (posicao: Posicao) => void;
  onUpdatePrice?: (posicao: Posicao, preco: number) => Promise<void>;
  onFetchPrice?: (posicao: Posicao) => Promise<void>;
}

export function AtivosTable({ posicoes, onSell, onUpdatePrice, onFetchPrice }: AtivosTableProps) {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setPrices(
      Object.fromEntries(
        posicoes.map((item) => [item.ativo_id, String(toNumber(item.preco_atual ?? item.preco_medio) || "")]),
      ),
    );
  }, [posicoes]);

  async function savePrice(item: Posicao) {
    if (!onUpdatePrice) return;
    const preco = toNumber(prices[item.ativo_id]);
    if (preco <= 0) {
      alert("Informe um preco atual maior que zero.");
      return;
    }
    setBusyId(item.ativo_id);
    try {
      await onUpdatePrice(item, preco);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Nao foi possivel salvar o preco atual.");
    } finally {
      setBusyId(null);
    }
  }

  async function fetchPrice(item: Posicao) {
    if (!onFetchPrice) return;
    setBusyId(item.ativo_id);
    try {
      await onFetchPrice(item);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Nao foi possivel buscar a cotacao.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Table className="min-w-[1080px]">
      <thead>
        <tr>
          <Th>Ativo</Th>
          <Th>Tipo</Th>
          <Th>Conta/corretora</Th>
          <Th>Quantidade</Th>
          <Th>Preco medio</Th>
          <Th>Preco atual</Th>
          <Th>Valor aportado</Th>
          <Th>Valor atual</Th>
          <Th>Lucro/prejuizo</Th>
          <Th className="w-[48px] text-center">Acoes</Th>
        </tr>
      </thead>
      <tbody>
        {posicoes.map((item) => {
          const tickerVisivel = needsTicker(item.tipo_ativo);
          const moeda = item.moeda === "USD" ? "USD" : "BRL";

          return (
            <tr key={item.ativo_id}>
              <Td>
                <div className="font-semibold text-slate-100">{tickerVisivel ? item.ticker : item.nome}</div>
                {tickerVisivel && <div className="text-xs text-slate-500">{item.nome}</div>}
              </Td>
              <Td>
                <Badge tone={item.tipo_ativo.includes("EXTERIOR") ? "blue" : item.tipo_ativo === "PREVIDENCIA" ? "green" : "neutral"}>
                  {INVESTMENT_TYPE_LABELS[item.tipo_ativo]}
                </Badge>
              </Td>
              <Td className="truncate">{item.corretora || "-"}</Td>
              <Td>{toNumber(item.quantidade_atual).toLocaleString("pt-BR")}</Td>
              <Td>{formatMoney(item.preco_medio, moeda)}</Td>
              <Td>
                <div className="flex items-center gap-1">
                  <Input
                    className="h-7 w-24"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    type="number"
                    value={prices[item.ativo_id] ?? ""}
                    onChange={(event) => setPrices((current) => ({ ...current, [item.ativo_id]: event.target.value }))}
                  />
                  {onUpdatePrice && (
                    <Button size="icon" variant="secondary" title="Salvar preco atual" aria-label="Salvar preco atual" disabled={busyId === item.ativo_id} onClick={() => savePrice(item)}>
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {onFetchPrice && tickerVisivel && (
                    <Button size="icon" variant="secondary" title="Buscar cotacao" aria-label="Buscar cotacao" disabled={busyId === item.ativo_id} onClick={() => fetchPrice(item)}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {item.data_cotacao && (
                  <div className="mt-1 text-[11px] text-slate-500">
                    {item.fonte_cotacao || "MANUAL"} em {new Date(item.data_cotacao).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                  </div>
                )}
              </Td>
              <Td>{formatMoney(item.valor_total_aportado, moeda)}</Td>
              <Td>{formatMoney(item.valor_atual, moeda)}</Td>
              <Td>{formatMoney(item.lucro_prejuizo, moeda)}</Td>
              <Td>
                {onSell ? (
                  <Button size="icon" variant="secondary" title="Vender" aria-label="Vender" onClick={() => onSell(item)}>
                    <CircleDollarSign className="h-4 w-4" />
                  </Button>
                ) : (
                  "-"
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
