import { toNumber } from "./formatters";
import type { DistribuicaoItem } from "./types";

export interface DistribuicaoResultado {
  item: DistribuicaoItem;
  valor: number;
}

export function somaPercentuais(itens: DistribuicaoItem[]): number {
  return itens.reduce((acc, item) => acc + toNumber(item.percentual), 0);
}

export interface ValidacaoSoma {
  soma: number;
  valido: boolean;
  /** Positivo = falta pra 100%, negativo = excede 100%. */
  diferenca: number;
}

export function validarSoma100(itens: DistribuicaoItem[]): ValidacaoSoma {
  const soma = Math.round(somaPercentuais(itens) * 100) / 100;
  const diferenca = Math.round((100 - soma) * 100) / 100;
  return { soma, valido: Math.abs(diferenca) < 0.01, diferenca };
}

/**
 * Quanto cabe a cada item, dado um valor total e os percentuais do plano.
 *
 * Faz a conta em centavos (inteiros) e ajusta o ultimo item pela diferenca de
 * arredondamento, garantindo que a soma dos valores calculados bate exatamente
 * com o valor informado -- nunca sobra nem falta 1 centavo no total.
 */
export function calcularDistribuicao(valorTotal: number, itens: DistribuicaoItem[]): DistribuicaoResultado[] {
  if (itens.length === 0) return [];
  if (!Number.isFinite(valorTotal) || valorTotal <= 0) {
    return itens.map((item) => ({ item, valor: 0 }));
  }

  const totalCentavos = Math.round(valorTotal * 100);
  const valoresCentavos = itens.map((item) => Math.round((totalCentavos * toNumber(item.percentual)) / 100));
  const somaExcetoUltimo = valoresCentavos.slice(0, -1).reduce((acc, valor) => acc + valor, 0);
  valoresCentavos[valoresCentavos.length - 1] = totalCentavos - somaExcetoUltimo;

  return itens.map((item, index) => ({ item, valor: valoresCentavos[index] / 100 }));
}
