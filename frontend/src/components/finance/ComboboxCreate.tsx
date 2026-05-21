import { Check, Plus, Search, X } from "lucide-react";
import type React from "react";
import { useMemo, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/input";

export interface ComboOption {
  id: string;
  label: string;
  description?: string;
}

interface ComboboxCreateProps {
  label: string;
  placeholder?: string;
  valueId?: string | null;
  temporaryValue?: string;
  options: ComboOption[];
  createNoun: string;
  dialogArticle?: string;
  disabled?: boolean;
  createExtra?: React.ReactNode;
  onSelect: (option: ComboOption | null) => void;
  onCreatePersist: (name: string) => Promise<ComboOption | void>;
  onUseTemporary?: (name: string) => void;
}

export function ComboboxCreate({
  label,
  placeholder = "Pesquisar",
  valueId,
  temporaryValue,
  options,
  createNoun,
  dialogArticle = "A",
  disabled,
  createExtra,
  onSelect,
  onCreatePersist,
  onUseTemporary,
}: ComboboxCreateProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingName, setPendingName] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === valueId);
  const display = selected?.label ?? temporaryValue ?? "";
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => `${option.label} ${option.description ?? ""}`.toLowerCase().includes(normalized));
  }, [options, query]);
  const canCreate = query.trim().length > 0 && !options.some((option) => option.label.toLowerCase() === query.trim().toLowerCase());

  async function persist() {
    const created = await onCreatePersist(pendingName);
    if (created) onSelect(created);
    setPendingName("");
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="space-y-1" ref={wrapperRef}>
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-500" />
        <Input
          className="pl-9 pr-9"
          disabled={disabled}
          value={open ? query : display}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery(display);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
        {(valueId || temporaryValue) && (
          <button
            className="absolute right-2 top-1.5 flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            type="button"
            onClick={() => {
              onSelect(null);
              setQuery("");
            }}
            aria-label="Limpar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {open && (
          <div className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-700 bg-slate-950 p-1">
            {filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] text-slate-200 hover:bg-slate-800",
                  option.id === valueId && "bg-brand-500/15 text-brand-500",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(option);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span>
                  <span className="block font-medium">{option.label}</span>
                  {option.description && <span className="block text-xs text-slate-500">{option.description}</span>}
                </span>
                {option.id === valueId && <Check className="h-4 w-4" />}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium text-brand-500 hover:bg-brand-500/15"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setPendingName(query.trim())}
              >
                <Plus className="h-4 w-4" />
                Criar {createNoun} "{query.trim()}"
              </button>
            )}
            {filtered.length === 0 && !canCreate && <div className="px-2.5 py-1.5 text-[13px] text-slate-500">Nenhum item encontrado.</div>}
          </div>
        )}
      </div>
      <Dialog open={pendingName.length > 0} title={`${capitalize(createNoun)} ainda não existe`} onClose={() => setPendingName("")}>
        <p className="text-sm text-slate-400">
          {`${dialogArticle} ${createNoun} "${pendingName}" ainda não existe. Deseja adicionar à lista para lançamentos futuros?`}
        </p>
        {createExtra && <div className="mt-4">{createExtra}</div>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setPendingName("")}>
            Cancelar
          </Button>
          {onUseTemporary && (
            <Button
              variant="quiet"
              onClick={() => {
                onUseTemporary(pendingName);
                setPendingName("");
                setOpen(false);
              }}
            >
              Usar só neste lançamento
            </Button>
          )}
          <Button onClick={persist}>Adicionar</Button>
        </div>
      </Dialog>
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
