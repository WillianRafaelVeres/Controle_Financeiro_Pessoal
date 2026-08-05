import { useEffect, useMemo, useState } from "react";

import { ComboboxCreate } from "../../components/finance/ComboboxCreate";
import { MoneyInput } from "../../components/finance/MoneyInput";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { toNumber } from "../../lib/formatters";
import { INVESTMENT_TYPE_LABELS, INVESTMENT_TYPE_OPTIONS } from "../../lib/investmentProfiles";
import type { Ativo, Conta, TipoAtivo } from "../../lib/types";
import { CotacaoDolarField, useCotacaoDolar } from "./CotacaoDolarField";

type OrigemProvento = "ATIVO" | "JUROS_CONTA";

function proventoPadrao(tipoAtivo: TipoAtivo) {
  if (tipoAtivo === "FII") return "RENDIMENTO_FII";
  if (tipoAtivo === "EXTERIOR" || tipoAtivo === "ACAO_EXTERIOR" || tipoAtivo === "ETF_EXTERIOR") return "DIVIDENDO_EXTERIOR";
  if (tipoAtivo === "RENDA_FIXA" || tipoAtivo === "CAIXINHA_CDB" || tipoAtivo === "RESERVA_EMERGENCIA" || tipoAtivo === "PREVIDENCIA") return "JUROS_RENDA_FIXA";
  return "DIVIDENDO";
}

