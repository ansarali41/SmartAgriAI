// Shared layout for Sign in / Create account: one simple centred card.
import Link from "next/link";
import { ArrowLeft, Sprout } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#f7faf7] px-4 py-12 dark:bg-slate-950">
      <Link
        href="/"
        className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900 sm:left-6 sm:top-6 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Home
      </Link>

      <div className="w-full max-w-sm">
        <Link href="/" aria-label="SmartAgri home" className="mx-auto mb-6 flex w-fit items-center gap-2 text-lg font-black">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white">
            <Sprout size={19} aria-hidden="true" />
          </span>
          SmartAgri
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-center text-2xl font-black tracking-tight">{title}</h1>
          <p className="mt-1.5 text-center text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">{footer}</p>
      </div>
    </div>
  );
}
