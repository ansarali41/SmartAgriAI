"use client";

// PAGE: Notifications — list alerts/messages and mark them read (one or all).
import useSWR from "swr";
import { Bell, Check } from "lucide-react";
import { Badge, Card, IconButton, PageHeader, severityTone } from "@/components/ui";
import { errorMessage, useFeedback } from "@/components/Feedback";
import { apiPatch } from "@/lib/api-client";

interface Notification {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  createdAt: string;
}

interface TelegramDeliveryHistory {
  id: string;
  eventType: string;
  status: string;
  attemptCount: number;
  lastErrorCode: string | null;
  createdAt: string;
  sentAt: string | null;
  lastAttemptAt: string | null;
}

export default function NotificationsPage() {
  const { toast } = useFeedback();
  const { data, mutate } = useSWR<Notification[]>("/api/notifications", {
    refreshInterval: 15000,
  });
  const { data: deliveries } = useSWR<TelegramDeliveryHistory[]>("/api/telegram/deliveries", {
    refreshInterval: 15000,
  });

  async function markAll() {
    try {
      await apiPatch("/api/notifications", { all: true });
      mutate();
      toast.success("All notifications marked as read");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update notifications"));
    }
  }
  async function markOne(id: string) {
    await apiPatch("/api/notifications", { id });
    mutate();
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Alerts and system messages."
        action={
          <button
            onClick={markAll}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200"
          >
            Mark all read
          </button>
        }
      />

      <Card>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {(data ?? []).map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-3 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="shrink-0 rounded-lg bg-slate-100 p-2 text-slate-500 dark:bg-slate-800">
                  <Bell size={16} />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                    <span className="min-w-0 break-words">{n.title}</span>
                    <Badge tone={severityTone(n.severity)}>{n.severity}</Badge>
                    {n.status === "unread" ? (
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    ) : null}
                  </p>
                  <p className="break-words text-sm text-slate-500">{n.message}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              {n.status === "unread" ? (
                <IconButton onClick={() => markOne(n.id)} className="border-transparent text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40" aria-label={`Mark ${n.title} as read`}>
                  <Check size={16} />
                </IconButton>
              ) : null}
            </div>
          ))}
          {data && data.length === 0 ? (
            <p className="py-3 text-sm text-slate-400">No notifications.</p>
          ) : null}
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="text-sm font-bold">Telegram delivery history</h2>
        <p className="mt-1 text-xs text-slate-400">Delivery attempts for events owned by you. Messages are sent to the server-configured destination.</p>
        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {(deliveries ?? []).map((delivery) => (
            <div key={delivery.id} className="flex flex-col items-start gap-2 py-3 text-sm sm:flex-row sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className="break-words font-bold">{delivery.eventType.replaceAll("_", " ")}</p>
                <p className="text-xs text-slate-400">Created {new Date(delivery.createdAt).toLocaleString()}</p>
                {delivery.sentAt ? <p className="text-xs text-slate-400">Sent {new Date(delivery.sentAt).toLocaleString()}</p> : null}
                {delivery.lastErrorCode ? <p className="break-words text-xs text-amber-600 dark:text-amber-400">Last result: {delivery.lastErrorCode}</p> : null}
              </div>
              <div className="self-start text-left sm:text-right">
                <Badge tone={delivery.status === "SENT" ? "green" : delivery.status === "FAILED" ? "red" : "yellow"}>{delivery.status}</Badge>
                <p className="mt-1 text-xs text-slate-400">{delivery.attemptCount} attempt{delivery.attemptCount === 1 ? "" : "s"}</p>
              </div>
            </div>
          ))}
          {deliveries && deliveries.length === 0 ? <p className="py-3 text-sm text-slate-400">No Telegram delivery history.</p> : null}
        </div>
      </Card>
    </div>
  );
}
