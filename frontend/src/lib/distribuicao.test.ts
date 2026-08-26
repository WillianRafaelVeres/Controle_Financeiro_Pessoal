import { describe, expect, it } from "vitest";

import { calcularDistribuicao, somaPercentuais, validarSoma100 } from "./distribuicao";
import type { DistribuicaoItem } from "./types";

const itensRendaExtra: DistribuicaoItem[] = [
  { id: "1", nome: "Viagens", percentual: 50 },
  { id: "2", nome: "Fundo carro/casa", percentual: 15 },
  { id: "3", nome: "Investimentos", percentual: 15 },
  { id: "4", nome: "Reserva de emergencia", percentual: 10 },
  { id: "5", nome: "Previdencia PGBL", percentual: 10 },
];

describe("calcularDistribuicao", () => {
  it("calcula o valor de cada destino a partir do percentual", () => {
    const resultado = calcularDistribuicao(2000, itensRendaExtra);

    expect(resultado.map((r) => r.valor)).toEqual([1000, 300, 300, 200, 200]);
  });

  it("a soma dos valores calculados e sempre igual ao valor informado, mesmo com arredondamento", () => {
    const itensComDizima: DistribuicaoItem[] = [
      { id: "a", nome: "A", percentual: 33.33 },
      { id: "b", nome: "B", percentual: 33.33 },
      { id: "c", nome: "C", percentual: 33.34 },
    ];

    const resultado = calcularDistribuicao(100, itensComDizima);
    const soma = resultado.reduce((acc, r) => acc + r.valor, 0);

    expect(Math.round(soma * 100) / 100).toBe(100);
  });

  it("ajusta o ultimo item para absorver a diferenca de centavos", () => {
    // 10 fica com 3 destinos de 33,33...% cada -- sem correcao, a soma dos
    // tres arredondamentos ficaria em 9,99, nao 10.
    const itens: DistribuicaoItem[] = [
      { id: "a", nome: "A", percentual: 33.33 },
      { id: "b", nome: "B", percentual: 33.33 },
      { id: "c", nome: "C", percentual: 33.34 },
    ];

    const resultado = calcularDistribuicao(10, itens);

    expect(resultado[0].valor + resultado[1].valor + resultado[2].valor).toBe(10);
  });

  it("recalcula quando o valor muda", () => {
    expect(calcularDistribuicao(1000, itensRendaExtra).map((r) => r.valor)).toEqual([500, 150, 150, 100, 100]);
    expect(calcularDistribuicao(4000, itensRendaExtra).map((r) => r.valor)).toEqual([2000, 600, 600, 400, 400]);
  });

  it("recalcula quando o plano muda", () => {
    const outroPlano: DistribuicaoItem[] = [
      { id: "1", nome: "Renda fixa", percentual: 25 },
      { id: "2", nome: "FIIs", percentual: 15 },
      { id: "3", nome: "Acoes BR", percentual: 20 },
      { id: "4", nome: "Exterior", percentual: 25 },
      { id: "5", nome: "Bitcoin", percentual: 15 },
    ];

    expect(calcularDistribuicao(2000, outroPlano).map((r) => r.valor)).toEqual([500, 300, 400, 500, 300]);
  });

  it("devolve zero para todo mundo quando o valor esta vazio ou invalido", () => {
    expect(calcularDistribuicao(0, itensRendaExtra).every((r) => r.valor === 0)).toBe(true);
    expect(calcularDistribuicao(Number.NaN, itensRendaExtra).every((r) => r.valor === 0)).toBe(true);
  });

  it("nao quebra com uma lista vazia de itens", () => {
    expect(calcularDistribuicao(1000, [])).toEqual([]);
  });
});

describe("somaPercentuais / validarSoma100", () => {
  it("soma os percentuais dos itens", () => {
    expect(somaPercentuais(itensRendaExtra)).toBe(100);
  });

  it("aceita uma soma de exatamente 100%", () => {
    const validacao = validarSoma100(itensRendaExtra);
    expect(validacao.valido).toBe(true);
    expect(validacao.diferenca).toBe(0);
  });

  it("reporta quanto falta quando a soma e menor que 100%", () => {
    const itens: DistribuicaoItem[] = [
      { id: "a", nome: "A", percentual: 60 },
      { id: "b", nome: "B", percentual: 35 },
    ];
    const validacao = validarSoma100(itens);

    expect(validacao.valido).toBe(false);
    expect(validacao.soma).toBe(95);
    expect(validacao.diferenca).toBe(5);
  });

  it("reporta quanto excede quando a soma e maior que 100%", () => {
    const itens: DistribuicaoItem[] = [
      { id: "a", nome: "A", percentual: 60 },
      { id: "b", nome: "B", percentual: 45 },
    ];
    const validacao = validarSoma100(itens);

    expect(validacao.valido).toBe(false);
    expect(validacao.soma).toBe(105);
    expect(validacao.diferenca).toBe(-5);
  });
});
