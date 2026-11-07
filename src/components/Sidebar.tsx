"use client";

import {
  BarChart3,
  ChevronLeft,
  Droplets,
  Flower2,
  LayoutDashboard,
  Microscope,
  Moon,
  Package,
  Satellite,
  Settings,
  Sprout,
  Sun,
  Trees,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/gardens", label: "Gardens", icon: Trees },
      { to: "/pots", label: "Pots", icon: Package },
      { to: "/plants", label: "Plants", icon: Flower2 },
    ],
  },
  {
    title: "Automation & AI",
    items: [
      { to: "/irrigation", label: "Irrigation", icon: Droplets },
      { to: "/disease-detection", label: "Disease AI", icon: Microscope },
      { to: "/sensors", label: "Devices", icon: Satellite },
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
];

// Notifications and Log out live in the top bar (bell + account menu).
const accountItems: NavItem[] = [{ to: "/settings", label: "Settings", icon: Settings }];

// Theme lives on <html class="dark">; observe it so every toggle stays in sync.
function subscribeTheme(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function setTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch {
    // Storage unavailable; the theme still applies for this visit.
  }
}

export function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: {
  onNavigate?: () => void;
  /** Icon-only rail; labels move into tooltips. */
  collapsed?: boolean;
  /** Omitted in the mobile drawer, which has its own close button. */
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const dark = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

  function isActive(to: string) {
    return pathname === to || pathname.startsWith(to + "/");
  }

  const logo = (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
      <Sprout size={20} />
    </span>
  );

  // Every element stays mounted in both states and only animates width /
  // opacity, with fixed left padding so icons never shift while the rail
  // resizes. Icon centres sit at 36px = half the 72px collapsed rail.
  return (
    <aside className="relative flex h-full flex-col border-r border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-950">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center border-b border-slate-100 px-4 dark:border-slate-800/80">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          aria-label="SmartAgri dashboard"
          className="flex min-w-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600"
        >
          {logo}
          <Reveal collapsed={collapsed} className="pl-3 text-base font-bold text-slate-950 dark:text-white">
            SmartAgri
          </Reveal>
        </Link>
      </div>

      {/* Round collapse toggle straddling the sidebar's right edge. */}
      {onToggleCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-4 top-16 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition hover:border-emerald-300 hover:text-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:shadow-black/40 dark:hover:border-emerald-500/50 dark:hover:text-emerald-400"
        >
          <ChevronLeft
            size={16}
            strokeWidth={2.5}
            className={`${MOTION} group-data-[ready]/shell:transition-transform ${collapsed ? "rotate-180" : ""}`}
          />
        </button>
      ) : null}

      {/* Main navigation. Collapsed mode lets tooltips overflow the rail. */}
      <nav
        aria-label="Main"
        className={`flex-1 border-b border-slate-100 px-3 py-4 dark:border-slate-800/80 ${
          collapsed ? "overflow-visible" : "overflow-y-auto overflow-x-hidden [scrollbar-width:thin]"
        }`}
      >
        {navSections.map((section, index) => (
          <Section key={section.title} title={section.title} collapsed={collapsed} first={index === 0}>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                item={item}
                active={isActive(item.to)}
                onNavigate={onNavigate}
                collapsed={collapsed}
              />
            ))}
          </Section>
        ))}
      </nav>

      {/* Account */}
      <div className="shrink-0 px-3 py-4">
        <Section title="Account" collapsed={collapsed} first>
          {accountItems.map((item) => (
            <NavLink
              key={item.to}
              item={item}
              active={isActive(item.to)}
              onNavigate={onNavigate}
              collapsed={collapsed}
            />
          ))}
        </Section>

        <div className="mt-4 flex items-center pl-0.5">
          <Reveal collapsed={collapsed} className="pl-2.5 pr-2.5">
            <Sun size={16} className="text-slate-400" aria-hidden="true" />
          </Reveal>
          <button
            type="button"
            role="switch"
            aria-checked={dark}
            aria-label="Dark mode"
            onClick={() => setTheme(!dark)}
            // Styled from the `dark` class (set before paint), not React state, so the
            // switch is already in the right position before hydration.
            className="group relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-200 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:bg-emerald-600"
          >
            <span
              className="inline-block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform dark:translate-x-[22px]"
            />
            {collapsed ? <Tooltip>{dark ? "Light mode" : "Dark mode"}</Tooltip> : null}
          </button>
          <Reveal collapsed={collapsed} className="pl-2.5">
            <Moon size={16} className="text-slate-400" aria-hidden="true" />
          </Reveal>
        </div>
      </div>
    </aside>
  );
}

/** Shared timing so the rail, labels and page padding move as one. */
export const MOTION = "duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none";

/** Content that slides/fades out (to zero width) when the rail collapses. */
function Reveal({
  collapsed,
  className = "",
  children,
}: {
  collapsed: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden={collapsed || undefined}
      className={`overflow-hidden whitespace-nowrap group-data-[ready]/shell:transition-[max-width,opacity] ${MOTION} ${
        collapsed ? "max-w-0 opacity-0" : "max-w-48 opacity-100"
      }`}
    >
      <span className={`block ${className}`}>{children}</span>
    </span>
  );
}

function Section({
  title,
  collapsed,
  first,
  children,
}: {
  title: string;
  collapsed: boolean;
  first: boolean;
  children: ReactNode;
}) {
  // Title and divider share one fixed-height row and cross-fade, so the list
  // below never jumps vertically.
  return (
    <div className={first ? "" : "mt-5"}>
      <div className="relative mb-2 h-4">
        <p
          className={`absolute inset-x-0 top-0 overflow-hidden whitespace-nowrap px-3 text-[11px] font-semibold uppercase leading-4 tracking-[0.12em] text-slate-400 group-data-[ready]/shell:transition-opacity dark:text-slate-500 ${MOTION} ${
            collapsed ? "opacity-0" : "opacity-100"
          }`}
        >
          {title}
        </p>
        {first ? null : (
          <div
            aria-hidden="true"
            className={`absolute inset-x-2 top-1/2 border-t border-slate-200 group-data-[ready]/shell:transition-opacity dark:border-slate-800 ${MOTION} ${
              collapsed ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
      </div>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function Tooltip({ children }: { children: ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-slate-700"
    >
      {children}
    </span>
  );
}

function NavLink({
  item,
  active,
  onNavigate,
  collapsed = false,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  return (
    <li>
      <Link
        href={item.to}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        className={`group relative flex items-center rounded-lg px-[15px] py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
          active
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
        }`}
      >
        <item.icon
          size={18}
          className={`shrink-0 ${
            active
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300"
          }`}
        />
        <Reveal collapsed={collapsed} className="pl-3">
          {item.label}
        </Reveal>
        {collapsed ? <Tooltip>{item.label}</Tooltip> : null}
      </Link>
    </li>
  );
}
