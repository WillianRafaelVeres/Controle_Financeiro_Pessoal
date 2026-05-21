import { CircleDollarSign, RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Td, Th, Table } from "../../components/ui/table";
import { formatMoney, toNumber } from "../../lib/formatters";
import { needsTicker } from "../../lib/investmentProfiles";
import type { Posicao } from "../../lib/types";

interface AtivosTableProps {
  posicoes: Posicao[];
  onSell?: (posicao: Posicao) => void;
  onFetchPrice?: (posicao: Posicao) => Promise<void>;
  onUpdatePrice?: (posicao: Posicao, preco: number) => Promise<void>;
  dolarCotacao?: number;
}

const AUTO_QUOTE_TYPES = new Set(["ACAO_BR", "FII", "ETF_BR", "CRIPTO"]);

function quoteDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function AtivosTable({ posicoes, onSell, onFetchPrice, onUpdatePrice, dolarCotacao = 0 }: AtivosTableProps) {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setPrices(
      Object.fromEntries(
        posicoes.map((item) => [item.ativo_id, String(toNumber(item.preco_atual ?? item.preco_medio) || "")]),
      ),
    );
  }, [posicoes]);

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

  async function savePrice(item: Posicao) {
    if (!onUpdatePrice) return;
    const preco = toNumber(prices[item.ativo_id]);
    if (preco <= 0) {
      alert("Informe uma cotacao maior que zero.");
      return;
    }
    setBusyId(item.ativo_id);
    try {
      await onUpdatePrice(item, preco);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Nao foi possivel salvar a cotacao manual.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Table className="min-w-[820px]">
      <thead>
        <tr>
          <Th>Ativo</Th>
          <Th>Quantidade</Th>
          <Th>Cotacao</Th>
          <Th className="text-right">Valor atual</Th>
          <Th className="text-right">Resultado</Th>
          <Th className="w-[48px] text-center">Acoes</Th>
        </tr>
      </thead>
      <tbody>
        {posicoes.map((item) => {
          const tickerVisivel = needsTicker(item.tipo_ativo);
          const moeda = item.moeda === "USD" ? "USD" : "BRL";
          const automatico = AUTO_QUOTE_TYPES.has(item.tipo_ativo);
          const valorAtualBrl = moeda === "USD" && dolarCotacao > 0 ? toNumber(item.valor_atual) * dolarCotacao : null;
          const lucroBrl = moeda === "USD" && dolarCotacao > 0 ? toNumber(item.lucro_prejuizo) * dolarCotacao : null;
          const resultado = toNumber(item.lucro_prejuizo);
          const resultadoLabel = resultado < 0 ? "Prejuizo" : "Lucro";
          const date = quoteDate(item.data_cotacao);

          return (
            <tr key={item.ativo_id} className="bg-slate-950/20">
              <Td>
                <div className="font-semibold text-slate-100">{tickerVisivel ? item.ticker : item.nome}</div>
                <div className="text-xs text-slate-500">
                  {[tickerVisivel ? item.nome : null, item.corretora, moeda].filter(Boolean).join(" | ") || "-"}
                </div>
              </Td>
              <Td>
                <div className="font-medium text-slate-200">{toNumber(item.quantidade_atual).toLocaleString("pt-BR")}</div>
                <div className="text-[11px] text-slate-500">PM {formatMoney(item.preco_medio, moeda)}</div>
              </Td>
              <Td>
                {automatico ? (
                  <div className="flex items-center gap-1.5">
                    <div>
                      <div className="font-semibold text-slate-100">{formatMoney(item.preco_atual ?? item.preco_medio, moeda)}</div>
                      {date && <div className="text-[11px] text-slate-500">{item.fonte_cotacao || "AUTO"} em {date}</div>}
                    </div>
                    {onFetchPrice && tickerVisivel && (
                      <Button size="icon" variant="secondary" title="Atualizar cotacao" aria-label="Atualizar cotacao" disabled={busyId === item.ativo_id} onClick={() => fetchPrice(item)}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div>
                      <Input
                        className="h-7 w-24"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        type="number"
                        value={prices[item.ativo_id] ?? ""}
                        onChange={(event) => setPrices((current) => ({ ...current, [item.ativo_id]: event.target.value }))}
                      />
                      {date && <div className="mt-0.5 text-[11px] text-slate-500">Atualizado em {date}</div>}
                    </div>
                    {onUpdatePrice && (
                      <Button size="icon" variant="secondary" title="Salvar cotacao" aria-label="Salvar cotacao" disabled={busyId === item.ativo_id} onClick={() => savePrice(item)}>
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </Td>
              <Td className="text-right">
                <div className="font-semibold text-slate-100">{formatMoney(item.valor_atual, moeda)}</div>
                {valorAtualBrl !== null && <div className="text-[11px] font-medium text-brand-400">{formatMoney(valorAtualBrl)}</div>}
              </Td>
              <Td className="text-right">
                <div className={resultado < 0 ? "font-semibold text-danger-600" : "font-semibold text-brand-400"}>{resultadoLabel}</div>
                <div>{formatMoney(item.lucro_prejuizo, moeda)}</div>
                {lucroBrl !== null && <div className="text-[11px] text-slate-500">{formatMoney(lucroBrl)}</div>}
              </Td>
              <Td className="text-center">
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
