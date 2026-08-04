import { useEffect, useMemo, useState } from "react";

import { MoneyInput } from "../../components/finance/MoneyInput";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { toNumber } from "../../lib/formatters";
import { INVESTMENT_TYPE_LABELS, INVESTMENT_TYPE_OPTIONS } from "../../lib/investmentProfiles";
import type { Ativo, TipoAtivo } from "../../lib/types";

function proventoPadrao(tipoAtivo: TipoAtivo) {
  if (tipoAtivo === "FII") return "RENDIMENTO_FII";
  if (tipoAtivo === "EXTERIOR" || tipoAtivo === "ACAO_EXTERIOR" || tipoAtivo === "ETF_EXTERIOR") return "DIVIDENDO_EXTERIOR";
  if (tipoAtivo === "RENDA_FIXA" || tipoAtivo === "CAIXINHA_CDB" || tipoAtivo === "RESERVA_EMERGENCIA" || tipoAtivo === "PREVIDENCIA") return "JUROS_RENDA_FIXA";
  return "DIVIDENDO";
}

export function DividendosForm({ ativos, onSubmit }: { ativos: Ativo[]; onSubmit: (payload: Record<string, unknown>) => Promise<void> }) {
  const tiposDisponiveis = useMemo(() => {
    const tipos = new Set(ativos.map((ativo) => ativo.tipo_ativo));
    return INVESTMENT_TYPE_OPTIONS.filter((tipo) => tipos.has(tipo.value));
  }, [ativos]);
  const [tipoAtivo, setTipoAtivo] = useState<TipoAtivo>(tiposDisponiveis[0]?.value ?? "ACAO_BR");
  const [ativoId, setAtivoId] = useState("");
  const [valor, setValor] = useState("");
  const [dataRecebimento, setDataRecebimento] = useState(() => new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState("DIVIDENDO");
  const ativosFiltrados = useMemo(() => ativos.filter((ativo) => ativo.tipo_ativo === tipoAtivo), [ativos, tipoAtivo]);
  const ativo = ativos.find((item) => item.id === ativoId);

  useEffect(() => {
    if (tiposDisponiveis.length === 0) return;
    if (!tiposDisponiveis.some((item) => item.value === tipoAtivo)) {
      const proximoTipoAtivo = tiposDisponiveis[0].value;
      setTipoAtivo(proximoTipoAtivo);
      setTipo(proventoPadrao(proximoTipoAtivo));
    }
  }, [tipoAtivo, tiposDisponiveis]);

  function changeTipoAtivo(value: TipoAtivo) {
    setTipoAtivo(value);
    setAtivoId("");
    setTipo(proventoPadrao(value));
  }

  return (
    <form
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-[190px_minmax(260px,1fr)_180px_180px_150px_auto] xl:items-end"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit({
          ativo_id: ativoId,
          valor: toNumber(valor),
          tipo_provento: ativo?.moeda === "USD" && tipo === "DIVIDENDO" ? "DIVIDENDO_EXTERIOR" : tipo,
          moeda: ativo?.moeda ?? "BRL",
          data_recebimento: dataRecebimento,
        });
        setAtivoId("");
        setValor("");
      }}
    >
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
      <label className="space-y-1">
        <span className="text-xs font-medium text-slate-500">Ativo em carteira</span>
        <Select value={ativoId} onChange={(event) => setAtivoId(event.target.value)} required>
          <option value="">Selecione um ativo</option>
          {ativosFiltrados.map((ativo) => (
            <option key={ativo.id} value={ativo.id}>
              {ativo.ticker} - {ativo.nome} {ativo.corretora ? `(${ativo.corretora})` : ""}
            </option>
          ))}
        </Select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium text-slate-500">Provento</span>
        <Select value={tipo} onChange={(event) => setTipo(event.target.value)}>
          <option value="DIVIDENDO">Dividendo</option>
          <option value="JCP">JCP</option>
          <option value="RENDIMENTO_FII">Rendimento FII</option>
          <option value="JUROS_RENDA_FIXA">Juros</option>
          <option value="DIVIDENDO_EXTERIOR">Dividendo exterior</option>
          <option value="OUTRO">Outro</option>
        </Select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium text-slate-500">Valor</span>
        <MoneyInput value={valor} onChange={(event) => setValor(event.target.value)} required />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium text-slate-500">Recebido em</span>
        <Input type="date" value={dataRecebimento} onChange={(event) => setDataRecebimento(event.target.value)} required />
      </label>
      <Button type="submit" className="w-full xl:w-auto">
        Registrar
      </Button>
      <div className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-500 md:col-span-2 xl:col-span-6">
        {ativo ? `${INVESTMENT_TYPE_LABELS[ativo.tipo_ativo]} selecionado. Moeda do registro: ${ativo.moeda}.` : "Escolha o tipo para ver somente os ativos correspondentes."}
      </div>
    </form>
  );
}
