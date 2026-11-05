"use client";

import { Bell, CheckCheck, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import useSWR from "swr";
import { Badge, severityTone } from "@/components/ui";
import { apiPatch } from "@/lib/api-client";

interface Notification {
  id: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  actionUrl: string | null;
  createdAt: string;
}

/** Close a popover on outside click or Escape, returning focus to its trigger. */
export function useDismiss(
  open: boolean,
  close: () => void,
  rootRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close, rootRef, triggerRef]);
}

function Popover({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`animate-fade-in absolute right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40 ${className}`}
    >
      {children}
    </div>
  );
}

function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationsMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Same SWR key as the Notifications page, so both stay in sync.
  const { data, mutate } = useSWR<Notification[]>("/api/notifications", {
    refreshInterval: 30000,
  });
  const unread = data?.filter((n) => n.status === "unread").length ?? 0;
  const recent = (data ?? []).slice(0, 6);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);

  async function markAll() {
    await apiPatch("/api/notifications", { all: true });
    mutate();
  }

  async function openNotification(notification: Notification) {
    setOpen(false);
    if (notification.status === "unread") {
      apiPatch("/api/notifications", { id: notification.id }).then(() => mutate());
    }
    router.push(notification.actionUrl || "/notifications");
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        <Bell size={20} />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-slate-950">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <Popover className="w-[min(22rem,calc(100vw-2rem))]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-bold">
              Notifications
              {unread ? <span className="ml-1.5 font-medium text-slate-400">({unread} new)</span> : null}
            </p>
            {unread ? (
              <button
                type="button"
                onClick={markAll}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
              >
                <CheckCheck size={14} />
                Mark all read
              </button>
            ) : null}
          </div>

          {recent.length ? (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {recent.map((notification) => {
                const isUnread = notification.status === "unread";
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                        isUnread ? "bg-emerald-50/40 dark:bg-emerald-500/5" : ""
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isUnread ? "bg-emerald-500" : "bg-transparent"}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`truncate text-sm ${isUnread ? "font-bold" : "font-medium"}`}>
                            {notification.title}
                          </span>
                          <Badge tone={severityTone(notification.severity)}>{notification.severity}</Badge>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500 dark:text-slate-400">
                          {notification.message}
                        </span>
                        <span className="mt-1 block text-[11px] font-medium text-slate-400">
                          {timeAgo(notification.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-slate-400">
              <Bell size={22} className="mx-auto mb-2 opacity-60" />
              {data ? "You're all caught up." : "Loading…"}
            </div>
          )}

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-emerald-600 hover:bg-slate-50 dark:border-slate-800 dark:text-emerald-400 dark:hover:bg-slate-800/60"
          >
            View all notifications
          </Link>
        </Popover>
      ) : null}
    </div>
  );
}

/** "Sanzida Zinia" -> "SZ", "demo" -> "DE". */
function initialsFor(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

export function UserMenu({ email, userName = null }: { email: string; userName?: string | null }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);
  // Same SWR key as the Settings page, so saving a new name or email there
  // updates this menu immediately. The session email is only a fallback.
  // The server-rendered name is the starting value, so nothing flashes on load.
  const { data: profile } = useSWR<{ email: string; userName: string | null }>("/api/profile", {
    fallbackData: { email, userName },
  });
  const currentEmail = profile?.email ?? email;
  const name = profile?.userName?.trim() || currentEmail.split("@")[0];
  const initials = initialsFor(name);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-3 rounded-full py-1 pl-1 pr-1 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:hover:bg-slate-800 sm:pl-3"
      >
        <span className="hidden max-w-40 text-right leading-tight sm:block">
          <span className="block truncate text-sm font-bold">{name}</span>
        </span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white ring-2 ring-emerald-600/20">
          {initials}
        </span>
      </button>

      {open ? (
        <Popover className="w-64">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-sm font-bold text-white">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{name}</span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{currentEmail}</span>
            </span>
          </div>
          <div role="menu" className="p-1.5">
            <Link
              role="menuitem"
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Settings size={16} className="text-slate-400" />
              Settings
            </Link>
            <button
              role="menuitem"
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              <LogOut size={16} />
              Log out
            </button>
          </div>
        </Popover>
      ) : null}
    </div>
  );
}
