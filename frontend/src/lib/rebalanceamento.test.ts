import { describe, expect, it } from "vitest";

import { calcularRebalanceamento, planoUsaRebalanceamento, valorAtualPorItem } from "./rebalanceamento";
import type { DesempenhoAtivo, DistribuicaoItem } from "./types";

const ITENS: DistribuicaoItem[] = [
  { id: "rf", nome: "Renda fixa", percentual: 25, tipos_ativo: ["RENDA_FIXA", "CAIXINHA_CDB"] },
  { id: "fii", nome: "FIIs", percentual: 15, tipos_ativo: ["FII"] },
  { id: "acoes", nome: "Acoes BR", percentual: 20, tipos_ativo: ["ACAO_BR", "ETF_BR"] },
  { id: "ext", nome: "Exterior", percentual: 25, tipos_ativo: ["EXTERIOR", "ACAO_EXTERIOR", "ETF_EXTERIOR"] },
  { id: "btc", nome: "Bitcoin", percentual: 15, tipos_ativo: ["CRIPTO"] },
];

function ativo(tipo: string, valor: number, finalidade: "INVESTIMENTO" | "GUARDADO" = "INVESTIMENTO"): DesempenhoAtivo {
  return {
    ativo_id: `${tipo}-${valor}`,
    ticker: tipo,
    nome: tipo,
    tipo_ativo: tipo as DesempenhoAtivo["tipo_ativo"],
    finalidade,
    tipo_label: tipo,
    moeda: "BRL",
    valor_atual_brl: valor,
    valor_atual_original: valor,
    total_aportado_brl: valor,
    resultado_brl: 0,
    rentabilidade_percentual: 0,
    percentual: 0,
    cotacao_automatica: false,
  };
}

describe("planoUsaRebalanceamento", () => {
  it("e' verdadeiro quando ao menos um item tem tipos_ativo", () => {
    expect(planoUsaRebalanceamento(ITENS)).toBe(true);
  });

  it("e' falso pra planos sem correspondencia de investimento (ex.: Renda Extra)", () => {
    const itensRendaExtra: DistribuicaoItem[] = [
      { id: "a", nome: "Viagens", percentual: 50 },
      { id: "b", nome: "Reserva de emergencia", percentual: 50 },
    ];
    expect(planoUsaRebalanceamento(itensRendaExtra)).toBe(false);
  });
});

describe("valorAtualPorItem", () => {
  it("soma por classe e ignora ativos guardados", () => {
    const alocacao = [
      ativo("RENDA_FIXA", 15000),
      ativo("CAIXINHA_CDB", 5000),
      ativo("CAIXINHA_CDB", 999, "GUARDADO"),
      ativo("ACAO_BR", 30000),
    ];
    const resultado = valorAtualPorItem(ITENS, alocacao);
    expect(resultado.get("rf")).toBe(20000);
    expect(resultado.get("acoes")).toBe(30000);
    expect(resultado.get("fii")).toBe(0);
  });
});

