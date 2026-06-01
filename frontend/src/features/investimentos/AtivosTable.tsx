import { CircleDollarSign, RefreshCw, Save } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Td, Th, Table } from "../../components/ui/table";
import { formatMoney, formatPercent, toNumber } from "../../lib/formatters";
import { needsTicker } from "../../lib/investmentProfiles";
import type { Posicao, TipoAtivo } from "../../lib/types";

interface AtivosTableProps {
  posicoes: Posicao[];
  onSell?: (posicao: Posicao) => void;
  onFetchPrice?: (posicao: Posicao) => Promise<void>;
  onUpdatePrice?: (posicao: Posicao, preco: number) => Promise<void>;
  dolarCotacao?: number;
  showDividendos?: boolean;
}

const AUTO_QUOTE_TYPES = new Set<TipoAtivo>(["ACAO_BR", "FII", "ETF_BR", "CRIPTO", "EXTERIOR", "ACAO_EXTERIOR", "ETF_EXTERIOR"]);

export function AtivosTable({ posicoes, onSell, onFetchPrice, onUpdatePrice, dolarCotacao = 0, showDividendos = false }: AtivosTableProps) {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const headClass = "px-2 py-2";
  const cellClass = "px-2 py-2";

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
    <Table className={showDividendos ? "min-w-[960px] text-[12px]" : "min-w-[760px] text-[12px]"}>
      <thead>
        <tr>
          <Th className={`${headClass} w-[190px]`}>Ativo</Th>
          <Th className={`${headClass} w-[110px] text-right`}>Quantidade</Th>
          <Th className={`${headClass} w-[120px] text-right`}>Cotacao</Th>
          <Th className={`${headClass} w-[120px] text-right`}>Valor atual</Th>
          <Th className={`${headClass} w-[118px] text-right`}>Resultado</Th>
          {showDividendos && <Th className={`${headClass} w-[110px] text-right`}>Dividendos</Th>}
          {showDividendos && <Th className={`${headClass} w-[122px] text-right`}>Retorno</Th>}
          <Th className={`${headClass} w-[44px] text-center`}>Acoes</Th>
        </tr>
      </thead>
      <tbody>
        {posicoes.map((item) => {
          const tickerVisivel = needsTicker(item.tipo_ativo);
          const controleValor = item.tipo_controle === "VALOR";
          const moeda = item.moeda === "USD" ? "USD" : "BRL";
          const automatico = !controleValor && AUTO_QUOTE_TYPES.has(item.tipo_ativo);
          const valorAtualBrl = moeda === "USD" && dolarCotacao > 0 ? toNumber(item.valor_atual) * dolarCotacao : null;
          const lucroBrl = moeda === "USD" && dolarCotacao > 0 ? toNumber(item.lucro_prejuizo) * dolarCotacao : null;
          const resultado = toNumber(item.lucro_prejuizo);
          const aportado = toNumber(item.valor_total_aportado);
          const rentabilidade = toNumber(item.rentabilidade_percentual ?? (aportado > 0 ? (resultado / aportado) * 100 : 0));
          const dividendos = toNumber(item.dividendos_recebidos);
          const dividendosBrl = moeda === "USD" && dolarCotacao > 0 ? dividendos * dolarCotacao : null;
          const resultadoComDividendos = toNumber(item.lucro_prejuizo_com_dividendos ?? resultado + dividendos);
          const resultadoComDividendosBrl = moeda === "USD" && dolarCotacao > 0 ? resultadoComDividendos * dolarCotacao : null;
          const rentabilidadeComDividendos = toNumber(
            item.rentabilidade_com_dividendos_percentual ?? (aportado > 0 ? (resultadoComDividendos / aportado) * 100 : 0),
          );
          const resultadoLabel = resultado < 0 ? "Prejuizo" : "Lucro";
          const resultadoTotalLabel = resultadoComDividendos < 0 ? "Prejuizo" : "Lucro";
          const resultClass = resultado < 0 ? "font-semibold text-danger-600" : "font-semibold text-brand-400";
          const totalResultClass = resultadoComDividendos < 0 ? "font-semibold text-danger-600" : "font-semibold text-brand-400";

          return (
            <tr key={item.ativo_id} className="bg-slate-950/20 transition-colors duration-200 hover:bg-slate-900/60">
              <Td className={`${cellClass} align-middle`}>
                <div className="truncate font-semibold text-slate-100">{tickerVisivel ? item.ticker : item.nome}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">
                  {[tickerVisivel ? item.nome : null, item.corretora, moeda, controleValor ? "Valor" : null].filter(Boolean).join(" | ") || "-"}
                </div>
              </Td>
              <Td className={`${cellClass} align-middle text-right`}>
                <div className="font-semibold text-slate-100">{controleValor ? "Valor" : toNumber(item.quantidade_atual).toLocaleString("pt-BR")}</div>
                <div className="text-[11px] text-slate-500">{controleValor ? "Aplicado" : "PM"} {formatMoney(controleValor ? item.valor_total_aportado : item.preco_medio, moeda)}</div>
              </Td>
              <Td className={`${cellClass} align-middle text-right`}>
                {automatico ? (
                  <div className="flex items-center justify-end gap-1">
                    <div className="text-right">
                      <div className="font-semibold text-slate-100">{formatMoney(item.preco_atual ?? item.preco_medio, moeda)}</div>
                    </div>
                    {onFetchPrice && tickerVisivel && (
                      <Button size="icon" variant="secondary" title="Atualizar cotacao" aria-label="Atualizar cotacao" disabled={busyId === item.ativo_id} onClick={() => fetchPrice(item)}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-1">
                    <div>
                      <Input
                        className="h-7 w-20 text-right"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        type="number"
                        value={prices[item.ativo_id] ?? ""}
                        onChange={(event) => setPrices((current) => ({ ...current, [item.ativo_id]: event.target.value }))}
                      />
                    </div>
                    {onUpdatePrice && (
                      <Button size="icon" variant="secondary" title={controleValor ? "Salvar valor atual" : "Salvar cotacao"} aria-label={controleValor ? "Salvar valor atual" : "Salvar cotacao"} disabled={busyId === item.ativo_id} onClick={() => savePrice(item)}>
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </Td>
              <Td className={`${cellClass} align-middle text-right`}>
                <div className="font-semibold text-slate-100">{formatMoney(item.valor_atual, moeda)}</div>
                {valorAtualBrl !== null && <div className="text-[11px] text-slate-500">{formatMoney(valorAtualBrl)}</div>}
              </Td>
              <Td className={`${cellClass} align-middle text-right`}>
                <div className={resultClass}>{resultadoLabel}</div>
                <div className="text-slate-300">{formatMoney(item.lucro_prejuizo, moeda)}</div>
                <div className={resultado < 0 ? "text-[11px] text-danger-600" : "text-[11px] text-brand-400"}>{formatPercent(rentabilidade)}</div>
                {lucroBrl !== null && <div className="text-[11px] text-slate-500">{formatMoney(lucroBrl)}</div>}
              </Td>
              {showDividendos && (
                <Td className={`${cellClass} align-middle text-right`}>
                  <div className="font-semibold text-slate-100">{formatMoney(dividendos, moeda)}</div>
                  {dividendosBrl !== null && <div className="text-[11px] text-slate-500">{formatMoney(dividendosBrl)}</div>}
                </Td>
              )}
              {showDividendos && (
                <Td className={`${cellClass} align-middle text-right`}>
                  <div className={totalResultClass}>{resultadoTotalLabel}</div>
                  <div className="text-slate-300">{formatMoney(resultadoComDividendos, moeda)}</div>
                  <div className={resultadoComDividendos < 0 ? "text-[11px] text-danger-600" : "text-[11px] text-brand-400"}>
                    {formatPercent(rentabilidadeComDividendos)}
                  </div>
                  {resultadoComDividendosBrl !== null && <div className="text-[11px] text-slate-500">{formatMoney(resultadoComDividendosBrl)}</div>}
                </Td>
              )}
              <Td className={`${cellClass} align-middle text-center`}>
                {onSell ? (
                  <Button size="icon" variant="secondary" title={controleValor ? "Resgatar" : "Vender"} aria-label={controleValor ? "Resgatar" : "Vender"} onClick={() => onSell(item)}>
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
