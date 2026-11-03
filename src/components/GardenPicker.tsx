"use client";

// Searchable garden switcher: one button that opens a filterable, scrolling
// list, so it stays usable whether the user has 3 gardens or 1,000.
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, MapPin, Search, Trees } from "lucide-react";
import { useDismiss } from "@/components/HeaderMenus";

export interface PickerGarden {
  id: string;
  name: string;
  location?: string | null;
  type?: string;
}

const MAX_RESULTS = 100;

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
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const triggerId = useId();
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlight(0);
  }, []);
  useDismiss(open, close, rootRef, triggerRef);

  const selected = value === "all" && allLabel ? { id: "all", name: allLabel, location: `${gardens.length} gardens` } : gardens.find((garden) => garden.id === value);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? gardens.filter((garden) =>
          [garden.name, garden.location ?? "", garden.type ?? ""].some((field) => field.toLowerCase().includes(needle)),
        )
      : gardens;
    return list;
  }, [gardens, query]);
  const ALL: PickerGarden = { id: "all", name: allLabel ?? "" };
  const shown = [...(allLabel && !query.trim() ? [ALL] : []), ...matches.slice(0, MAX_RESULTS)];

  // Return focus to the trigger after picking, for keyboard users.
  function choose(gardenId: string) {
    onChange(gardenId);
    close();
    document.getElementById(triggerId)?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => Math.min(index + 1, shown.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (shown[highlight]) choose(shown[highlight].id);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label ? <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span> : null}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
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
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <label className="relative block">
              <span className="sr-only">Search gardens</span>
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlight(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={`Search ${gardens.length} gardens…`}
                role="combobox"
                aria-controls={listId}
                aria-expanded="true"
                aria-activedescendant={shown[highlight] ? `${listId}-${shown[highlight].id}` : undefined}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 [&::-webkit-search-cancel-button]:hidden"
              />
            </label>
          </div>
          <ul id={listId} role="listbox" aria-label="Gardens" className="max-h-72 overflow-y-auto p-1">
            {shown.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-slate-400">No gardens match “{query}”.</li>
            ) : (
              shown.map((garden, index) => {
                const isSelected = garden.id === value;
                return (
                  <li
                    key={garden.id}
                    id={`${listId}-${garden.id}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => choose(garden.id)}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 ${
                      index === highlight ? "bg-slate-100 dark:bg-slate-800" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${isSelected ? "font-bold text-emerald-700 dark:text-emerald-300" : "font-medium"}`}>
                        {garden.name}
                      </span>
                      {garden.location ? (
                        <span className="flex items-center gap-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                          <MapPin size={10} className="shrink-0" />
                          {garden.location}
                        </span>
                      ) : null}
                    </span>
                    {isSelected ? <Check size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" /> : null}
                  </li>
                );
              })
            )}
          </ul>
          {matches.length > MAX_RESULTS ? (
            <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400 dark:border-slate-800">
              Showing {MAX_RESULTS} of {matches.length} — type to narrow down.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
