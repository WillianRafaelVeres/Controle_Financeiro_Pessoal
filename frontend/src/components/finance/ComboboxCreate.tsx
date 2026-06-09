import { Check, Plus, Search, X } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

interface DropdownPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
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
  const [error, setError] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === valueId);
  const display = selected?.label ?? temporaryValue ?? "";
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => `${option.label} ${option.description ?? ""}`.toLowerCase().includes(normalized));
  }, [options, query]);
  const canCreate = query.trim().length > 0 && !options.some((option) => option.label.toLowerCase() === query.trim().toLowerCase());

  function closeDropdown() {
    setOpen(false);
    setQuery("");
  }

  function updateDropdownPosition() {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;

    const viewportPadding = 16;
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;
    const availableSpace = Math.max(140, (openBelow ? spaceBelow : spaceAbove) - gap);
    const maxHeight = Math.min(360, availableSpace);
    const width = Math.min(Math.max(rect.width, 260), window.innerWidth - viewportPadding * 2);

    setDropdownPosition({
      left: Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding)),
      top: openBelow ? rect.bottom + gap : Math.max(viewportPadding, rect.top - gap - maxHeight),
      width,
      maxHeight,
    });
  }

  useEffect(() => {
    if (!open) return;
    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      closeDropdown();
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  async function persist() {
    setError("");
    try {
      const created = await onCreatePersist(pendingName);
      if (created) onSelect(created);
      setPendingName("");
      closeDropdown();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel criar o item.");
    }
  }

  const dropdown =
    open && dropdownPosition
      ? createPortal(
          <div
            ref={dropdownRef}
            className="glass-highlight fixed z-[80] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/[0.92] p-1.5 shadow-[0_22px_70px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/[0.05] backdrop-blur-xl"
            style={{
              left: dropdownPosition.left,
              top: dropdownPosition.top,
              width: dropdownPosition.width,
              maxHeight: dropdownPosition.maxHeight,
            }}
          >
            {filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-slate-200 transition hover:bg-white/[0.08]",
                  option.id === valueId && "border border-brand-500/25 bg-brand-500/15 text-emerald-300",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(option);
                  closeDropdown();
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{option.label}</span>
                  {option.description && <span className="block truncate text-xs text-slate-400">{option.description}</span>}
                </span>
                {option.id === valueId && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-emerald-300 transition hover:bg-brand-500/15"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setError("");
                  setPendingName(query.trim());
                  setOpen(false);
                }}
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="truncate">Criar {createNoun} "{query.trim()}"</span>
              </button>
            )}
            {filtered.length === 0 && !canCreate && <div className="px-3 py-2 text-[13px] text-slate-500">Nenhum item encontrado.</div>}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="min-w-0 space-y-1.5" ref={wrapperRef}>
      <span className="text-xs font-semibold text-slate-400">{label}</span>
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
        <Input
          ref={inputRef}
          className="pl-9 pr-9"
          disabled={disabled}
          aria-label={label}
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
          onKeyDown={(event) => {
            if (event.key === "Escape") closeDropdown();
          }}
        />
        {(valueId || temporaryValue) && (
          <button
            className="absolute right-2 top-2.5 flex h-5 w-5 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.08] hover:text-slate-100"
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
      </div>
      {dropdown}
      <Dialog open={pendingName.length > 0} title={`${capitalize(createNoun)} ainda nao existe`} onClose={() => setPendingName("")}>
        <p className="text-sm text-slate-400">
          {`${dialogArticle} ${createNoun} "${pendingName}" ainda nao existe. Deseja adicionar a lista para lancamentos futuros?`}
        </p>
        {error && <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs font-medium text-red-300">{error}</div>}
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
                closeDropdown();
              }}
            >
              Usar so neste lancamento
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
