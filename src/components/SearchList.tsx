"use client";

// Search box + scrolling list for dropdown pickers (gardens, pots, …). Renders
// at most MAX_RESULTS rows so it stays fast with 1,000+ items; typing filters
// by each item's keywords, with title-prefix matches first. ↑/↓/Enter work.
// Mount it only while the dropdown is open — the query resets on unmount.
import { useId, useMemo, useState, type ReactNode } from "react";
import { Check, Search, type LucideIcon } from "lucide-react";

export interface SearchItem {
  id: string;
  title: string;
  subtitle?: string | null;
  /** Short tag before the title, e.g. "#3". */
  badge?: string;
  /** Extra text that search should match (location, plant, …). */
  keywords?: (string | null | undefined)[];
  disabled?: boolean;
}

const MAX_RESULTS = 100;

export function SearchList({
  items,
  onChoose,
  selectedId,
  pinned = [],
  heading,
  placeholder = "Search…",
  emptyText = "Nothing matches",
  subtitleIcon: SubtitleIcon,
  footer,
}: {
  items: SearchItem[];
  onChoose: (item: SearchItem) => void;
  selectedId?: string;
  /** Rows shown above the list while not searching (e.g. "All gardens"). */
  pinned?: SearchItem[];
  heading?: string;
  placeholder?: string;
  emptyText?: string;
  subtitleIcon?: LucideIcon;
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const listId = useId();

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    const starts: SearchItem[] = [];
    const contains: SearchItem[] = [];
    for (const item of items) {
      const title = item.title.toLowerCase();
      if (title.startsWith(needle) || item.badge?.toLowerCase().replace("#", "") === needle.replace("#", "")) starts.push(item);
      else if ([title, item.subtitle ?? "", ...(item.keywords ?? [])].some((field) => (field ?? "").toLowerCase().includes(needle))) contains.push(item);
    }
    return [...starts, ...contains];
  }, [items, query]);

  const shown = [...(query.trim() ? [] : pinned), ...matches.slice(0, MAX_RESULTS)];
  const optionId = (item: SearchItem) => `${listId}-${item.id}`;

  function move(next: number) {
    const index = Math.max(0, Math.min(next, shown.length - 1));
    setHighlight(index);
    if (shown[index]) document.getElementById(optionId(shown[index]))?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(highlight + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(highlight - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = shown[highlight];
      if (item && !item.disabled) onChoose(item);
    }
  }

  return (
    <>
      <div className="border-b border-slate-100 p-2 dark:border-slate-800">
        {heading ? <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{heading}</p> : null}
        <label className="relative block">
          <span className="sr-only">{placeholder}</span>
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
            placeholder={placeholder}
            role="combobox"
            aria-controls={listId}
            aria-expanded="true"
            aria-activedescendant={shown[highlight] ? optionId(shown[highlight]) : undefined}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
      </div>
      <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto p-1 [scrollbar-width:thin]">
        {shown.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-slate-400">
            {emptyText} “{query}”.
          </li>
        ) : (
          shown.map((item, index) => {
            const isSelected = item.id === selectedId;
            return (
              <li
                key={item.id}
                id={optionId(item)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={item.disabled || undefined}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => !item.disabled && onChoose(item)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 ${item.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${
                  index === highlight ? "bg-slate-100 dark:bg-slate-800" : ""
                }`}
              >
                {item.badge ? (
                  <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {item.badge}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${isSelected ? "font-bold text-emerald-700 dark:text-emerald-300" : "font-medium"}`}>
                    {item.title}
                  </span>
                  {item.subtitle ? (
                    <span className="flex items-center gap-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {SubtitleIcon ? <SubtitleIcon size={10} className="shrink-0" /> : null}
                      <span className="truncate">{item.subtitle}</span>
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
          Showing {MAX_RESULTS} of {matches.length.toLocaleString()} — type to narrow down.
        </p>
      ) : null}
      {footer}
    </>
  );
}
