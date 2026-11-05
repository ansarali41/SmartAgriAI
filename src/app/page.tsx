// PAGE: Public home page. Describes what SmartAgri actually does today — a
// soil sensor per pot, automatic watering, phone alerts, a leaf doctor with
// home remedies — using previews built from the app's own design language.
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  Cpu,
  Droplets,
  Flower2,
  Leaf,
  ListChecks,
  Plug,
  Power,
  ScanSearch,
  Send,
  ShieldCheck,
  Smartphone,
  Sprout,
  Sun,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { LandingNavigation } from "@/components/LandingNavigation";
import { PLANT_CATALOG } from "@/lib/plant-catalog";

const PLANT_CHIPS = [
  "Tulsi",
  "Money plant",
  "Chili · Morich",
  "Tomato",
  "Pui shak",
  "Aloe vera",
  "Hibiscus · Joba",
  "Rose · Golap",
  "Lemon · Lebu",
  "Bottle gourd · Lau",
  "Snake plant",
  "Mint · Pudina",
  "Marigold · Gada",
  "Curry leaf",
  "Dragon fruit",
  "Peace lily",
];

export default async function LandingPage() {
  const session = await auth();
  const signedIn = Boolean(session?.user);
  const primaryHref = signedIn ? "/dashboard" : "/register";
  const primaryLabel = signedIn ? "Open dashboard" : "Start for free";

  return (
    <div className="min-h-screen overflow-x-clip bg-[#f7faf7] text-slate-950 dark:bg-slate-950 dark:text-white">
      <LandingNavigation signedIn={signedIn} />

      <main>
        {/* ---------- Hero ---------- */}
        <section className="relative isolate">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle_at_75%_20%,rgba(52,211,153,.22),transparent_26rem),radial-gradient(circle_at_10%_0%,rgba(56,189,248,.14),transparent_24rem)] dark:bg-[radial-gradient(circle_at_75%_20%,rgba(16,185,129,.18),transparent_26rem),radial-gradient(circle_at_10%_0%,rgba(14,165,233,.10),transparent_24rem)]"
          />
          <div className="mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:pb-28 lg:pt-16">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm backdrop-blur dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                <Sprout size={13} aria-hidden="true" />
                For balconies, rooftops, greenhouses &amp; farms
              </p>
              <h1 className="mt-6 text-4xl font-black leading-[1.05] tracking-[-0.04em] sm:text-5xl lg:text-[3.6rem]">
                Your plants, watered <span className="text-emerald-600 dark:text-emerald-400">exactly when they need it.</span>
              </h1>
              <p className="mt-6 text-lg leading-8 text-slate-600 dark:text-slate-300">
                A small soil sensor in each pot tells SmartAgri when the soil is getting dry. The pump waters it, stops at the right level, and
                your phone gets an alert — even when you&apos;re away.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={primaryHref}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                >
                  {primaryLabel}
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white/80 px-6 text-sm font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:text-emerald-300"
                >
                  See how it works
                </a>
              </div>
              <ul className="mt-8 grid gap-2.5 text-sm font-medium text-slate-600 sm:grid-cols-2 dark:text-slate-300">
                {["No coding — set up from your phone", "Pump switches off if Wi-Fi drops", "Alerts in the app and on Telegram", `${PLANT_CATALOG.length} plants with Bangla names`].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      <Check size={12} strokeWidth={3} aria-hidden="true" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <HeroPreview />
          </div>
        </section>

        {/* ---------- Plants strip ---------- */}
        <section aria-label="Plants SmartAgri knows" className="border-y border-slate-200 bg-white py-8 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 sm:px-8 lg:flex-row lg:items-center lg:gap-8">
            <p className="shrink-0 text-sm font-bold text-slate-500 dark:text-slate-400">
              Knows the right soil &amp; water for <span className="text-slate-950 dark:text-white">{PLANT_CATALOG.length} plants</span>, including
            </p>
            <ul className="flex flex-wrap gap-2">
              {PLANT_CHIPS.map((plant) => (
                <li
                  key={plant}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                >
                  <Sprout size={12} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  {plant}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- Features ---------- */}
        <section id="features" className="scroll-mt-6 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <SectionIntro
              eyebrow="What it does"
              title="Everything a busy plant parent forgets — handled."
              text="Each pot gets its own watering levels, its own sensor and its own history. You check in when you want to, not because you have to."
            />
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                className="lg:col-span-2"
                icon={Droplets}
                tone="sky"
                title="Automatic watering, per pot"
                text="Pick the plant and SmartAgri suggests its watering band — say 40–70% for tomato. The pump starts below the first number and stops at the second. Switch any pot to manual whenever you like."
              >
                <WateringMock />
              </FeatureCard>
              <FeatureCard
                icon={Cpu}
                tone="emerald"
                title="Live soil readings"
                text="The sensor reports every few seconds. A dead probe or a loose wire shows up as a clear warning instead of a wrong number."
              />
              <FeatureCard
                icon={ScanSearch}
                tone="violet"
                title="Leaf doctor"
                text="Photograph a sick leaf. You get the likely problem, what to do today, and home remedies you can make — neem spray, baking soda, garlic-chilli."
              />
              <FeatureCard
                icon={Bell}
                tone="amber"
                title="Alerts that matter"
                text="Dry pot in manual mode, sensor offline, pump failed, disease found — in the app's bell and on your Telegram, at most once a day per problem."
              />
              <FeatureCard
                icon={BarChart3}
                tone="emerald"
                title="History & Excel export"
                text="See how each pot's moisture moved against its target, how often it was watered, and download everything to Excel."
              />
            </div>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how-it-works" className="scroll-mt-6 border-y border-slate-200 bg-white py-20 sm:py-24 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <SectionIntro eyebrow="How it works" title="Set up in an evening. No coding." text="If you can join a Wi-Fi network on your phone, you can set up SmartAgri." />
            <ol className="mt-12 grid gap-5 lg:grid-cols-3">
              {[
                {
                  icon: Flower2,
                  title: "Add your garden and pots",
                  text: "Create a garden — a balcony, rooftop, greenhouse or field plot — add a pot for each plant and choose the plant. Its soil type and watering levels are filled in for you.",
                },
                {
                  icon: Wifi,
                  title: "Plug in the sensor",
                  text: "Power the board, join the “SmartAgri-Setup” Wi-Fi from your phone and pick your home network. Then press the board's BOOT button to add it to your account.",
                },
                {
                  icon: Smartphone,
                  title: "Let it look after the plants",
                  text: "Connect the sensor to a pot and you're done. Watch moisture live, water by hand when you want, and get an alert if anything needs you.",
                },
              ].map((step, index) => (
                <li key={step.title} className="relative rounded-3xl border border-slate-200 bg-[#f7faf7] p-7 dark:border-slate-800 dark:bg-slate-950/60">
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
                      <step.icon size={20} aria-hidden="true" />
                    </span>
                    <span className="text-5xl font-black text-slate-200 dark:text-slate-800">{index + 1}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-black">{step.title}</h3>
                  <p className="mt-3 leading-7 text-slate-600 dark:text-slate-400">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- Hardware ---------- */}
        <section id="hardware" className="scroll-mt-6 py-20 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionIntro
                eyebrow="What you need"
                title="A few common parts per pot."
                text="All available from local electronics shops. One small board can look after one pot."
              />
              <div className="mt-8 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                <p>
                  <b>Safe by design:</b> if the board can&apos;t reach the app for a minute — Wi-Fi down, power cut at the router — it switches the
                  pump off by itself, so a pot never floods.
                </p>
              </div>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: Cpu, title: "ESP32 board", text: "The small Wi-Fi computer that runs everything." },
                { icon: Leaf, title: "Soil moisture probe", text: "Pushed into the pot's soil to measure how wet it is." },
                { icon: Power, title: "Relay module", text: "Lets the board switch the pump on and off safely." },
                { icon: Droplets, title: "Mini water pump & pipe", text: "Sits in a bucket or bottle and waters the pot." },
                { icon: Plug, title: "USB power", text: "A phone charger is enough for the board." },
                { icon: Wifi, title: "Home Wi-Fi", text: "2.4 GHz network the board can join." },
              ].map((part) => (
                <li key={part.title} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <part.icon size={18} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-bold">{part.title}</span>
                    <span className="block text-sm leading-6 text-slate-500 dark:text-slate-400">{part.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" className="scroll-mt-6 border-t border-slate-200 bg-white py-20 sm:py-24 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mx-auto max-w-3xl px-5 sm:px-8">
            <SectionIntro eyebrow="Questions" title="Good to know" text="" center />
            <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-[#f7faf7] dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/60">
              {FAQ.map((item) => (
                <details key={item.q} className="group px-5 py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-bold [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronDown size={18} className="shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="pb-5 leading-7 text-slate-600 dark:text-slate-400">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Final CTA ---------- */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="relative overflow-hidden rounded-[2rem] bg-emerald-950 px-6 py-14 text-center sm:px-12 sm:py-20">
              <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(52,211,153,.35),transparent_36rem)]" />
              <div className="relative">
                <Sprout size={34} className="mx-auto text-emerald-300" aria-hidden="true" />
                <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-black tracking-tight text-white sm:text-5xl">Never come home to a dry pot again.</h2>
                <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-emerald-50/80">
                  Start with your gardens and plants today — add the sensor whenever you&apos;re ready.
                </p>
                <Link
                  href={primaryHref}
                  className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-400 px-6 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200"
                >
                  {primaryLabel}
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 sm:px-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2 font-black">
              <Sprout size={19} className="text-emerald-600" aria-hidden="true" />
              SmartAgri
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">Automatic watering, plant care and alerts for gardens of every size.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-slate-600 dark:text-slate-300" aria-label="Footer navigation">
            <a href="#features" className="hover:text-emerald-600">Features</a>
            <a href="#how-it-works" className="hover:text-emerald-600">How it works</a>
            <a href="#hardware" className="hover:text-emerald-600">Hardware</a>
            <a href="#faq" className="hover:text-emerald-600">FAQ</a>
            <Link href={signedIn ? "/dashboard" : "/login"} className="hover:text-emerald-600">
              {signedIn ? "Dashboard" : "Sign in"}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

const FAQ = [
  {
    q: "Do I need to know programming?",
    a: "No. The board comes ready to run. You join its “SmartAgri-Setup” Wi-Fi from your phone, choose your home network, and press the BOOT button to add it to your account.",
  },
  {
    q: "What happens if the Wi-Fi or electricity goes off?",
    a: "If the board can't reach the app for about a minute, it turns the pump off by itself. When the connection comes back it carries on, and you get an alert that the sensor went offline and came back.",
  },
  {
    q: "Can I still water by hand?",
    a: "Yes. Switch a pot to Manual and use the Turn on / Turn off button, from anywhere. Switch back to Automatic whenever you like.",
  },
  {
    q: "Does it work for indoor plants?",
    a: "Yes — money plant, snake plant, peace lily, ZZ plant and more are in the plant guide with their own watering levels. Succulents and cacti get a much drier band than vegetables.",
  },
  {
    q: "How accurate is the leaf doctor?",
    a: "It was trained on crop leaves such as tomato, potato, chili, corn, grape and citrus, and tells you how sure it is. For other plants it says so and treats the result as a rough guide. The home remedies are safe for most plants.",
  },
  {
    q: "Can one account look after many gardens?",
    a: "Yes. Add as many gardens and pots as you like — a balcony, a rooftop, a greenhouse, a farm plot. Search and filters keep large lists easy to manage.",
  },
];

function SectionIntro({ eyebrow, title, text, center = false }: { eyebrow: string; title: string; text: string; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-sm font-bold uppercase tracking-[.16em] text-emerald-700 dark:text-emerald-400">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{title}</h2>
      {text ? <p className="mt-4 text-lg leading-8 text-slate-600 dark:text-slate-400">{text}</p> : null}
    </div>
  );
}

const TONES = {
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
};

function FeatureCard({
  icon: Icon,
  tone,
  title,
  text,
  className = "",
  children,
}: {
  icon: LucideIcon;
  tone: keyof typeof TONES;
  title: string;
  text: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <article className={`flex flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-7 transition hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-950/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-900 ${children ? "sm:flex-row sm:items-center" : ""} ${className}`}>
      <div className="min-w-0 flex-1">
        <span className={`grid h-11 w-11 place-items-center rounded-xl ${TONES[tone]}`}>
          <Icon size={20} aria-hidden="true" />
        </span>
        <h3 className="mt-5 text-xl font-black">{title}</h3>
        <p className="mt-2 leading-7 text-slate-600 dark:text-slate-400">{text}</p>
      </div>
      {children}
    </article>
  );
}

/** Moisture over a day: dries out, gets watered back to the stop level. */
function WateringMock() {
  // A saw-tooth: slow drying, quick refill when it crosses 40%.
  const points = [66, 62, 58, 54, 50, 46, 42, 39, 67, 63, 59, 55, 51, 47, 43, 39, 66, 62];
  const w = 260;
  const h = 120;
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => h - (v / 100) * h;
  const path = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <div aria-hidden="true" className="w-full shrink-0 rounded-2xl bg-slate-50 p-4 sm:w-72 dark:bg-slate-950/70">
      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        <span>POT-1 · Tomato · today</span>
        <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">
          <Droplets size={11} />
          2 waterings
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-28 w-full overflow-visible">
        <rect x="0" y={y(70)} width={w} height={y(40) - y(70)} className="fill-emerald-500/15" />
        <line x1="0" x2={w} y1={y(40)} y2={y(40)} className="stroke-emerald-500/50" strokeDasharray="3 3" />
        <line x1="0" x2={w} y1={y(70)} y2={y(70)} className="stroke-emerald-500/50" strokeDasharray="3 3" />
        <path d={path} fill="none" strokeWidth="2.5" strokeLinejoin="round" className="stroke-sky-500" />
      </svg>
      <div className="mt-2 flex justify-between text-[10px] font-semibold text-slate-400">
        <span>Stops at 70%</span>
        <span>Starts below 40%</span>
      </div>
    </div>
  );
}

/** Hero: a pot card as it looks in the app, plus a Telegram alert and a leaf-scan result. */
function HeroPreview() {
  const value = 38;
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div aria-label="Example of SmartAgri watering a pot" className="relative mx-auto w-full max-w-lg sm:pb-24 sm:pt-20 lg:max-w-none">
      <div aria-hidden="true" className="absolute -inset-8 -z-10 rounded-[3rem] bg-emerald-300/30 blur-3xl dark:bg-emerald-800/20" />

      {/* Pot card */}
      <div className="relative rounded-[1.75rem] border border-white/70 bg-white/95 p-5 shadow-2xl sm:mx-6 shadow-emerald-950/10 backdrop-blur sm:p-6 dark:border-slate-700/70 dark:bg-slate-900/95">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <Flower2 size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-black leading-tight">POT-1 · Tomato</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Rooftop garden · Dhanmondi</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Sensor live
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/70">
            <div className="relative h-24 w-24 shrink-0">
              <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="55" cy="55" r={r} fill="none" strokeWidth="10" className="stroke-slate-200 dark:stroke-slate-800" />
                <circle cx="55" cy="55" r={r} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-amber-500" strokeDasharray={`${(value / 100) * c} ${c}`} />
              </svg>
              <span className="absolute inset-0 grid place-items-center text-2xl font-black tabular-nums">
                {value}
                <span className="sr-only">%</span>
              </span>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Soil moisture</p>
              <p className="font-black text-amber-600 dark:text-amber-400">A bit dry</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Target 40–70%</p>
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span className="relative grid h-10 w-10 place-items-center rounded-full bg-sky-500 text-white shadow-lg shadow-sky-500/30">
                <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/40 motion-reduce:hidden" />
                <Droplets size={18} className="relative" aria-hidden="true" />
              </span>
              <div>
                <p className="font-black leading-tight">Watering now</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Stops at 70%</p>
              </div>
            </div>
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <Sun size={13} aria-hidden="true" />
              Automatic mode
            </p>
          </div>
        </div>
      </div>

      {/* Telegram alert */}
      <div className="relative z-10 -mt-3 ml-auto w-[88%] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl shadow-slate-950/10 sm:absolute sm:right-0 sm:top-2 sm:mt-0 sm:w-72 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-500 text-white">
            <Send size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0 text-xs">
            <p className="flex justify-between gap-2 font-bold">
              SmartAgri bot <span className="font-medium text-slate-400">now</span>
            </p>
            <p className="mt-0.5 leading-5 text-slate-600 dark:text-slate-300">💧 Watering started on POT-1 — soil was 38%, below 40%.</p>
          </div>
        </div>
      </div>

      {/* Leaf scan */}
      <div className="relative z-10 mt-3 w-[92%] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl shadow-slate-950/10 sm:absolute sm:bottom-2 sm:left-0 sm:mt-0 sm:w-80 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
            <ScanSearch size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0 text-xs">
            <p className="font-bold">
              Leaf scan · Early blight <span className="font-medium text-slate-400">· 92% sure</span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <ListChecks size={12} className="shrink-0 text-emerald-600" aria-hidden="true" />
              Today: cut off the spotted leaves
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <Leaf size={12} className="shrink-0 text-emerald-600" aria-hidden="true" />
              Home remedy: neem leaf spray, every 5–7 days
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
