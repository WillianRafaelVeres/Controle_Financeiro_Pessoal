import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import type React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  label?: string;
  placeholder?: string;
  valueId?: string | null;
  temporaryValue?: string;
  options: ComboOption[];
  createNoun?: string;
  dialogArticle?: string;
  disabled?: boolean;
  createExtra?: React.ReactNode;
  emptyMessage?: string;
  onSelect: (option: ComboOption | null) => void;
  onCreatePersist?: (name: string) => Promise<ComboOption | void>;
  onUseTemporary?: (name: string) => void;
}

interface DropdownPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function ComboboxCreate({
  label,
  placeholder = "Pesquisar",
  valueId,
  temporaryValue,
  options,
  createNoun = "item",
  dialogArticle = "A",
  disabled,
  createExtra,
  emptyMessage = "Nenhum item encontrado.",
  onSelect,
  onCreatePersist,
  onUseTemporary,
}: ComboboxCreateProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === valueId);
  const display = selected?.label ?? temporaryValue ?? "";
  const filtered = useMemo(() => {
    const normalized = normalize(query);
    if (!normalized) return options;
    return options
      .filter((option) => normalize(`${option.label} ${option.description ?? ""}`).includes(normalized))
      .sort((a, b) => {
        // quem "comeca com" o texto digitado aparece primeiro
        const aStarts = normalize(a.label).startsWith(normalized) ? 0 : 1;
        const bStarts = normalize(b.label).startsWith(normalized) ? 0 : 1;
        return aStarts - bStarts;
      });
  }, [options, query]);
  const canCreate =
    Boolean(onCreatePersist) &&
    query.trim().length > 0 &&
    !options.some((option) => normalize(option.label) === normalize(query));
  const rowCount = filtered.length + (canCreate ? 1 : 0);

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

  // useLayoutEffect garante que a posicao e medida ANTES da pintura: o painel
  // ja aparece ancorado logo abaixo do campo (sem "piscar" no rodape da tela).
  // Recalcula tambem quando a lista filtrada muda de tamanho.
  useLayoutEffect(() => {
    if (!open) return;
    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [open, rowCount]);

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

  // mantem o item ativo dentro dos limites e visivel ao navegar pelo teclado
  useEffect(() => {
    setActiveIndex((current) => (current >= rowCount ? Math.max(0, rowCount - 1) : current));
  }, [rowCount]);

  useEffect(() => {
    if (!open) return;
    const node = dropdownRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function selectRow(index: number) {
    if (index < filtered.length) {
      onSelect(filtered[index]);
      closeDropdown();
      return;
    }
    if (canCreate) {
      setError("");
      setPendingName(query.trim());
      setOpen(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      closeDropdown();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIndex((current) => (rowCount === 0 ? 0 : (current + 1) % rowCount));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (rowCount === 0 ? 0 : (current - 1 + rowCount) % rowCount));
      return;
    }
    if (event.key === "Home") {
      if (!open) return;
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      if (!open) return;
      event.preventDefault();
      setActiveIndex(Math.max(0, rowCount - 1));
      return;
    }
    if (event.key === "Enter") {
      if (open && rowCount > 0) {
        event.preventDefault();
        selectRow(activeIndex);
      }
    }
  }

  async function persist() {
    if (!onCreatePersist) return;
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
            role="listbox"
            className="overflow-y-auto rounded-xl border border-white/15 bg-slate-950/95 p-1.5 shadow-[0_22px_70px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-xl"
            style={{
              position: "fixed",
              zIndex: 9000,
              left: dropdownPosition.left,
              top: dropdownPosition.top,
              width: dropdownPosition.width,
              maxHeight: dropdownPosition.maxHeight,
            }}
          >
            {filtered.map((option, index) => {
              const active = index === activeIndex;
              const isSelected = option.id === valueId;
              return (
                <button
                  key={option.id}
                  type="button"
                  data-active={active}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-slate-200 transition",
                    active ? "bg-white/[0.08]" : "hover:bg-white/[0.06]",
                    isSelected && "border border-brand-500/25 bg-brand-500/15 text-emerald-300",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    onSelect(option);
                    closeDropdown();
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{option.label}</span>
                    {option.description && <span className="block truncate text-xs text-slate-400">{option.description}</span>}
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
            {canCreate && (
              <button
                type="button"
                data-active={activeIndex === filtered.length}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-emerald-300 transition",
                  activeIndex === filtered.length ? "bg-brand-500/15" : "hover:bg-brand-500/10",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(filtered.length)}
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
            {filtered.length === 0 && !canCreate && <div className="px-3 py-2 text-[13px] text-slate-500">{emptyMessage}</div>}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="min-w-0 space-y-1.5" ref={wrapperRef}>
      {label && <span className="text-xs font-semibold text-slate-400">{label}</span>}
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
        <Input
          ref={inputRef}
          className="pl-9 pr-9"
          disabled={disabled}
          aria-label={label}
          role="combobox"
          aria-expanded={open}
          autoComplete="off"
          value={open ? query : display}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            setActiveIndex(0);
            setQuery(display);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {valueId || temporaryValue ? (
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
        ) : (
          <ChevronDown
            className={cn(
              "pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-500 transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </div>
      {dropdown}
      {onCreatePersist && (
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
      )}
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
