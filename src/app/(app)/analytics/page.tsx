"use client";

// PAGE: Analytics — one pot over a period: summary numbers, soil moisture
// against its target band, waterings, garden weather and an activity log.
// Export downloads the raw rows as Excel.
import { useState } from "react";
import useSWR from "swr";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  CloudSun,
  Download,
  Droplets,
  Gauge,
  Hand,
  History,
  Loader2,
  PowerOff,
  Sparkles,
  Target,
  Timer,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PotPicker, type PickerPot } from "@/components/PotPicker";
import { timeAgo } from "@/components/device-ui";
import { useFeedback } from "@/components/Feedback";
import { DateRangePicker } from "@/components/DatePicker";

type Range = "24h" | "7d" | "30d" | "custom";

interface Overview {
  pot: {
    id: string;
    number: number;
    label: string;
    irrigationMode: "AUTO" | "MANUAL";
    pumpState: string;
    moistureOnThreshold: number;
    moistureOffThreshold: number;
    garden: { id: string; name: string };
    plant: { commonName: string } | null;
  };
  range: { start: string; end: string; bucketSeconds: number; daily: boolean };
  summary: {
    readings: number;
    avg: number | null;
    min: number | null;
    max: number | null;
    inBandPct: number | null;
    lastValue: number | null;
    lastReadingAt: string | null;
    waterings: number;
    pumpSeconds: number;
  };
  moisture: { t: string; avg: number | null; min: number | null; max: number | null }[];
  waterings: { t: string; count: number; seconds: number }[];
  weather: { t: string; temperature: number | null; humidity: number | null; rainProbability: number | null }[];
  events: { id: string; t: string; mode: string; kind: "on" | "off" | "mode" | "other"; title: string; detail: string }[];
}

const RANGES: { value: Range; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "custom", label: "Custom" },
];

// Chart colours: one series per chart, so one hue each; ink stays neutral.
const MOISTURE = "#0284c7"; // sky-600
const WATERING = "#0284c7";
const TEMPERATURE = "#ea580c"; // orange-600
const HUMIDITY = "#0d9488"; // teal-600
const BAND = "#10b981"; // emerald-500 (target band, low opacity)

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return seconds % 60 ? `${minutes}m ${seconds % 60}s` : `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function AnalyticsPage() {
  const { toast } = useFeedback();
  const { data: pots } = useSWR<PickerPot[]>("/api/pots");
  const [chosenPotId, setChosenPotId] = useState("");
  const sortedPots = [...(pots ?? [])].sort((a, b) => a.number - b.number);
  const pot = sortedPots.find((p) => p.id === chosenPotId) ?? sortedPots[0];
  const [range, setRange] = useState<Range>("24h");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const customError = range !== "custom" ? "" : !from || !to ? "Pick the dates." : from > to ? "The end day must be after the start day." : "";
  // Whole days: from the start of the first day to the end of the last.
  const params = pot
    ? new URLSearchParams({ gardenId: pot.gardenId, potId: pot.id, range, ...(range === "custom" ? { from: `${from}T00:00`, to: `${to}T23:59:59` } : {}) }).toString()
    : "";
  const { data, error, isLoading } = useSWR<Overview>(pot && !customError ? `/api/analytics/pot?${params}` : null, {
    refreshInterval: range === "24h" ? 30000 : 0,
    keepPreviousData: true,
  });

  async function exportExcel() {
    if (!pot || customError) return;
    setExporting(true);
    try {
      const response = await fetch(`/api/export/pot-analytics?${params}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Couldn't create the Excel file.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${pot.label}-${range}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Excel file downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the Excel file.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Analytics"
        subtitle="How a pot's soil, watering and weather changed over time."
        action={
          <button
            type="button"
            onClick={exportExcel}
            disabled={!pot || Boolean(customError) || exporting}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Export Excel
          </button>
        }
      />

      {/* Filters: one row above everything */}
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center">
        {pots ? (
          pots.length ? (
            <PotPicker pots={pots} value={pot?.id ?? ""} onChange={(p) => setChosenPotId(p.id)} className="w-full lg:w-80" />
          ) : (
            <p className="text-sm text-slate-500">No pots yet — add one to see analytics.</p>
          )
        ) : (
          <div className="h-[3.4rem] w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800 lg:w-80" />
        )}
        <div role="radiogroup" aria-label="Period" className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
          {RANGES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={range === option.value}
              onClick={() => {
                // Custom starts as the last 3 days, ready to adjust.
                if (option.value === "custom" && (!from || !to)) {
                  const end = new Date();
                  const start = new Date(end);
                  start.setDate(start.getDate() - 2);
                  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  setFrom(day(start));
                  setTo(day(end));
                }
                setRange(option.value);
              }}
              className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-semibold transition sm:px-3 lg:flex-none ${
                range === option.value
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {range === "custom" ? (
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker
              value={{ from, to }}
              onChange={(next) => {
                setFrom(next.from);
                setTo(next.to);
              }}
            />
            {customError ? <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{customError}</span> : null}
          </div>
        ) : null}
        {isLoading && data ? <Loader2 size={16} className="animate-spin text-slate-400 lg:ml-auto" aria-label="Updating" /> : null}
      </div>

      {!pot ? null : customError ? (
        <EmptyPanel icon={Timer} text="Pick a start and end date to see this period." />
      ) : error ? (
        <EmptyPanel icon={TrendingDown} text={error.message || "Couldn't load analytics."} />
      ) : !data ? (
        <Skeleton />
      ) : (
        <Dashboard data={data} />
      )}
    </div>
  );
}

