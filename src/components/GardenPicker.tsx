"use client";

// Searchable garden switcher: one button that opens a filterable, scrolling
// list, so it stays usable whether the user has 3 gardens or 1,000.
import { useCallback, useId, useRef, useState } from "react";
import { ChevronDown, Trees } from "lucide-react";
import { useDismiss } from "@/components/HeaderMenus";
import { GardenSearchList, type PickerGarden } from "@/components/GardenSearchList";

export type { PickerGarden };

export function GardenPicker({
  gardens,
  value,
  onChange,
  label = "Garden",
  allLabel,
  className = "w-full sm:w-80",
}: {
  gardens: PickerGarden[];
  value: string;
  onChange: (gardenId: string) => void;
  label?: string;
  /** Adds an "all gardens" choice whose value is "all". */
  allLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const triggerId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);

  const selected = value === "all" && allLabel ? { id: "all", name: allLabel, location: `${gardens.length} gardens` } : gardens.find((garden) => garden.id === value);

  // Return focus to the trigger after picking, for keyboard users.
  function choose(garden: PickerGarden) {
    onChange(garden.id);
    close();
    document.getElementById(triggerId)?.focus();
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label ? <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span> : null}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <Trees size={16} />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-bold">{selected?.name ?? "Choose a garden"}</span>
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
            {selected ? selected.location || "No location" : `${gardens.length} gardens`}
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="animate-fade-in absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40">
          <GardenSearchList gardens={gardens} selectedId={value} allLabel={allLabel} onChoose={choose} />
        </div>
      ) : null}
    </div>
  );
}
