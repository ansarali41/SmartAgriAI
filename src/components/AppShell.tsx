"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { MOTION, Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

const STORAGE_KEY = "smart-agri:sidebar-collapsed";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readCollapsed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Storage unavailable (private mode); the toggle still works for this render.
  }
  listeners.forEach((listener) => listener());
}

/** App chrome: desktop sidebar (collapsible, remembered per browser) + topbar. */
export function AppShell({
  email,
  userName,
  children,
}: {
  email: string;
  userName: string | null;
  children: ReactNode;
}) {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const shellRef = useRef<HTMLDivElement>(null);

  // Enable transitions only after the saved state has been applied, so a
  // collapsed sidebar doesn't visibly animate closed on every page load.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (shellRef.current) shellRef.current.dataset.ready = "true";
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={shellRef} className="group/shell">
      <div
        className={`hidden md:fixed md:inset-y-0 md:z-40 md:flex md:flex-col group-data-[ready]/shell:transition-[width] ${MOTION} ${
          collapsed ? "md:w-[72px]" : "md:w-64"
        }`}
      >
        <Sidebar collapsed={collapsed} onToggleCollapsed={() => writeCollapsed(!collapsed)} />
      </div>
      <div
        className={`group-data-[ready]/shell:transition-[padding] ${MOTION} ${
          collapsed ? "md:pl-[72px]" : "md:pl-64"
        }`}
      >
        <Topbar email={email} userName={userName} />
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
