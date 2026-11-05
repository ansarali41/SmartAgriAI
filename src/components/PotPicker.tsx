"use client";

// Searchable pot picker across all gardens: "#3 · POT-3 · Aloe vera", with the
// garden underneath. Search by pot number, name, plant or garden — works the
// same with 3 pots or 1,000.
import { useCallback, useId, useRef, useState } from "react";
import { ChevronDown, Sprout, Trees } from "lucide-react";
import { useDismiss } from "@/components/HeaderMenus";
import { SearchList } from "@/components/SearchList";

export interface PickerPot {
  id: string;
  number: number;
  label: string;
  gardenId: string;
  garden?: { name: string } | null;
  plant: { id: string; commonName: string } | null;
}

export function PotPicker({
  pots,
  value,
  onChange,
  requirePlant = false,
  className = "w-full",
}: {
  pots: PickerPot[];
  value: string;
  onChange: (pot: PickerPot) => void;
  /** Pots without a plant are shown but can't be picked. */
  requirePlant?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const triggerId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);

  const sorted = [...pots].sort((a, b) => a.number - b.number);
  const byId = new Map(sorted.map((pot) => [pot.id, pot]));
  const selected = byId.get(value);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
      >
        <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 px-1.5 text-xs font-black tabular-nums text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          {selected ? `#${selected.number}` : <Sprout size={16} />}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-bold">
            {selected ? `${selected.label} · ${selected.plant?.commonName ?? "No plant"}` : "Choose a pot"}
          </span>
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
            {selected ? (selected.garden?.name ?? "") : `${pots.length} pots`}
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="animate-fade-in absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40">
          <SearchList
            placeholder="Search pot number, plant or garden…"
            emptyText="No pots match"
            subtitleIcon={Trees}
            selectedId={value}
            items={sorted.map((pot) => ({
              id: pot.id,
              badge: `#${pot.number}`,
              title: `${pot.label} · ${pot.plant?.commonName ?? "No plant"}`,
              subtitle: pot.garden?.name ?? null,
              keywords: [`pot-${pot.number}`, `pot ${pot.number}`],
              disabled: requirePlant && !pot.plant,
            }))}
            onChoose={(item) => {
              const pot = byId.get(item.id);
              if (!pot) return;
              onChange(pot);
              close();
              document.getElementById(triggerId)?.focus();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
