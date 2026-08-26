import { Check, Filter } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { TipoAtivo } from "../../lib/types";
import { INVESTMENT_TYPE_LABELS } from "../../lib/investmentProfiles";

export type ModoEvolucaoCategoria = "valor" | "participacao";

export interface EvolucaoCategoriasFiltersState {
  modo: ModoEvolucaoCategoria;
  categoriasSelecionadas: string[]; // tipos de ativo selecionados visualmente
}

interface EvolucaoCategoriasFiltersProps {
  value: EvolucaoCategoriasFiltersState;
  todasCategorias: string[];
  onChange: (nextState: EvolucaoCategoriasFiltersState) => void;
}

export function EvolucaoCategoriasFilters({
  value,
  todasCategorias,
  onChange,
}: EvolucaoCategoriasFiltersProps) {
  const toggleCategoria = (cat: string) => {
    const exists = value.categoriasSelecionadas.includes(cat);
    const next = exists
      ? value.categoriasSelecionadas.filter((c) => c !== cat)
      : [...value.categoriasSelecionadas, cat];
    onChange({ ...value, categoriasSelecionadas: next });
  };

  const selectAll = () => {
    onChange({ ...value, categoriasSelecionadas: todasCategorias });
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-[#111821] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Modo de visão:</span>
          <div className="flex rounded-md border border-slate-700 bg-slate-900 p-0.5">
            <button
              type="button"
              className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${
                value.modo === "valor"
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              onClick={() => onChange({ ...value, modo: "valor" })}
            >
              Valor (R$)
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${
                value.modo === "participacao"
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              onClick={() => onChange({ ...value, modo: "participacao" })}
            >
              Participação (%)
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={selectAll}
          className="text-xs font-medium text-emerald-400 hover:underline"
        >
          Selecionar todas
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="mr-1 text-xs font-medium text-slate-400">Categorias:</span>
        {todasCategorias.map((cat) => {
          const selected = value.categoriasSelecionadas.includes(cat);
          const label = INVESTMENT_TYPE_LABELS[cat as TipoAtivo] || cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategoria(cat)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selected
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-800 bg-slate-900/60 text-slate-500 line-through hover:border-slate-700 hover:text-slate-300"
              }`}
            >
              {selected && <Check className="h-3 w-3 text-emerald-400" />}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
