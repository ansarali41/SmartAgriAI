"use client";

// Themed date pickers (the browser's built-in ones can't be styled):
// - DatePicker: one date, "YYYY-MM-DD".
// - DateRangePicker: a from/to range with times, "YYYY-MM-DDTHH:mm" each,
//   with quick presets and a two-month calendar.
// Dates are handled as local calendar days (no UTC shifting).
import { useCallback, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useDismiss } from "@/components/HeaderMenus";
import { useNow } from "@/components/ListPage";

// ---------- date helpers (local, string based) ----------

type Ymd = string; // "2026-11-06"

const pad = (n: number) => String(n).padStart(2, "0");
const toYmd = (d: Date): Ymd => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (ymd: Ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (ymd: Ymd, days: number) => {
  const d = fromYmd(ymd);
  d.setDate(d.getDate() + days);
  return toYmd(d);
};
const monthKey = (ymd: Ymd) => ymd.slice(0, 7); // "2026-11"
const addMonths = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

function formatDay(ymd: Ymd, withYear = true) {
  return fromYmd(ymd).toLocaleDateString(undefined, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}


const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// ---------- Calendar month grid ----------

function MonthGrid({
  month,
  selectedStart,
  selectedEnd,
  hover,
  onHover,
  onPick,
  min,
  max,
  today,
}: {
  month: string;
  selectedStart?: Ymd | null;
  selectedEnd?: Ymd | null;
  hover?: Ymd | null;
  onHover?: (day: Ymd | null) => void;
  onPick: (day: Ymd) => void;
  min?: Ymd;
  max?: Ymd;
  today: Ymd;
}) {
  const first = fromYmd(`${month}-01`);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Ymd | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${pad(i + 1)}`),
  ];
  // While choosing the end, preview the range up to the hovered day.
  const rangeEnd = selectedEnd ?? (selectedStart && hover && hover > selectedStart ? hover : null);

  return (
    <div className="w-[15.5rem]">
      <p className="mb-2 text-center text-sm font-bold">{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400">
        {WEEKDAYS.map((day) => (
          <span key={day} className="py-1">
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5" onMouseLeave={() => onHover?.(null)}>
        {cells.map((day, i) => {
          if (!day) return <span key={`blank-${i}`} />;
          const disabled = Boolean((min && day < min) || (max && day > max));
          const isStart = day === selectedStart;
          const isEnd = day === rangeEnd;
          const inRange = Boolean(selectedStart && rangeEnd && day > selectedStart && day < rangeEnd);
          const isToday = day === today;
          return (
            <div
              key={day}
              className={`flex justify-center ${inRange ? "bg-emerald-50 dark:bg-emerald-500/10" : ""} ${
                isStart && rangeEnd ? "rounded-l-full bg-emerald-50 dark:bg-emerald-500/10" : ""
              } ${isEnd && selectedStart ? "rounded-r-full bg-emerald-50 dark:bg-emerald-500/10" : ""}`}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(day)}
                onMouseEnter={() => onHover?.(day)}
                aria-pressed={isStart || isEnd}
                aria-label={fromYmd(day).toDateString()}
                className={`grid h-8 w-8 place-items-center rounded-full text-sm tabular-nums transition disabled:cursor-not-allowed disabled:text-slate-300 dark:disabled:text-slate-700 ${
                  isStart || isEnd
                    ? "bg-emerald-600 font-bold text-white"
                    : inRange
                      ? "text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                      : "hover:bg-slate-100 dark:hover:bg-slate-800"
                } ${isToday && !isStart && !isEnd ? "font-bold text-emerald-600 ring-1 ring-inset ring-emerald-500/50 dark:text-emerald-400" : ""}`}
              >
                {Number(day.slice(8))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NavButton({ dir, onClick, disabled }: { dir: "prev" | "next"; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous month" : "Next month"}
      className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
    >
      {dir === "prev" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
    </button>
  );
}

const triggerClass =
  "flex w-full items-center gap-2.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm transition hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-600";
const popoverClass =
  "animate-fade-in absolute z-40 mt-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40";

// ---------- Single date ----------

export function DatePicker({
  label,
  value,
  onChange,
  min,
  max,
  placeholder = "Pick a date",
  allowClear = true,
}: {
  label?: string;
  value: string; // "" or "YYYY-MM-DD"
  onChange: (value: string) => void;
  min?: string;
  /** Use "today" to block future dates. */
  max?: string | "today";
  placeholder?: string;
  allowClear?: boolean;
}) {
  const now = useNow(60_000);
  const today = toYmd(new Date(now));
  const maxDay = max === "today" ? today : max;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthKey(value || toYmd(new Date())));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);

  function toggle() {
    if (!open) setMonth(monthKey(value || today));
    setOpen(!open);
  }

  function pick(day: Ymd) {
    onChange(day);
    setOpen(false);
  }

  const quick = [
    { label: "Today", day: today },
    { label: "Yesterday", day: addDays(today, -1) },
    { label: "A week ago", day: addDays(today, -7) },
  ].filter((q) => (!maxDay || q.day <= maxDay) && (!min || q.day >= min));

  return (
    <div ref={rootRef} className="relative">
      {label ? <span className="mb-1 block text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span> : null}
      <div className="relative">
        <button ref={triggerRef} type="button" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} className={triggerClass}>
          <CalendarDays size={16} className="shrink-0 text-slate-400" />
          <span className={`flex-1 truncate ${value ? "font-medium" : "text-slate-400"}`}>{value ? formatDay(value) : placeholder}</span>
        </button>
        {allowClear && value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear date"
            className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
      {open ? (
        <div role="dialog" aria-label="Choose a date" className={`${popoverClass} left-0`}>
          <div className="mb-1 flex items-center justify-between">
            <NavButton dir="prev" onClick={() => setMonth(addMonths(month, -1))} />
            <NavButton dir="next" onClick={() => setMonth(addMonths(month, 1))} disabled={Boolean(maxDay && addMonths(month, 1) > monthKey(maxDay))} />
          </div>
          <div className="-mt-9">
            <MonthGrid month={month} selectedStart={value || null} onPick={pick} min={min} max={maxDay} today={today} />
          </div>
          {quick.length ? (
            <div className="mt-2 flex gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
              {quick.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => pick(q.day)}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                >
                  {q.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------- Date range (whole days) ----------

/** Inclusive whole-day range: from the start of `from` to the end of `to`. */
export interface DateRange {
  from: string; // "YYYY-MM-DD"
  to: string;
}

function rangeLabel(range: DateRange) {
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  if (range.from === range.to) return formatDay(range.from);
  return `${formatDay(range.from, !sameYear)}  →  ${formatDay(range.to, true)}`;
}

function dayCount(range: { from: Ymd; to: Ymd }) {
  return Math.round((fromYmd(range.to).getTime() - fromYmd(range.from).getTime()) / 86_400_000) + 1;
}

export function DateRangePicker({ value, onChange, maxToday = true }: { value: DateRange; onChange: (range: DateRange) => void; maxToday?: boolean }) {
  const now = useNow(60_000);
  const today = toYmd(new Date(now));
  const maxDay = maxToday ? today : undefined;
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<Ymd | null>(null);
  const [end, setEnd] = useState<Ymd | null>(null);
  const [hover, setHover] = useState<Ymd | null>(null);
  const [month, setMonth] = useState(() => addMonths(monthKey(toYmd(new Date())), -1));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), [setOpen]);
  useDismiss(open, close, rootRef, triggerRef);

  function toggle() {
    if (!open) {
      // Start from the current value each time the picker opens.
      setStart(value.from || null);
      setEnd(value.to || null);
      setMonth(addMonths(monthKey(value.to || today), -1));
    }
    setOpen(!open);
  }

  function pick(day: Ymd) {
    if (!start || end || day < start) {
      setStart(day);
      setEnd(null);
    } else {
      setEnd(day);
    }
  }

  function preset(from: Ymd, to: Ymd) {
    onChange({ from, to });
    setOpen(false);
  }

  const firstOfMonth = `${monthKey(today)}-01`;
  const presets = [
    { label: "Today", run: () => preset(today, today) },
    { label: "Yesterday", run: () => preset(addDays(today, -1), addDays(today, -1)) },
    { label: "Last 3 days", run: () => preset(addDays(today, -2), today) },
    { label: "Last 7 days", run: () => preset(addDays(today, -6), today) },
    { label: "Last 14 days", run: () => preset(addDays(today, -13), today) },
    { label: "This month", run: () => preset(firstOfMonth, today) },
    { label: "Last month", run: () => preset(`${addMonths(monthKey(today), -1)}-01`, addDays(firstOfMonth, -1)) },
  ];

  return (
    <div ref={rootRef} className="relative">
      <button ref={triggerRef} type="button" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} className={`${triggerClass} sm:w-auto`}>
        <CalendarDays size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className={`truncate ${value.from ? "font-semibold" : "text-slate-400"}`}>{value.from && value.to ? rangeLabel(value) : "Pick dates"}</span>
      </button>
      {open ? (
        <div role="dialog" aria-label="Choose a date range" className={`${popoverClass} left-0 w-[min(44rem,calc(100vw-3.5rem))] lg:left-auto lg:right-0`}>
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* Presets */}
            <ul className="flex shrink-0 gap-1 overflow-x-auto pb-1 sm:w-32 sm:flex-col sm:overflow-visible sm:border-r sm:border-slate-100 sm:pb-0 sm:pr-3 dark:sm:border-slate-800">
              {presets.map((p) => (
                <li key={p.label}>
                  <button
                    type="button"
                    onClick={p.run}
                    className="w-full whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-300 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                  >
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>

            <div className="min-w-0 flex-1">
              {/* Two months on wide screens, one on phones */}
              <div className="relative flex justify-center gap-5">
                <div className="absolute inset-x-0 top-0 flex justify-between">
                  <NavButton dir="prev" onClick={() => setMonth(addMonths(month, -1))} />
                  <NavButton dir="next" onClick={() => setMonth(addMonths(month, 1))} disabled={Boolean(maxDay && addMonths(month, 1) >= monthKey(maxDay))} />
                </div>
                {/* Phones show only the later month (where the range usually ends). */}
                <div className="hidden pt-1 md:block">
                  <MonthGrid month={month} selectedStart={start} selectedEnd={end} hover={hover} onHover={setHover} onPick={pick} max={maxDay} today={today} />
                </div>
                <div className="pt-1">
                  <MonthGrid month={addMonths(month, 1)} selectedStart={start} selectedEnd={end} hover={hover} onHover={setHover} onPick={pick} max={maxDay} today={today} />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {!start ? (
                    "Click a start day."
                  ) : !end ? (
                    <>
                      <b className="text-slate-700 dark:text-slate-200">{formatDay(start, false)}</b> → click an end day, or Apply for one day.
                    </>
                  ) : (
                    <>
                      <b className="text-slate-700 dark:text-slate-200">
                        {formatDay(start, false)} → {formatDay(end, false)}
                      </b>{" "}
                      · {dayCount({ from: start, to: end })} {dayCount({ from: start, to: end }) === 1 ? "day" : "days"}
                    </>
                  )}
                </p>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!start}
                    onClick={() => start && preset(start, end ?? start)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