function Dashboard({ data }: { data: Overview }) {
  const { summary, pot, range } = data;
  const on = pot.moistureOnThreshold;
  const off = pot.moistureOffThreshold;
  const hasMoisture = summary.readings > 0;
  const tick = (iso: string) => {
    const d = new Date(iso);
    return range.daily || range.bucketSeconds >= 3600
      ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
      : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };
  // Multi-day periods: one tick per day (the first bucket of each day), not repeated dates.
  const dayOf = (iso: string) => new Date(iso).toDateString();
  const dayTicks = range.daily || range.bucketSeconds >= 3600 ? data.moisture.filter((p, i) => i === 0 || dayOf(p.t) !== dayOf(data.moisture[i - 1].t)).map((p) => p.t) : undefined;
  const fullTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Gauge} label="Now" value={summary.lastValue != null ? `${summary.lastValue}%` : "--"} hint={summary.lastReadingAt ? timeAgo(summary.lastReadingAt) : "No reading yet"} />
        <Stat icon={BarChart3} label="Average" value={summary.avg != null ? `${summary.avg}%` : "--"} hint={`${summary.readings.toLocaleString()} readings`} />
        <Stat icon={TrendingDown} label="Lowest – highest" value={summary.min != null ? `${summary.min}–${summary.max}%` : "--"} hint="In this period" />
        <Stat
          icon={Target}
          label="Time in target"
          value={summary.inBandPct != null ? `${summary.inBandPct}%` : "--"}
          hint={`Target ${on}–${off}%`}
          tone={summary.inBandPct == null ? undefined : summary.inBandPct >= 70 ? "good" : summary.inBandPct >= 40 ? "warn" : "bad"}
        />
        <Stat icon={Droplets} label="Waterings" value={String(summary.waterings)} hint={pot.irrigationMode === "AUTO" ? "Automatic mode" : "Manual mode"} />
        <Stat icon={Timer} label="Pump time" value={formatDuration(summary.pumpSeconds)} hint="Total running time" />
      </div>

      {/* Soil moisture */}
      <ChartCard
        title="Soil moisture"
        subtitle={`${pot.label} · ${pot.plant?.commonName ?? "No plant"} · ${pot.garden.name}`}
        legend={
          <span className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: MOISTURE }} />
              Average
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm" style={{ background: MOISTURE, opacity: 0.18 }} />
              Low–high
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm" style={{ background: BAND, opacity: 0.25 }} />
              Target {on}–{off}%
            </span>
          </span>
        }
      >
        {hasMoisture ? (
          <ChartFrame height={260}>
            <ComposedChart data={data.moisture.map((p) => ({ ...p, range: p.min != null ? [p.min, p.max] : null }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <ReferenceArea y1={on} y2={off} fill={BAND} fillOpacity={0.12} ifOverflow="extendDomain" />
              <XAxis dataKey="t" ticks={dayTicks} tickFormatter={tick} tick={{ fontSize: 11, fill: "var(--chart-ink)" }} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "var(--chart-ink)" }} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                cursor={{ stroke: "var(--chart-ink)", strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  const point = active ? (payload?.[0]?.payload as Overview["moisture"][number] | undefined) : undefined;
                  if (!point) return null;
                  const status = point.avg == null ? null : point.avg < on ? "Too dry" : point.avg > off ? "Very wet" : "In target";
                  return (
                    <TooltipBox title={fullTime(point.t)}>
                      {point.avg == null ? (
                        <p className="text-slate-500 dark:text-slate-400">No readings</p>
                      ) : (
                        <>
                          <p className="font-bold">{point.avg}% average</p>
                          <p className="text-slate-500 dark:text-slate-400">
                            Low {point.min}% · High {point.max}%
                          </p>
                          <p className="mt-0.5 text-slate-500 dark:text-slate-400">{status}</p>
                        </>
                      )}
                    </TooltipBox>
                  );
                }}
              />
              <Area type="monotone" dataKey="range" stroke="none" fill={MOISTURE} fillOpacity={0.15} connectNulls={false} isAnimationActive={false} />
              <Line
                type="monotone"
                dataKey="avg"
                stroke={MOISTURE}
                strokeWidth={2}
                dot={(props: { cx?: number; cy?: number; index?: number }) => {
                  const i = props.index ?? 0;
                  const isolated = data.moisture[i]?.avg != null && data.moisture[i - 1]?.avg == null && data.moisture[i + 1]?.avg == null;
                  return isolated && props.cx != null && props.cy != null ? (
                    <circle key={i} cx={props.cx} cy={props.cy} r={4} fill={MOISTURE} stroke="var(--chart-surface)" strokeWidth={2} />
                  ) : (
                    <g key={i} />
                  );
                }} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--chart-surface)" }} connectNulls={false} isAnimationActive={false} />
            </ComposedChart>
          </ChartFrame>
        ) : (
          <NoData text="No soil readings in this period. Connect a sensor to this pot, or pick a longer period." />
        )}
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Waterings */}
        <ChartCard title={range.daily ? "Waterings per day" : "Waterings per hour"} subtitle={`${summary.waterings} in this period · ${formatDuration(summary.pumpSeconds)} pump time`}>
          {summary.waterings ? (
            <ChartFrame height={200}>
              <BarChart data={data.waterings} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="t"
                  tickFormatter={(iso) =>
                    range.daily
                      ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                      : new Date(iso).toLocaleTimeString([], { hour: "numeric" })
                  }
                  tick={{ fontSize: 11, fill: "var(--chart-ink)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--chart-ink)" }} tickLine={false} axisLine={false} width={32} />
                <Tooltip
                  cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }}
                  content={({ active, payload }) => {
                    const point = active ? (payload?.[0]?.payload as Overview["waterings"][number] | undefined) : undefined;
                    if (!point) return null;
                    return (
                      <TooltipBox
                        title={
                          range.daily
                            ? new Date(point.t).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
                            : `${new Date(point.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} hour`
                        }
                      >
                        <p className="font-bold">
                          {point.count} {point.count === 1 ? "watering" : "waterings"}
                        </p>
                        {point.seconds ? <p className="text-slate-500 dark:text-slate-400">Pump ran {formatDuration(point.seconds)}</p> : null}
                      </TooltipBox>
                    );
                  }}
                />
                <Bar dataKey="count" fill={WATERING} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ChartFrame>
          ) : (
            <NoData text="The pump didn't run in this period." />
          )}
        </ChartCard>

        {/* Weather: two small charts, never one chart with two axes */}
        <ChartCard title="Garden weather" subtitle={pot.garden.name}>
          {data.weather.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <MiniLine data={data.weather} dataKey="temperature" color={TEMPERATURE} label="Temperature" unit="°C" tick={tick} fullTime={fullTime} />
              <MiniLine data={data.weather} dataKey="humidity" color={HUMIDITY} label="Humidity" unit="%" tick={tick} fullTime={fullTime} />
            </div>
          ) : (
            <NoData icon={CloudSun} text="No weather saved for this garden in this period. Weather is saved when you open the garden's page." />
          )}
        </ChartCard>
      </div>

      <ActivityLog events={data.events} fullTime={fullTime} />
    </div>
  );
}

