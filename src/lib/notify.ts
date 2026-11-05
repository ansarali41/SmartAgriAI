// Writing in-app notifications (the header bell). Kept free of other app
// imports so any module, including transactions, can use it.
import type { NotificationType, Prisma, Severity } from "@prisma/client";

export interface AppNotification {
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  severity?: Severity;
  actionUrl?: string;
  gardenId?: string | null;
  potId?: string | null;
  plantId?: string | null;
}

type NotificationStore = Pick<Prisma.TransactionClient, "notification">;

export function createAppNotification(store: NotificationStore, notification: AppNotification) {
  return store.notification.create({ data: notification });
}

/** Creates the notification unless one with the same title (and pot) already exists since `since`. */
export async function createAppNotificationOnce(store: NotificationStore, notification: AppNotification, since: Date) {
  const existing = await store.notification.findFirst({
    where: {
      userId: notification.userId,
      title: notification.title,
      potId: notification.potId ?? undefined,
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  if (existing) return null;
  return createAppNotification(store, notification);
}

export const potActionUrl = (gardenId: string | null | undefined, potId: string) =>
  gardenId ? `/irrigation?garden=${gardenId}&pot=${potId}` : "/irrigation";
