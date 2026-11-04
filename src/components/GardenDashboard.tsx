"use client";

// Garden overview (stats, alerts, weather, devices, pots, activity). Used by
// the main Dashboard for the selected garden.

import type { ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, CloudRain, Droplets, Radio, Wind } from "lucide-react";
import { SeriesChart } from "@/components/SeriesChart";
import { Badge, Card, PageHeader, StatTile, severityTone } from "@/components/ui";

interface DashboardData {
  garden: { id: string; name: string; location: string | null; type: string };
  weather: { current: { temp: number; humidity: number; rainProb: number; windSpeed: number; description: string }; forecast: { day: string; high: number; low: number }[]; isStale: boolean } | null;
  weatherUnavailable: boolean;
  devices: { id: string; name: string; type: string; status: string; lastSeenAt: string | null }[];
  pots: { id: string; label: string; irrigationMode: string; pumpState: string; moistureOnThreshold: number; plant: { id: string; commonName: string; healthStatus: string } | null; currentMoisture: number | null; moistureHistory: { value: number; recordedAt: string }[]; irrigationDecision: { reason: string; startedAt: string } | null }[];
  pumpHistory: { id: string; potId: string | null; mode: string; status: string; reason: string | null; startedAt: string }[];
  diseaseHistory: { id: string; potId: string; plantId: string; predictedDisease: string; className: string | null; confidence: number; createdAt: string }[];
  alerts: { id: string; severity: string; title: string; message: string; potId?: string; plantId?: string }[];
}

const RECENT_PUMP_EVENTS = 6;
const RECENT_DISEASE_RECORDS = 4;