// ---------- Pieces ----------

function ChartFrame({ height, children }: { height: number; children: React.ReactElement }) {
  return (
    <div
      className="w-full min-w-0 [--chart-grid:#e2e8f0] [--chart-ink:#64748b] [--chart-surface:#ffffff] dark:[--chart-grid:#1e293b] dark:[--chart-ink:#94a3b8] dark:[--chart-surface:#0f172a]"
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 1, height }}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function MiniLine({
  data,
  dataKey,
  color,
  label,
  unit,
  tick,
  fullTime,
}: {
  data: Overview["weather"];
  dataKey: "temperature" | "humidity";
  color: string;
  label: string;
  unit: string;
  tick: (iso: string) => string;
  fullTime: (iso: string) => string;
}) {
  const values = data.map((d) => d[dataKey]).filter((v): v is number => v != null);
  const latest = values[values.length - 1];
  return (
    <div>
      <p className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-base font-black">{latest != null ? `${Math.round(latest)}${unit}` : "--"}</span>
      </p>
      <ChartFrame height={150}>
        <LineChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="t" tickFormatter={tick} tick={{ fontSize: 10, fill: "var(--chart-ink)" }} tickLine={false} axisLine={false} minTickGap={32} />
          <YAxis tick={{ fontSize: 10, fill: "var(--chart-ink)" }} tickFormatter={(v) => String(Math.round(v))} tickLine={false} axisLine={false} width={32} domain={["auto", "auto"]} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: "var(--chart-ink)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const point = active ? (payload?.[0]?.payload as Overview["weather"][number] | undefined) : undefined;
              if (!point || point[dataKey] == null) return null;
              return (
                <TooltipBox title={fullTime(point.t)}>
                  <p className="font-bold">
                    {label} {Math.round(point[dataKey]!)}
                    {unit}
                  </p>
                </TooltipBox>
              );
            }}
          />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--chart-surface)" }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ChartFrame>
    </div>
  );
}

function TooltipBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-0.5 text-[11px] font-semibold text-slate-400">{title}</p>
      {children}
    </div>
  );
}

function ChartCard({ title, subtitle, legend, children }: { title: string; subtitle?: string; legend?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-bold">{title}</h2>
          {subtitle ? <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
        {legend}
      </div>
      {children}
    </section>
  );
}

const STAT_TONE = {
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-rose-600 dark:text-rose-400",
};

function Stat({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: string; hint: string; tone?: keyof typeof STAT_TONE }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <Icon size={13} />
        {label}
      </p>
      <p className={`mt-1 text-xl font-black tabular-nums ${tone ? STAT_TONE[tone] : ""}`}>{value}</p>
      <p className="truncate text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

function ActivityLog({ events, fullTime }: { events: Overview["events"]; fullTime: (iso: string) => string }) {
  const [shown, setShown] = useState(10);
  const icons = { on: Droplets, off: PowerOff, mode: Sparkles, other: History };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div>
          <h2 className="font-bold">Activity</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Pump starts, stops and mode changes in this period.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{events.length}</span>
      </div>
      {events.length === 0 ? (
        <NoData text="No activity in this period." />
      ) : (
        <>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {events.slice(0, shown).map((event) => {
              const Icon = event.kind === "mode" && event.title.includes("manual") ? Hand : icons[event.kind];
              return (
                <li key={event.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                      event.kind === "on"
                        ? "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
                        : event.kind === "mode"
                          ? "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{event.title}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{event.detail}</p>
                  </div>
                  <span className="hidden rounded bg-slate-100 px-1.5 py-px text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400 sm:inline">
                    {event.mode === "manual" ? "Manual" : "Auto"}
                  </span>
                  <time dateTime={event.t} className="w-32 shrink-0 text-right text-xs tabular-nums text-slate-400">
                    {fullTime(event.t)}
                  </time>
                </li>
              );
            })}
          </ul>
          {events.length > shown ? (
            <div className="border-t border-slate-100 p-3 text-center dark:border-slate-800">
              <button type="button" onClick={() => setShown((n) => n + 20)} className="text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                Show more ({events.length - shown} left)
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}


function NoData({ text, icon: Icon = BarChart3 }: { text: string; icon?: LucideIcon }) {
  return (
    <div className="grid place-items-center px-5 py-10 text-center">
      <Icon size={22} className="text-slate-300 dark:text-slate-600" />
      <p className="mt-2 max-w-sm text-sm text-slate-400">{text}</p>
    </div>
  );
}

function EmptyPanel({ icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <NoData icon={icon} text={text} />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-[5.5rem] animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
    </div>
  );
}
