import { CalendarDays, Save } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import { ComboboxCreate, type ComboOption } from "../../components/finance/ComboboxCreate";
import { MoneyInput } from "../../components/finance/MoneyInput";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import {
  defaultCurrencyForInvestment,
  INVESTMENT_TYPE_OPTIONS,
  isValueControlledInvestment,
  needsTicker,
  readInvestmentBrokerPrefs,
  saveInvestmentBrokerPref,
  tickerPlaceholder,
} from "../../lib/investmentProfiles";
import { toNumber } from "../../lib/formatters";
import type {
  CartaoOpcao,
  Categoria,
  MetodoPagamento,
  NaturezaCategoria,
  Subcategoria,
  TipoAtivo,
  TipoLancamento,
} from "../../lib/types";
import { CartaoPagamentoModal } from "./CartaoPagamentoModal";

interface LancamentoFormProps {
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  metodos: MetodoPagamento[];
  cartoes: CartaoOpcao[];
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCreateContaFutura?: (payload: Record<string, unknown>) => Promise<void>;
  onCreateCategoria: (nome: string, natureza: NaturezaCategoria) => Promise<ComboOption>;
  onCreateSubcategoria: (nome: string, categoriaId: string) => Promise<ComboOption>;
  onCreateMetodo: (nome: string) => Promise<ComboOption>;
  initialType?: TipoLancamento;
  initialCardFlow?: boolean;
  allowInvestment?: boolean;
  lockType?: boolean;
}

