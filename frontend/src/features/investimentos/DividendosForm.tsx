import { useState } from "react";

import { MoneyInput } from "../../components/finance/MoneyInput";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import type { Ativo } from "../../lib/types";

export function DividendosForm({ ativos, onSubmit }: { ativos: Ativo[]; onSubmit: (payload: Record<string, unknown>) => Promise<void> }) {
  const [ativoId, setAtivoId] = useState("");
  const [valor, setValor] = useState("");
  const [tipo, setTipo] = useState("DIVIDENDO");
  const ativo = ativos.find((item) => item.id === ativoId);
  return (
    <form
      className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit({ ativo_id: ativoId, valor: Number(valor), tipo_provento: tipo, moeda: ativo?.moeda ?? "BRL" });
        setValor("");
      }}
    >
      <Select value={ativoId} onChange={(event) => setAtivoId(event.target.value)} required>
        <option value="">Ativo em carteira</option>
        {ativos.map((ativo) => (
          <option key={ativo.id} value={ativo.id}>
            {ativo.ticker} - {ativo.nome}
          </option>
        ))}
      </Select>
      <Select value={tipo} onChange={(event) => setTipo(event.target.value)}>
        <option value="DIVIDENDO">Dividendo</option>
        <option value="JCP">JCP</option>
        <option value="RENDIMENTO_FII">Rendimento FII</option>
        <option value="JUROS_RENDA_FIXA">Juros</option>
        <option value="DIVIDENDO_EXTERIOR">Dividendo exterior</option>
        <option value="OUTRO">Outro</option>
      </Select>
      <MoneyInput value={valor} onChange={(event) => setValor(event.target.value)} required />
      <Button type="submit">Registrar</Button>
    </form>
  );
}
