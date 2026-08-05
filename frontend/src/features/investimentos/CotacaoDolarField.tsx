import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { MoneyInput } from "../../components/finance/MoneyInput";
import { api } from "../../lib/api";
import { formatDate, formatMoney, toNumber } from "../../lib/formatters";

export interface CotacaoDolarState {
  manual: string;
  setManual: (valor: string) => void;
  automatica: number;
  efetiva: number;
  carregando: boolean;
  indisponivel: boolean;
  dataCotacao: string | null;
  fonte: string | null;
  limpar: () => void;
}

/**
 * Cotacao USD-BRL da data escolhida.
 *
 * O campo nunca bloqueia o lancamento: quando a busca automatica nao encontra
 * nada, o usuario digita a cotacao e o valor digitado (`manual`) vence.
 */
export function useCotacaoDolar(dataReferencia: string, habilitado: boolean): CotacaoDolarState {
  const [manual, setManual] = useState("");
  const cotacao = useQuery({
    queryKey: ["dolar-cotacao", dataReferencia],
    queryFn: () => api.dolarCotacaoData(dataReferencia),
    enabled: habilitado && Boolean(dataReferencia),
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  const automatica = toNumber(cotacao.data?.cotacao_brl);
  const digitada = toNumber(manual);
  // Estavel de proposito: telas usam `limpar` como dependencia de efeito.
  const limpar = useCallback(() => setManual(""), []);

  return {
    manual,
    setManual,
    automatica,
    efetiva: digitada > 0 ? digitada : automatica,
    carregando: cotacao.isFetching,
    indisponivel: !cotacao.isFetching && automatica <= 0,
    dataCotacao: typeof cotacao.data?.data_cotacao === "string" ? cotacao.data.data_cotacao : null,
    fonte: cotacao.data?.fonte ?? null,
    limpar,
  };
}

export function CotacaoDolarField({
  state,
  valorUsd,
  cotacaoSalva,
  className,
}: {
  state: CotacaoDolarState;
  valorUsd: number;
  cotacaoSalva?: string | number | null;
  className?: string;
}) {
  const exibido = state.manual || (state.automatica > 0 ? String(state.automatica) : "");
  const valorConvertido = valorUsd > 0 && state.efetiva > 0 ? valorUsd * state.efetiva : 0;

  return (
    <div className={className}>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">Cotacao do dolar (BRL)</span>
        <MoneyInput
          value={exibido}
          decimals={4}
          preview={false}
          placeholder="0,0000"
          onChange={(event) => state.setManual(event.target.value)}
        />
      </label>
      <div className="mt-1 space-y-0.5 text-[11px] leading-tight">
        {state.carregando && <p className="text-slate-500">Buscando a cotacao da data...</p>}
        {!state.carregando && state.automatica > 0 && !state.manual && (
          <p className="text-slate-500">
            Cotacao de {formatDate(state.dataCotacao?.slice(0, 10))}
            {state.fonte ? ` (${state.fonte})` : ""}. Pode alterar se precisar.
          </p>
        )}
        {state.manual !== "" && (
          <p className="text-amber-300">
            Cotacao informada manualmente.{" "}
            <button type="button" className="underline hover:text-amber-200" onClick={state.limpar}>
              usar a automatica
            </button>
          </p>
        )}
        {state.indisponivel && !state.manual && (
          <p className="text-amber-300">Nao encontramos a cotacao desta data. Informe o valor acima para salvar.</p>
        )}
        {toNumber(cotacaoSalva) > 0 && (
          <p className="text-slate-500">Cotacao gravada hoje no lancamento: {formatMoney(cotacaoSalva, "BRL")}</p>
        )}
        {valorConvertido > 0 && <p className="font-medium text-brand-400">Equivale a {formatMoney(valorConvertido)}</p>}
      </div>
    </div>
  );
}