export function LancamentoForm({
  categorias,
  subcategorias,
  metodos,
  cartoes,
  onSubmit,
  onCreateContaFutura,
  onCreateCategoria,
  onCreateSubcategoria,
  onCreateMetodo,
  initialType = "GASTO",
  initialCardFlow = false,
  allowInvestment = false,
  lockType = false,
}: LancamentoFormProps) {
  const [valor, setValor] = useState("");
  const [tipo, setTipo] = useState<TipoLancamento>(initialType);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [subcategoriaId, setSubcategoriaId] = useState<string | null>(null);
  const [metodoId, setMetodoId] = useState<string | null>(null);
  const [tempCategoria, setTempCategoria] = useState("");
  const [tempSubcategoria, setTempSubcategoria] = useState("");
  const [tempMetodo, setTempMetodo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [dataLancamento, setDataLancamento] = useState("");
  const [modalCartao, setModalCartao] = useState(false);
  const [separarContaFutura, setSepararContaFutura] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [destinoInvestimento, setDestinoInvestimento] = useState("RESERVA");
  const [tipoAtivo, setTipoAtivo] = useState<TipoAtivo>("ACAO_BR");
  const [ticker, setTicker] = useState("");
  const [nomeInvestimento, setNomeInvestimento] = useState("");
  const [corretoraInvestimento, setCorretoraInvestimento] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [precoUnitario, setPrecoUnitario] = useState("");

  const naturezaTipo: NaturezaCategoria = tipo === "SEPARAR" ? "GASTO" : tipo;
  const isContaFutura = tipo === "GASTO" && separarContaFutura && Boolean(onCreateContaFutura);
  const categoriaOptions = categorias
    .filter((item) => item.ativa && (item.natureza ?? "GASTO") === naturezaTipo)
    .map((item) => ({ id: item.id, label: item.nome }));
  const categoriaById = useMemo(() => new Map(categorias.map((item) => [item.id, item])), [categorias]);
  const subcategoriaOptions = useMemo(
    () =>
      subcategorias
        .filter((item) => item.ativa && (item.natureza ?? "GASTO") === naturezaTipo)
        .filter((item) => !categoriaId || item.categoria_id === categoriaId)
        .map((item) => ({ id: item.id, label: item.nome, description: categoriaById.get(item.categoria_id)?.nome })),
    [categoriaById, categoriaId, naturezaTipo, subcategorias],
  );
  const firstCartaoId = cartoes[0]?.id ? `cartao:${cartoes[0].id}` : null;
  const metodoOptions = [
    ...metodos.filter((item) => item.tipo_metodo !== "CARTAO_CREDITO").map((item) => ({
      id: item.id,
      label: item.nome,
    })),
    ...(tipo === "GASTO" && !isContaFutura
      ? cartoes.map((item) => ({
          id: `cartao:${item.id}`,
          label: item.nome,
          description: "cartao cadastrado",
        }))
      : []),
  ];
  const metodoSelecionado = metodos.find((item) => item.id === metodoId);
  const selectedCartaoId = metodoId?.startsWith("cartao:") ? metodoId.replace("cartao:", "") : null;
  const isCartao = tipo === "GASTO" && !isContaFutura && (Boolean(selectedCartaoId) || metodoSelecionado?.tipo_metodo === "CARTAO_CREDITO");
  const valorNumber = toNumber(valor);
  const tickerInvestimentoObrigatorio = needsTicker(tipoAtivo);
  const investimentoControladoPorValor = isValueControlledInvestment(tipoAtivo);
  const moedaInvestimento = defaultCurrencyForInvestment(tipoAtivo);

  useEffect(() => {
    setTipo(initialType === "INVESTIMENTO" && !allowInvestment ? "GASTO" : initialType);
    setCategoriaId(null);
    setSubcategoriaId(null);
    if (initialCardFlow) {
      setMetodoId(firstCartaoId);
    } else {
      setMetodoId(null);
    }
    setSepararContaFutura(false);
    if (initialType === "INVESTIMENTO") {
      setCorretoraInvestimento(readInvestmentBrokerPrefs()[tipoAtivo] ?? "");
    }
  }, [allowInvestment, firstCartaoId, initialCardFlow, initialType]);

  useEffect(() => {
    if (isContaFutura && selectedCartaoId) {
      setMetodoId(null);
    }
  }, [isContaFutura, selectedCartaoId]);

  function resetForm() {
    setValor("");
    setTipo(initialType === "INVESTIMENTO" && !allowInvestment ? "GASTO" : initialType);
    setCategoriaId(null);
    setSubcategoriaId(null);
    setMetodoId(initialCardFlow ? firstCartaoId : null);
    setSepararContaFutura(false);
    setTempCategoria("");
    setTempSubcategoria("");
    setTempMetodo("");
    setObservacao("");
    setDataLancamento("");
    setShowDate(false);
    setDestinoInvestimento("RESERVA");
    setTicker("");
    setNomeInvestimento("");
    setCorretoraInvestimento(readInvestmentBrokerPrefs()[tipoAtivo] ?? "");
    setQuantidade("");
    setPrecoUnitario("");
  }

  function buildPayload(cartao?: Record<string, unknown>) {
    const categoriaLabel = categoriaOptions.find((item) => item.id === categoriaId)?.label ?? tempCategoria;
    const subcategoriaLabel = subcategoriaOptions.find((item) => item.id === subcategoriaId)?.label ?? tempSubcategoria;
    const extras = [
      tempCategoria ? `Categoria temporaria: ${tempCategoria}` : "",
      tempSubcategoria ? `Subcategoria temporaria: ${tempSubcategoria}` : "",
      tempMetodo ? `Metodo temporario: ${tempMetodo}` : "",
    ].filter(Boolean);
    const obs = [observacao.trim(), ...extras].filter(Boolean).join(" | ");
    const movimentoInvestimento =
      tipo === "INVESTIMENTO" && destinoInvestimento === "COMPRA_ATIVO"
        ? {
            ticker: tickerInvestimentoObrigatorio ? ticker.trim() : null,
            nome: investimentoControladoPorValor ? nomeInvestimento.trim() : ticker.trim(),
            tipo_ativo: tipoAtivo,
            tipo_controle: investimentoControladoPorValor ? "VALOR" : "QUANTIDADE",
            quantidade: investimentoControladoPorValor ? null : toNumber(quantidade || 1),
            preco_unitario: investimentoControladoPorValor ? null : toNumber(precoUnitario || valorNumber),
            valor_total: investimentoControladoPorValor ? valorNumber : null,
            corretora: corretoraInvestimento.trim() || null,
            observacao: obs || null,
          }
        : null;

    return {
      valor: valorNumber,
      tipo,
      categoria_id: categoriaId,
      subcategoria_id: subcategoriaId,
      metodo_pagamento_id: tipo === "INVESTIMENTO" || tipo === "SEPARAR" || selectedCartaoId ? null : metodoId,
      caixinha_nome: tipo === "SEPARAR" ? observacao.trim() || subcategoriaLabel || categoriaLabel || "Caixinha" : undefined,
      observacao: obs || null,
      data_lancamento: dataLancamento || null,
      cartao,
      movimento_investimento: movimentoInvestimento,
    };
  }

  function buildContaFuturaPayload() {
    const categoriaLabel = categoriaOptions.find((item) => item.id === categoriaId)?.label ?? tempCategoria;
    const subcategoriaLabel = subcategoriaOptions.find((item) => item.id === subcategoriaId)?.label ?? tempSubcategoria;
    const descricao = observacao.trim() || subcategoriaLabel || categoriaLabel || "Conta futura";
    return {
      descricao,
      valor: valorNumber,
      categoria_id: categoriaId,
      subcategoria_id: subcategoriaId,
      metodo_pagamento_id: metodoId,
      data_vencimento: dataLancamento || null,
      observacao: observacao.trim() || null,
    };
  }

  async function persist(payload: Record<string, unknown>) {
    setSubmitting(true);
    try {
      await onSubmit(payload);
      resetForm();
    } finally {
      setSubmitting(false);
    }
  }

  async function persistContaFutura(payload: Record<string, unknown>) {
    if (!onCreateContaFutura) return;
    setSubmitting(true);
    try {
      await onCreateContaFutura(payload);
      resetForm();
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (valorNumber <= 0) return;
    if (tipo === "GASTO" && !metodoId) {
      alert("Gasto exige metodo de pagamento.");
      return;
    }
    if (tipo === "SEPARAR" && (!categoriaId || !subcategoriaId)) {
      alert("Separar dinheiro exige categoria e subcategoria.");
      return;
    }
    if (isContaFutura) {
      if (!categoriaId || !subcategoriaId) {
        alert("Conta futura exige item e subitem.");
        return;
      }
      if (!metodoId || selectedCartaoId) {
        alert("Conta futura exige metodo de pagamento sem cartao.");
        return;
      }
      await persistContaFutura(buildContaFuturaPayload());
      return;
    }
    if (tipo === "INVESTIMENTO" && destinoInvestimento === "COMPRA_ATIVO" && tickerInvestimentoObrigatorio && !ticker.trim()) {
      alert("Informe o ticker do ativo.");
      return;
    }
    if (tipo === "INVESTIMENTO" && destinoInvestimento === "COMPRA_ATIVO" && investimentoControladoPorValor && !nomeInvestimento.trim()) {
      alert("Informe o nome do investimento.");
      return;
    }
    if (tipo === "GASTO" && isCartao) {
      if (!selectedCartaoId) {
        alert("Selecione um cartao cadastrado como metodo de pagamento.");
        return;
      }
      if (!categoriaId || !subcategoriaId) {
        alert("Compra no cartao exige item e subitem para entrar corretamente no orcamento quando for separada.");
        return;
      }
      setModalCartao(true);
      return;
    }
    if (tipo === "INVESTIMENTO" && destinoInvestimento === "COMPRA_ATIVO") {
      saveInvestmentBrokerPref(tipoAtivo, corretoraInvestimento);
    }
    await persist(buildPayload());
  }

  function changeTipo(value: TipoLancamento) {
    if (value === "INVESTIMENTO" && !allowInvestment) return;
    setTipo(value);
    setCategoriaId(null);
    setSubcategoriaId(null);
    setMetodoId(null);
    setSepararContaFutura(false);
  }

  function changeTipoAtivo(value: TipoAtivo) {
    setTipoAtivo(value);
    setTicker("");
    setNomeInvestimento("");
    setCorretoraInvestimento(readInvestmentBrokerPrefs()[value] ?? "");
  }

  return (
    <>
      <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
        <div className="md:col-span-2 xl:col-span-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Essencial</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Valor, tipo, finalidade e forma de pagamento.</p>
        </div>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Valor</span>
          <MoneyInput value={valor} onChange={(event) => setValor(event.target.value)} required />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Tipo</span>
          {lockType ? (
            <div className="flex h-8 items-center rounded-md border border-slate-700 bg-slate-950 px-2.5 text-[13px] text-slate-300">
              {tipo === "INVESTIMENTO" ? "Investimento" : tipo === "RECEITA" ? "Receita" : tipo === "SEPARAR" ? "Separar" : "Despesa"}
            </div>
          ) : (
            <Select value={tipo} onChange={(event) => changeTipo(event.target.value as TipoLancamento)}>
              <option value="GASTO">Despesa</option>
              <option value="SEPARAR">Separar</option>
              <option value="RECEITA">Receita</option>
              {allowInvestment && <option value="INVESTIMENTO">Investimento</option>}
            </Select>
          )}
        </label>
        <ComboboxCreate
          label="Item"
          placeholder="Buscar item"
          createNoun="item"
          valueId={categoriaId}
          temporaryValue={tempCategoria}
          options={categoriaOptions}
          onSelect={(option) => {
            setCategoriaId(option?.id ?? null);
            setTempCategoria("");
            setSubcategoriaId(null);
          }}
          onCreatePersist={async (nome) => onCreateCategoria(nome, naturezaTipo)}
          onUseTemporary={(nome) => {
            setCategoriaId(null);
            setTempCategoria(nome);
          }}
        />
        <ComboboxCreate
          label="Sub-item"
          placeholder="Buscar sub-item"
          createNoun="sub-item"
          valueId={subcategoriaId}
          temporaryValue={tempSubcategoria}
          options={subcategoriaOptions}
          onSelect={(option) => {
            if (!option) {
              setSubcategoriaId(null);
              setTempSubcategoria("");
              return;
            }
            const subcategoria = subcategorias.find((item) => item.id === option.id);
            if (subcategoria) {
              setCategoriaId(subcategoria.categoria_id);
              setTempCategoria("");
            }
            setSubcategoriaId(option.id);
            setTempSubcategoria("");
          }}
          onCreatePersist={async (nome) => {
            if (!categoriaId) throw new Error("Selecione ou crie um item salvo antes de criar sub-item.");
            return onCreateSubcategoria(nome, categoriaId);
          }}
          onUseTemporary={(nome) => {
            if (!categoriaId && !tempCategoria) {
              alert("Selecione ou crie o item correspondente antes de usar um sub-item.");
              return;
            }
            setSubcategoriaId(null);
            setTempSubcategoria(nome);
          }}
        />
        {tipo !== "INVESTIMENTO" && tipo !== "SEPARAR" ? (
          <ComboboxCreate
            label={tipo === "RECEITA" ? "Metodo de recebimento" : "Metodo de pagamento"}
            createNoun="metodo de pagamento"
            dialogArticle="O"
            valueId={metodoId}
            temporaryValue={tempMetodo}
            options={metodoOptions}
            onSelect={(option) => {
              setMetodoId(option?.id ?? null);
              setTempMetodo("");
            }}
            onCreatePersist={async (nome) => onCreateMetodo(nome)}
            onUseTemporary={(nome) => {
              setMetodoId(null);
              setTempMetodo(nome);
            }}
          />
        ) : (
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Metodo</span>
            <div className="flex h-8 items-center rounded-md border border-slate-700 bg-slate-950 px-2.5 text-[13px] text-slate-500">
              Nao exigido
            </div>
          </div>
        )}
        {tipo === "GASTO" && onCreateContaFutura && (
          <label className="flex h-8 min-w-0 items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-2.5 text-[13px] text-slate-300 transition hover:border-slate-600">
            <input
              className="h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-950 accent-brand-500"
              type="checkbox"
              checked={separarContaFutura}
              onChange={(event) => setSepararContaFutura(event.target.checked)}
            />
            <span className="min-w-0 truncate">
              Conta futura
              <span className="ml-1 hidden text-slate-500 2xl:inline">separar para pagar depois</span>
            </span>
          </label>
        )}
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">{tipo === "SEPARAR" ? "Caixinha" : isContaFutura ? "Descricao da conta" : "Observacao"}</span>
          <Textarea
            className="min-h-9 resize-none py-2"
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
            placeholder={tipo === "SEPARAR" ? "Ex.: IPVA, Livros" : isContaFutura ? "Ex.: Luz, internet, boleto" : "Opcional"}
          />
        </label>
        <div className="flex items-end xl:col-span-1">
          <Button className="w-full" type="submit" disabled={submitting || valorNumber <= 0}>
            <Save className="h-4 w-4" />
            {isContaFutura ? "Separar conta" : tipo === "SEPARAR" ? "Separar" : "Salvar"}
          </Button>
        </div>

        {tipo === "INVESTIMENTO" && (
          <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 md:col-span-2 xl:col-span-4 xl:grid-cols-4">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">Destino</span>
              <Select value={destinoInvestimento} onChange={(event) => setDestinoInvestimento(event.target.value)}>
                <option value="COMPRA_ATIVO">Compra de ativo</option>
                <option value="RESERVA">Reserva/caixa</option>
                <option value="PREVIDENCIA">Previdencia</option>
              </Select>
            </label>
            {destinoInvestimento === "COMPRA_ATIVO" && (
              <>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500">Tipo ativo</span>
                  <Select value={tipoAtivo} onChange={(event) => changeTipoAtivo(event.target.value as TipoAtivo)}>
                    {INVESTMENT_TYPE_OPTIONS.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500">Conta/corretora</span>
                  <Input value={corretoraInvestimento} onChange={(event) => setCorretoraInvestimento(event.target.value)} placeholder="Ex.: XP, Inter, Santander" />
                </label>
                {tickerInvestimentoObrigatorio && (
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-500">Ticker</span>
                    <Input value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder={tickerPlaceholder(tipoAtivo)} />
                  </label>
                )}
                {investimentoControladoPorValor ? (
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-500">Nome do investimento</span>
                    <Input
                      value={nomeInvestimento}
                      onChange={(event) => setNomeInvestimento(event.target.value)}
                      placeholder="Ex.: Caixinha viagem, Reserva Nubank"
                    />
                  </label>
                ) : (
                  <>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-500">Quantidade</span>
                      <Input type="number" min="0" step="0.0001" value={quantidade} onChange={(event) => setQuantidade(event.target.value)} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-500">Preco unitario</span>
                      <MoneyInput value={precoUnitario} onChange={(event) => setPrecoUnitario(event.target.value)} />
                    </label>
                  </>
                )}
                <div className="flex items-center rounded-md border border-slate-800 bg-slate-950/50 px-2.5 py-2 text-xs text-slate-500 xl:col-span-2">
                  {investimentoControladoPorValor
                    ? `Moeda definida automaticamente: ${moedaInvestimento}. Valor do investimento: valor do lancamento.`
                    : `Moeda definida automaticamente: ${moedaInvestimento}. Data do investimento: data do lancamento.`}
                </div>
              </>
            )}
          </div>
        )}

        <div className="md:col-span-2 xl:col-span-4">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-200"
            onClick={() => setShowDate(!showDate)}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {showDate ? "Ocultar data" : isContaFutura ? "Alterar vencimento" : "Alterar data do lancamento"}
          </button>
          {showDate && (
            <div className="mt-2 max-w-48">
              <Input type="date" value={dataLancamento} onChange={(event) => setDataLancamento(event.target.value)} />
            </div>
          )}
        </div>
      </form>
      <CartaoPagamentoModal
        open={modalCartao}
        valorTotal={valorNumber}
        initialCartaoId={selectedCartaoId ?? undefined}
        onClose={() => setModalCartao(false)}
        onConfirm={async (cartao) => {
          setModalCartao(false);
          await persist(buildPayload(cartao));
        }}
      />
    </>
  );
}