export function DividendosForm({
  ativos,
  contas = [],
  onSubmit,
}: {
  ativos: Ativo[];
  contas?: Conta[];
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const tiposDisponiveis = useMemo(() => {
    const tipos = new Set(ativos.map((ativo) => ativo.tipo_ativo));
    return INVESTMENT_TYPE_OPTIONS.filter((tipo) => tipos.has(tipo.value));
  }, [ativos]);
  const contasAtivas = useMemo(() => contas.filter((conta) => conta.ativa !== false && (conta.moeda ?? "BRL") === "BRL"), [contas]);
  const podeRegistrarAtivo = tiposDisponiveis.length > 0;
  const [origem, setOrigem] = useState<OrigemProvento>("ATIVO");
  const [origemAlterada, setOrigemAlterada] = useState(false);
  const [tipoAtivo, setTipoAtivo] = useState<TipoAtivo>(tiposDisponiveis[0]?.value ?? "ACAO_BR");
  const [ativoId, setAtivoId] = useState("");
  const [contaDestinoId, setContaDestinoId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [valor, setValor] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState(() => new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState("DIVIDENDO");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const ativosFiltrados = useMemo(() => ativos.filter((ativo) => ativo.tipo_ativo === tipoAtivo), [ativos, tipoAtivo]);
  const ativo = ativos.find((item) => item.id === ativoId);
  const emDolar = origem === "ATIVO" && ativo?.moeda === "USD";
  const cotacao = useCotacaoDolar(dataRecebimento, emDolar);
  const ativoOptions = useMemo(
    () =>
      ativosFiltrados.map((item) => ({
        id: item.id,
        label: item.ticker ? `${item.ticker} - ${item.nome}` : item.nome,
        description: item.corretora || undefined,
      })),
    [ativosFiltrados],
  );

  useEffect(() => {
    if (tiposDisponiveis.length === 0) {
      if (!origemAlterada) setOrigem("JUROS_CONTA");
      return;
    }
    if (!origemAlterada) setOrigem("ATIVO");
    if (!tiposDisponiveis.some((item) => item.value === tipoAtivo)) {
      const proximoTipoAtivo = tiposDisponiveis[0].value;
      setTipoAtivo(proximoTipoAtivo);
      setTipo(proventoPadrao(proximoTipoAtivo));
    }
  }, [origemAlterada, tipoAtivo, tiposDisponiveis]);

  function changeOrigem(value: OrigemProvento) {
    setOrigemAlterada(true);
    setOrigem(value);
    if (value === "JUROS_CONTA") {
      setAtivoId("");
      setTipo("JUROS_RENDA_FIXA");
    } else {
      setTipo(proventoPadrao(tipoAtivo));
    }
  }

  function changeTipoAtivo(value: TipoAtivo) {
    setTipoAtivo(value);
    setAtivoId("");
    setTipo(proventoPadrao(value));
  }

  async function submit() {
    setErro("");
    if (origem === "ATIVO" && !ativoId) {
      setErro("Selecione o ativo em carteira.");
      return;
    }
    if (toNumber(valor) <= 0) {
      setErro("Informe um valor maior que zero.");
      return;
    }
    if (!dataRecebimento) {
      setErro("Informe a data de recebimento.");
      return;
    }
    if (emDolar && cotacao.efetiva <= 0) {
      setErro("Informe a cotacao do dolar para converter o provento.");
      return;
    }

    setSalvando(true);
    try {
      if (origem === "JUROS_CONTA") {
        await onSubmit({
          ativo_id: null,
          valor: toNumber(valor),
          tipo_provento: "JUROS_RENDA_FIXA",
          moeda: "BRL",
          data_recebimento: dataRecebimento,
          conta_destino_id: contaDestinoId || null,
          observacao: observacao.trim() || "Juros da conta",
        });
        setContaDestinoId("");
        setObservacao("");
        setValor("");
        return;
      }

      await onSubmit({
        ativo_id: ativoId,
        valor: toNumber(valor),
        tipo_provento: ativo?.moeda === "USD" && tipo === "DIVIDENDO" ? "DIVIDENDO_EXTERIOR" : tipo,
        moeda: ativo?.moeda ?? "BRL",
        data_recebimento: dataRecebimento,
        observacao: observacao.trim() || null,
        // So envia quando o usuario digitou: sem isso o backend resolve sozinho
        // e registra a origem real da cotacao.
        cotacao_brl: emDolar && toNumber(cotacao.manual) > 0 ? toNumber(cotacao.manual) : null,
      });
      setAtivoId("");
      setValor("");
      setObservacao("");
      cotacao.limpar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel registrar o provento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Origem</span>
          <Select value={origem} onChange={(event) => changeOrigem(event.target.value as OrigemProvento)}>
            {podeRegistrarAtivo && <option value="ATIVO">Ativo da carteira</option>}
            <option value="JUROS_CONTA">Juros da conta</option>
          </Select>
        </label>

        {origem === "ATIVO" ? (
          <>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-500">Tipo de ativo</span>
              <Select value={tipoAtivo} onChange={(event) => changeTipoAtivo(event.target.value as TipoAtivo)} required>
                {tiposDisponiveis.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <ComboboxCreate
              label="Ativo em carteira"
              placeholder="Buscar ativo"
              valueId={ativoId || null}
              options={ativoOptions}
              emptyMessage="Nenhum ativo deste tipo na carteira."
              onSelect={(option) => setAtivoId(option?.id ?? "")}
            />
          </>
        ) : (
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-medium text-slate-500">Conta</span>
            <Select value={contaDestinoId} onChange={(event) => setContaDestinoId(event.target.value)}>
              <option value="">Sem conta vinculada</option>
              {contasAtivas.map((conta) => (
                <option key={conta.id} value={conta.id}>
                  {conta.nome}
                </option>
              ))}
            </Select>
          </label>
        )}

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Provento</span>
          <Select value={tipo} onChange={(event) => setTipo(event.target.value)} disabled={origem === "JUROS_CONTA"}>
            <option value="DIVIDENDO">Dividendo</option>
            <option value="JCP">JCP</option>
            <option value="RENDIMENTO_FII">Rendimento FII</option>
            <option value="JUROS_RENDA_FIXA">Juros</option>
            <option value="DIVIDENDO_EXTERIOR">Dividendo exterior</option>
            <option value="OUTRO">Outro</option>
          </Select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Valor {emDolar ? "(USD)" : "(BRL)"}</span>
          <MoneyInput
            currency={emDolar ? "USD" : "BRL"}
            value={valor}
            onChange={(event) => setValor(event.target.value)}
            required
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Recebido em</span>
          <Input type="date" value={dataRecebimento} onChange={(event) => setDataRecebimento(event.target.value)} required />
        </label>

        {emDolar && <CotacaoDolarField className="space-y-1" state={cotacao} valorUsd={toNumber(valor)} />}

        <label className="space-y-1 sm:col-span-2 lg:col-span-3">
          <span className="text-xs font-medium text-slate-500">Observacao</span>
          <Input
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
            placeholder={origem === "JUROS_CONTA" ? "Ex.: rendimento Nubank" : "Ex.: dividendo trimestral"}
          />
        </label>
      </div>

      {erro && <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs font-medium text-red-300">{erro}</div>}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-500">
          {origem === "JUROS_CONTA"
            ? "Registre aqui os juros/rendimentos pagos por contas em reais."
            : ativo
              ? `${INVESTMENT_TYPE_LABELS[ativo.tipo_ativo]} selecionado. Moeda do registro: ${ativo.moeda}.`
              : "Escolha o tipo para ver somente os ativos correspondentes."}
        </p>
        <Button type="submit" disabled={salvando} className="w-full sm:w-auto">
          Registrar
        </Button>
      </div>
    </form>
  );
}