export function GardenDashboard({ gardenId, backHref = "/gardens", backLabel = "Back to gardens", headerTitle, headerAction }: { gardenId: string; backHref?: string; backLabel?: string; headerTitle?: string; headerAction?: ReactNode }) {
  const { data, error, mutate } = useSWR<DashboardData>(gardenId ? `/api/gardens/${gardenId}/dashboard` : null, { refreshInterval: 5000 });

  if (error) return <Card><p className="font-bold text-rose-600">Unable to load this garden dashboard.</p><button type="button" onClick={() => mutate()} className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Try again</button></Card>;
  if (!data) return <DashboardLoading />;

  const online = data.devices.filter((device) => device.status === "ONLINE").length;
  const pumpsOn = data.pots.filter((pot) => pot.pumpState === "on").length;
  const action = headerAction ?? <Link href={backHref} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40">{backLabel}</Link>;

  return <div className="min-w-0">
    <PageHeader title={headerTitle ?? data.garden.name} subtitle={`${data.garden.location || "No location label"} · ${data.garden.type} garden`} action={action} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile label="Pots" value={data.pots.length} icon={<Droplets size={18} />} tone="sky" />
      <StatTile label="Devices online" value={online} unit={`/ ${data.devices.length}`} icon={<Radio size={18} />} tone="emerald" />
      <StatTile label="Pumps running" value={pumpsOn} unit={`/ ${data.pots.length}`} icon={<Droplets size={18} />} tone={pumpsOn ? "emerald" : "slate"} />
      <StatTile label="Open alerts" value={data.alerts.length} icon={<AlertTriangle size={18} />} tone={data.alerts.length ? "amber" : "slate"} />
    </div>

    <div className="mt-6 grid items-start gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2"><h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Garden alerts</h2><div className="mt-3 space-y-2">{data.alerts.map((alert) => <div key={alert.id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800"><div className="flex flex-wrap items-center gap-2"><Badge tone={severityTone(alert.severity)}>{alert.severity}</Badge><p className="min-w-0 break-words text-sm font-bold">{alert.title}</p></div><p className="mt-1 break-words text-xs text-slate-500">{alert.message}</p></div>)}{data.alerts.length === 0 ? <p className="py-2 text-sm text-slate-400">No active alerts from current garden data.</p> : null}</div></Card>
      <WeatherCard weather={data.weather} unavailable={data.weatherUnavailable} />
    </div>

    <section className="mt-6" aria-labelledby="devices-heading"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 id="devices-heading" className="text-lg font-black">Devices</h2><p className="text-sm text-slate-500">Connection status for this garden&apos;s registered hardware.</p></div><Link href="/gardens" className="text-sm font-bold text-emerald-700 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-emerald-300">Manage gardens</Link></div><div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.devices.map((device) => <DeviceCard key={device.id} device={device} />)}{data.devices.length === 0 ? <Card><p className="text-sm font-bold">No devices in this garden.</p><p className="mt-1 text-sm text-slate-500">Register a device from the garden management workspace.</p></Card> : null}</div></section>

    <section className="mt-6" aria-labelledby="pots-heading"><div className="mb-3"><h2 id="pots-heading" className="text-lg font-black">Pots and sensor history</h2><p className="text-sm text-slate-500">Latest moisture readings and irrigation state by pot.</p></div><div className="grid gap-4 lg:grid-cols-2">{data.pots.map((pot) => <Card key={pot.id}><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-black">{pot.label}</h3><p className="break-words text-sm text-slate-500">{pot.plant?.commonName ?? "Empty pot"}</p></div><div className="flex flex-wrap gap-2"><Badge tone={pot.pumpState === "on" ? "emerald" : "slate"}>Pump {pot.pumpState}</Badge><Badge tone="sky">{pot.irrigationMode}</Badge></div></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><p>Soil moisture: <b>{pot.currentMoisture == null ? "No reading" : `${pot.currentMoisture}%`}</b></p><p>Threshold: <b>{pot.moistureOnThreshold}%</b></p><p className="col-span-2">Plant health: <b>{pot.plant?.healthStatus ?? "No plant"}</b></p></div>{pot.irrigationDecision ? <p className="mt-3 break-words rounded-lg bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-100"><b>Auto decision:</b> {irrigationDecisionMessage(pot.irrigationDecision.reason)}</p> : null}<div className="mt-3"><p className="text-xs font-bold uppercase text-slate-400">Soil moisture history</p><SeriesChart data={pot.moistureHistory} color="#0ea5e9" unit="%" /></div></Card>)}{data.pots.length === 0 ? <Card><p className="text-sm text-slate-400">No pots in this garden.</p></Card> : null}</div></section>

    <section className="mt-6" aria-labelledby="activity-heading"><div className="mb-3"><h2 id="activity-heading" className="text-lg font-black">Recent activity</h2><p className="text-sm text-slate-500">A compact view of the latest irrigation and disease detection records.</p></div><div className="grid items-start gap-4 xl:grid-cols-3"><HistoryCard className="xl:col-span-2" title="Pump and irrigation" empty="No pump events yet." actionHref="/irrigation" actionLabel="View irrigation" isEmpty={data.pumpHistory.length === 0}><div className="divide-y divide-slate-100 dark:divide-slate-800">{data.pumpHistory.slice(0, RECENT_PUMP_EVENTS).map((event) => <ActivityRow key={event.id} primary={`${data.pots.find((pot) => pot.id === event.potId)?.label ?? "Garden"} · Pump ${event.status}`} secondary={`${event.mode} · ${formatTimestamp(event.startedAt)}${event.reason ? ` · ${event.reason}` : ""}`} badge={event.status} tone={event.status === "on" ? "emerald" : "slate"} />)}</div></HistoryCard><HistoryCard title="Disease detection" empty="No AI predictions yet." actionHref="/disease-detection" actionLabel="Open Disease AI" isEmpty={data.diseaseHistory.length === 0}><div className="divide-y divide-slate-100 dark:divide-slate-800">{data.diseaseHistory.slice(0, RECENT_DISEASE_RECORDS).map((prediction) => <ActivityRow key={prediction.id} primary={prediction.className ?? prediction.predictedDisease} secondary={`${data.pots.find((pot) => pot.id === prediction.potId)?.label ?? "Plant"} · ${formatTimestamp(prediction.createdAt)}`} badge={`${Math.round(prediction.confidence * 100)}%`} tone="violet" />)}</div></HistoryCard></div></section>
  </div>;
}

function DashboardLoading() { return <div aria-live="polite"><PageHeader title="Dashboard" subtitle="Loading your garden overview…" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Card key={index} className="h-28 animate-pulse bg-slate-100 dark:bg-slate-900"><span className="sr-only">Loading dashboard card</span></Card>)}</div></div>; }
function WeatherCard({ weather, unavailable }: { weather: DashboardData["weather"]; unavailable: boolean }) { return <Card><h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Weather</h2>{weather ? <div className="mt-3"><p className="text-3xl font-black">{weather.current.temp}°C</p><p className="text-sm text-slate-500">{weather.current.description}</p><p className="mt-2 flex flex-wrap gap-3 text-xs font-bold text-slate-500"><span><CloudRain className="mr-1 inline" size={14} />{weather.current.rainProb}%</span><span>Humidity {weather.current.humidity}%</span><span><Wind className="mr-1 inline" size={14} />{weather.current.windSpeed} km/h</span></p><p className="mt-2 text-xs text-slate-500">{weather.forecast.map((day) => `${day.day} ${day.high}°/${day.low}°`).join(" · ")}{weather.isStale ? " · last known" : ""}</p></div> : <p className="mt-3 text-sm text-slate-400">{unavailable ? "Weather is temporarily unavailable." : "Set garden coordinates to enable weather."}</p>}</Card>; }
function DeviceCard({ device }: { device: DashboardData["devices"][number] }) { const tone = device.status === "ONLINE" ? "emerald" : device.status === "STALE" ? "amber" : device.status === "OFFLINE" ? "rose" : "slate"; return <Card><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-black">{device.name}</h3><p className="mt-1 break-all text-xs text-slate-500">{device.type}</p></div><Badge tone={tone}>{device.status.replace("_", " ")}</Badge></div><p className="mt-4 text-sm text-slate-500"><span className="font-bold text-slate-700 dark:text-slate-200">Last seen:</span> {device.lastSeenAt ? formatTimestamp(device.lastSeenAt) : "Never"}</p></Card>; }
function HistoryCard({ title, empty, actionHref, actionLabel, className = "", children, isEmpty }: { title: string; empty: string; actionHref: string; actionLabel: string; className?: string; children: ReactNode; isEmpty: boolean }) { return <Card className={className}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-black uppercase tracking-wide text-slate-500">{title}</h2><Link href={actionHref} className="text-xs font-bold text-emerald-700 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-emerald-300">{actionLabel}</Link></div><div className="mt-3">{isEmpty ? <p className="py-2 text-sm text-slate-400">{empty}</p> : children}</div></Card>; }
function ActivityRow({ primary, secondary, badge, tone }: { primary: string; secondary: string; badge: string; tone: "emerald" | "slate" | "violet" }) { return <div className="flex flex-col items-start gap-2 py-3 sm:flex-row sm:justify-between sm:gap-3"><div className="min-w-0"><p className="break-words text-sm font-bold">{primary}</p><p className="break-words text-xs text-slate-500">{secondary}</p></div><Badge tone={tone}>{badge}</Badge></div>; }
function formatTimestamp(value: string) { return new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(value)); }
function irrigationDecisionMessage(reason: string) { const messages: Record<string, string> = { SOIL_DRY: "Soil is dry; irrigation is running.", RAIN_EXPECTED: "Irrigation remains off because significant rain is expected.", SOIL_DRY_BUT_RAIN_EXPECTED: "Auto irrigation delayed because significant rain is expected.", SOIL_MOISTURE_NORMAL: "Soil moisture is normal; the configured pump state is maintained." }; return messages[reason] ?? reason; }
