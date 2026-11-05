"use client";

// Building blocks shared by the Pots and Plants list pages: search/filter
// toolbar, summary tiles, a card ⋮ menu, empty state and loading skeleton.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { EllipsisVertical, Search, X, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui";
import { GardenPicker, type PickerGarden } from "@/components/GardenPicker";
import { useDismiss } from "@/components/HeaderMenus";

/** Current time, refreshed so "is this reading live?" re-evaluates. */
export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export const HEALTH_PILL: Record<string, string> = {
  healthy: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  diseased: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  at_risk: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  recovering: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  unknown: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function Toolbar({
  query,
  onQuery,
  placeholder,
  gardens,
  gardenFilter,
  onGarden,
  extra,
  filtersActive,
  onClear,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  gardens: PickerGarden[];
  gardenFilter: string;
  onGarden: (value: string) => void;
  extra?: ReactNode;
  filtersActive: boolean;
  onClear: () => void;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Search</span>
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950"
        />
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <GardenPicker gardens={gardens} value={gardenFilter} onChange={onGarden} label="" allLabel="All gardens" className="w-full sm:w-64" />
        {extra}
        {filtersActive ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
          >
            <X size={14} />
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

export const selectClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 sm:w-44";

const TILE_TONE: Record<string, string> = {
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
  default: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
};

/** Summary number that doubles as a quick filter. */
export function Tile({
  icon: Icon,
  label,
  value,
  tone,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: "amber" | "sky" | "rose";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left shadow-sm transition dark:bg-slate-900 ${
        active ? "border-emerald-500/60 ring-1 ring-emerald-500/30" : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
      }`}
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TILE_TONE[tone ?? "default"]}`}>
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-black leading-tight">{value}</span>
        <span className="block truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      </span>
    </button>
  );
}

export interface CardMenuItem {
  icon: LucideIcon;
  label: string;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
}

export function CardMenu({ label, items }: { label: string; items: CardMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);
  const base = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium";

  return (
    <div ref={rootRef} className="relative -mr-1.5 -mt-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <EllipsisVertical size={16} />
      </button>
      {open ? (
        <div
          role="menu"
          className="animate-fade-in absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40"
        >
          {items.map((item) => {
            const className = `${base} ${
              item.danger
                ? "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            }`;
            const icon = <item.icon size={15} className={item.danger ? "" : "text-slate-400"} />;
            return (
              <div key={item.label}>
                {item.danger ? <div className="my-1 border-t border-slate-100 dark:border-slate-800" /> : null}
                {item.href ? (
                  <Link role="menuitem" href={item.href} onClick={() => setOpen(false)} className={className}>
                    {icon}
                    {item.label}
                  </Link>
                ) : (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      item.onSelect?.();
                    }}
                    className={className}
                  >
                    {icon}
                    {item.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function EmptyCard({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
        <Icon size={26} />
      </span>
      <h2 className="mt-4 text-lg font-black">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{text}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}

export function ShowMore({ left, onClick }: { left: number; onClick: () => void }) {
  if (left <= 0) return null;
  return (
    <div className="mt-6 text-center">
      <button
        type="button"
        onClick={onClick}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        Show more ({left} left)
      </button>
    </div>
  );
}

export function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-52 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
      ))}
    </div>
  );
}