describe("calcularRebalanceamento", () => {
  it("exemplo da spec: direciona tudo pras classes abaixo do alvo e zera a que esta acima", () => {
    const valorPorItem = new Map([
      ["rf", 20000],
      ["fii", 10000],
      ["acoes", 30000],
      ["ext", 20000],
      ["btc", 10000],
    ]);

    const resultado = calcularRebalanceamento(ITENS, valorPorItem, 10000);

    expect(resultado.valorTotalAtual).toBe(90000);
    expect(resultado.valorTotalFinal).toBe(100000);

    const porId = Object.fromEntries(resultado.itens.map((item) => [item.item.id, item]));
    expect(porId.rf.aporteSugerido).toBeCloseTo(2500, 2);
    expect(porId.fii.aporteSugerido).toBeCloseTo(2500, 2);
    expect(porId.acoes.aporteSugerido).toBe(0);
    expect(porId.ext.aporteSugerido).toBeCloseTo(2500, 2);
    expect(porId.btc.aporteSugerido).toBeCloseTo(2500, 2);
    expect(porId.acoes.status).toBe("acima");

    const somaAportes = resultado.itens.reduce((acc, item) => acc + item.aporteSugerido, 0);
    expect(somaAportes).toBeCloseTo(10000, 2);
  });

  it("carteira ja equilibrada fica proxima do rateio tradicional", () => {
    const valorPorItem = new Map([
      ["rf", 2500],
      ["fii", 1500],
      ["acoes", 2000],
      ["ext", 2500],
      ["btc", 1500],
    ]);

    const resultado = calcularRebalanceamento(ITENS, valorPorItem, 1000);
    const porId = Object.fromEntries(resultado.itens.map((item) => [item.item.id, item]));

    expect(porId.rf.aporteSugerido).toBeCloseTo(250, 2);
    expect(porId.fii.aporteSugerido).toBeCloseTo(150, 2);
    expect(porId.acoes.aporteSugerido).toBeCloseTo(200, 2);
    expect(porId.ext.aporteSugerido).toBeCloseTo(250, 2);
    expect(porId.btc.aporteSugerido).toBeCloseTo(150, 2);
    resultado.itens.forEach((item) => expect(item.status).toBe("no_alvo"));
  });

  it("sem carteira anterior usa direto os pesos-alvo", () => {
    const resultado = calcularRebalanceamento(ITENS, new Map(), 1000);
    const porId = Object.fromEntries(resultado.itens.map((item) => [item.item.id, item]));

    expect(porId.rf.aporteSugerido).toBeCloseTo(250, 2);
    expect(porId.fii.aporteSugerido).toBeCloseTo(150, 2);
    expect(porId.acoes.aporteSugerido).toBeCloseTo(200, 2);
    expect(porId.ext.aporteSugerido).toBeCloseTo(250, 2);
    expect(porId.btc.aporteSugerido).toBeCloseTo(150, 2);
  });

  it("todas as classes acima do alvo (aporte pequeno) cai pro rateio simples em vez de dividir por zero", () => {
    const valorPorItem = new Map([
      ["rf", 250000],
      ["fii", 150000],
      ["acoes", 200000],
      ["ext", 250000],
      ["btc", 150000],
    ]);

    const resultado = calcularRebalanceamento(ITENS, valorPorItem, 1);
    const somaAportes = resultado.itens.reduce((acc, item) => acc + item.aporteSugerido, 0);
    expect(somaAportes).toBeCloseTo(1, 2);
  });

  it("soma dos aportes sugeridos sempre bate exatamente com o valor informado (arredondamento)", () => {
    const valorPorItem = new Map([
      ["rf", 3333],
      ["fii", 777],
      ["acoes", 9999],
      ["ext", 1111],
      ["btc", 5000],
    ]);

    for (const valorAporte of [0.01, 1, 33.33, 999.99, 123456.78]) {
      const resultado = calcularRebalanceamento(ITENS, valorPorItem, valorAporte);
      const somaCentavos = resultado.itens.reduce((acc, item) => acc + Math.round(item.aporteSugerido * 100), 0);
      expect(somaCentavos).toBe(Math.round(valorAporte * 100));
    }
  });

  it("nunca sugere aporte negativo, mesmo pra classe muito acima do alvo", () => {
    const valorPorItem = new Map([
      ["rf", 1000],
      ["fii", 1000],
      ["acoes", 500000],
      ["ext", 1000],
      ["btc", 1000],
    ]);

    const resultado = calcularRebalanceamento(ITENS, valorPorItem, 500);
    resultado.itens.forEach((item) => expect(item.aporteSugerido).toBeGreaterThanOrEqual(0));
    const acoes = resultado.itens.find((item) => item.item.id === "acoes");
    expect(acoes?.aporteSugerido).toBe(0);
    expect(acoes?.status).toBe("acima");
  });
});
