import { calcularDistribuicao } from "./distribuicao";
import { toNumber } from "./formatters";
import type { DesempenhoAtivo, DistribuicaoItem } from "./types";

export type StatusRebalanceamento = "abaixo" | "no_alvo" | "acima";

export interface RebalanceamentoItemResultado {
  item: DistribuicaoItem;
  valorAtual: number;
  pesoAtual: number;
  aporteSugerido: number;
  pesoApos: number;
  status: StatusRebalanceamento;
}

export interface RebalanceamentoResultado {
  itens: RebalanceamentoItemResultado[];
  valorTotalAtual: number;
  valorTotalFinal: number;
}

// Margem antes de considerar uma classe "fora" do alvo -- sem ela, qualquer
// ruido de centavos faria quase tudo aparecer como "acima" ou "abaixo",
// nunca "no alvo".
const TOLERANCIA_PONTOS_PERCENTUAIS = 0.5;

/** Um plano so entra no modo de rebalanceamento inteligente se pelo menos um
 * item tiver correspondencia com tipo de ativo real (hoje, so o plano
 * Investimentos tem). Os demais continuam com o rateio simples de sempre. */
export function planoUsaRebalanceamento(itens: DistribuicaoItem[]): boolean {
  return itens.some((item) => (item.tipos_ativo?.length ?? 0) > 0);
}

/** Soma o valor atual (BRL, ja convertido) de cada item do plano a partir da
 * alocacao por ativo do endpoint de desempenho de investimentos -- reaproveita
 * o calculo de posicao/patrimonio que ja existe, so agrupa pelas classes do
 * plano. Dinheiro "guardado" (finalidade GUARDADO) fica de fora, do mesmo
 * jeito que fica de fora do patrimonio investido no resto do app. */
export function valorAtualPorItem(itens: DistribuicaoItem[], alocacaoPorAtivo: DesempenhoAtivo[]): Map<string, number> {
  const porTipoAtivo = new Map<string, number>();
  for (const ativo of alocacaoPorAtivo) {
    if (ativo.finalidade === "GUARDADO") continue;
    porTipoAtivo.set(ativo.tipo_ativo, (porTipoAtivo.get(ativo.tipo_ativo) ?? 0) + toNumber(ativo.valor_atual_brl));
  }
  return new Map(
    itens.map((item) => [
      item.id,
      (item.tipos_ativo ?? []).reduce((acc, tipo) => acc + (porTipoAtivo.get(tipo) ?? 0), 0),
    ]),
  );
}

/**
 * Sugere como distribuir um novo aporte pra aproximar a carteira do
 * peso-alvo de cada classe, em vez de sempre repetir o mesmo percentual fixo.
 *
 * Classe acima do alvo nunca recebe aporte (nunca sugere venda) -- o
 * rebalanceamento e' feito so direcionando dinheiro novo pras classes
 * abaixo, proporcionalmente ao quanto cada uma falta pro alvo (considerando
 * o patrimonio ja depois do aporte). Sem carteira previa, ou com tudo ja no
 * alvo (nenhuma classe abaixo), cai pro rateio simples pelos percentuais
 * configurados -- e' o unico jeito consistente de nao deixar o aporte sem
 * destino nesses casos.
 */
export function calcularRebalanceamento(
  itens: DistribuicaoItem[],
  valorPorItemAtual: Map<string, number>,
  valorAporte: number,
): RebalanceamentoResultado {
  const aporte = Number.isFinite(valorAporte) && valorAporte > 0 ? valorAporte : 0;
  const valorTotalAtual = itens.reduce((acc, item) => acc + (valorPorItemAtual.get(item.id) ?? 0), 0);
  const valorTotalFinal = valorTotalAtual + aporte;

  const aportesPorItem = valorTotalAtual > 0
    ? distribuirPorNecessidade(aporte, itens, valorPorItemAtual, valorTotalFinal)
    : distribuirPeloPercentual(aporte, itens);

  const itensResultado = itens.map((item) => {
    const valorAtual = valorPorItemAtual.get(item.id) ?? 0;
    const aporteSugerido = aportesPorItem.get(item.id) ?? 0;
    const pesoAtual = valorTotalAtual > 0 ? (valorAtual / valorTotalAtual) * 100 : 0;
    const pesoApos = valorTotalFinal > 0 ? ((valorAtual + aporteSugerido) / valorTotalFinal) * 100 : 0;
    const alvo = toNumber(item.percentual);
    const status: StatusRebalanceamento =
      pesoAtual > alvo + TOLERANCIA_PONTOS_PERCENTUAIS
        ? "acima"
        : pesoAtual < alvo - TOLERANCIA_PONTOS_PERCENTUAIS
          ? "abaixo"
          : "no_alvo";
    return { item, valorAtual, pesoAtual, aporteSugerido, pesoApos, status };
  });

  return { itens: itensResultado, valorTotalAtual, valorTotalFinal };
}

function distribuirPeloPercentual(valorAporte: number, itens: DistribuicaoItem[]): Map<string, number> {
  return new Map(calcularDistribuicao(valorAporte, itens).map((resultado) => [resultado.item.id, resultado.valor]));
}

function distribuirPorNecessidade(
  valorAporte: number,
  itens: DistribuicaoItem[],
  valorPorItemAtual: Map<string, number>,
  valorTotalFinal: number,
): Map<string, number> {
  const necessidades = new Map(
    itens.map((item) => {
      const ideal = valorTotalFinal * (toNumber(item.percentual) / 100);
      const deficit = ideal - (valorPorItemAtual.get(item.id) ?? 0);
      return [item.id, Math.max(deficit, 0)];
    }),
  );
  const totalNecessidades = [...necessidades.values()].reduce((acc, valor) => acc + valor, 0);
  if (totalNecessidades <= 0) {
    // Nenhuma classe esta abaixo do alvo -- nao ha "necessidade" pra ratear.
    return distribuirPeloPercentual(valorAporte, itens);
  }

  const totalCentavos = Math.round(valorAporte * 100);
  const elegiveis = itens.filter((item) => (necessidades.get(item.id) ?? 0) > 0);
  const resultadoCentavos = new Map<string, number>(itens.map((item) => [item.id, 0]));
  let somaParcial = 0;
  elegiveis.forEach((item, index) => {
    if (index === elegiveis.length - 1) return;
    const proporcao = (necessidades.get(item.id) ?? 0) / totalNecessidades;
    const centavos = Math.round(totalCentavos * proporcao);
    resultadoCentavos.set(item.id, centavos);
    somaParcial += centavos;
  });
  const ultimoElegivel = elegiveis[elegiveis.length - 1];
  if (ultimoElegivel) resultadoCentavos.set(ultimoElegivel.id, totalCentavos - somaParcial);

  return new Map([...resultadoCentavos].map(([id, centavos]) => [id, centavos / 100]));
}
