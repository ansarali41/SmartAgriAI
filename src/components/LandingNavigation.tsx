"use client";

import Link from "next/link";
import { Menu, Sprout, X } from "lucide-react";
import { useState } from "react";

const links = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#platform", label: "Platform" },
];

export function LandingNavigation({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const primaryHref = signedIn ? "/dashboard" : "/register";

  return (
    <header className="relative z-30 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
      <Link href="/" className="flex items-center gap-2.5 text-lg font-black tracking-tight text-slate-950 dark:text-white">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
          <Sprout size={22} aria-hidden="true" />
        </span>
        SmartAgri
      </Link>

      <nav className="hidden items-center gap-7 md:flex" aria-label="Main navigation">
        {links.map((link) => <a key={link.href} href={link.href} className="text-sm font-bold text-slate-600 transition hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600 dark:text-slate-300 dark:hover:text-emerald-300">{link.label}</a>)}
      </nav>

      <div className="hidden items-center gap-3 md:flex">
        {!signedIn ? <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-bold text-slate-700 transition hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-slate-200">Sign in</Link> : null}
        <Link href={primaryHref} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
          {signedIn ? "Open Dashboard" : "Get started"}
        </Link>
      </div>

      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="landing-menu" className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-800 dark:text-slate-200 md:hidden">
        <span className="sr-only">{open ? "Close navigation menu" : "Open navigation menu"}</span>
        {open ? <X size={20} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
      </button>

      {open ? <div id="landing-menu" className="absolute inset-x-5 top-[76px] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-900 md:hidden">
        <nav className="grid gap-1" aria-label="Mobile navigation">
          {links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-slate-200 dark:hover:bg-emerald-950/50">{link.label}</a>)}
          {!signedIn ? <Link href="/login" onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-200">Sign in</Link> : null}
          <Link href={primaryHref} onClick={() => setOpen(false)} className="mt-1 rounded-lg bg-emerald-600 px-3 py-3 text-center text-sm font-bold text-white hover:bg-emerald-700">{signedIn ? "Open Dashboard" : "Get started"}</Link>
        </nav>
      </div> : null}
    </header>
  );
}
