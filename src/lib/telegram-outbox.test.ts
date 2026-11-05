import assert from "node:assert/strict";
import test from "node:test";
import type { TelegramDelivery } from "@prisma/client";
import { calculateRetryDelayMs, claimDueTelegramDeliveries, enqueueTelegramDelivery, processTelegramDelivery, runTelegramDeliveryWorkerUntilIdle } from "./telegram-outbox";

const now = new Date("2026-10-28T06:00:00.000Z");

function delivery(overrides: Partial<TelegramDelivery> = {}): TelegramDelivery {
  return {
    id: "delivery-1", userId: "user-1", eventKey: "pump:command-1:acknowledged", eventType: "PUMP_ACKNOWLEDGED", eventRef: "command-1",
    channel: "telegram", destinationRef: "configured-default", messageText: "Pump started", status: "PROCESSING", attemptCount: 1,
    nextAttemptAt: now, lastErrorCode: null, providerMessageId: null, lastAttemptAt: now, leaseExpiresAt: new Date(now.getTime() + 60_000), createdAt: now, updatedAt: now, sentAt: null,
    ...overrides,
  };
}

test("duplicate event enqueue uses the database unique key without failing the business transaction", async () => {
  const calls: any[] = [];
  const tx = { telegramDelivery: { createMany: async (value: any) => { calls.push(value); return { count: 0 }; } } };
  const result = await enqueueTelegramDelivery(tx as never, {
    userId: "user-1", eventKey: "pump:command-1:acknowledged", eventType: "PUMP_ACKNOWLEDGED", eventRef: "command-1", messageText: "Pump started",
  });
  assert.equal(result.count, 0);
  assert.equal(calls[0].skipDuplicates, true);
  await assert.rejects(
    enqueueTelegramDelivery({ telegramDelivery: { createMany: async () => { throw new Error("transaction rollback"); } } } as never, {
      userId: "user-1", eventKey: "event", eventType: "PUMP_ACKNOWLEDGED", eventRef: "ref", messageText: "text",
    }),
    /transaction rollback/,
  );
});

test("only one concurrent worker claims a due delivery", async () => {
  let row = delivery({ status: "PENDING", leaseExpiresAt: null });
  const store = { telegramDelivery: {
    findMany: async () => [row],
    updateMany: async ({ where, data }: any) => {
      if (row.id !== where.id || row.status !== "PENDING") return { count: 0 };
      row = { ...row, status: data.status, attemptCount: row.attemptCount + 1, lastAttemptAt: data.lastAttemptAt, leaseExpiresAt: data.leaseExpiresAt };
      return { count: 1 };
    },
    findUnique: async () => row,
  } };
  const [first, second] = await Promise.all([
    claimDueTelegramDeliveries(store as never, { now, limit: 1 }),
    claimDueTelegramDeliveries(store as never, { now, limit: 1 }),
  ]);
  assert.equal(first.length + second.length, 1);
  assert.equal(row.status, "PROCESSING");
});

test("success persists provider ID and transient failures schedule bounded retry", async () => {
  const writes: any[] = [];
  const store = { telegramDelivery: { updateMany: async (value: any) => { writes.push(value); return { count: 1 }; } } };
  const success = await processTelegramDelivery(delivery(), store as never, async () => ({ ok: true, providerMessageId: "55" }), now);
  assert.equal(success.status, "sent");
  assert.equal(writes[0].data.status, "SENT");
  assert.equal(writes[0].data.providerMessageId, "55");

  const retry = await processTelegramDelivery(delivery(), store as never, async () => ({ ok: false, reason: "timeout" }), now);
  assert.equal(retry.status, "retry");
  assert.equal(writes[1].data.status, "PENDING");
  assert.ok(writes[1].data.nextAttemptAt > now);
  assert.equal(calculateRetryDelayMs(1, 0), 22_500);
  assert.equal(calculateRetryDelayMs(10, 1), 4_500_000);
});

test("permanent, exhausted, and ambiguous timeout outcomes remain inspectable", async () => {
  const writes: any[] = [];
  const store = { telegramDelivery: { updateMany: async (value: any) => { writes.push(value); return { count: 1 }; } } };
  const permanent = await processTelegramDelivery(delivery(), store as never, async () => ({ ok: false, reason: "http", providerCode: "HTTP_403" }), now);
  assert.equal(permanent.status, "failed");
  assert.equal(writes[0].data.lastErrorCode, "HTTP_403");

  const exhausted = await processTelegramDelivery(delivery({ attemptCount: 6 }), store as never, async () => ({ ok: false, reason: "network" }), now);
  assert.equal(exhausted.status, "failed");

  const ambiguous = await processTelegramDelivery(delivery(), store as never, async () => ({ ok: false, reason: "timeout" }), now);
  assert.equal(ambiguous.status, "retry");
});

test("a stale PROCESSING lease is eligible for recovery", async () => {
  let updated = false;
  const stale = delivery({ leaseExpiresAt: new Date(now.getTime() - 1) });
  const store = { telegramDelivery: {
    findMany: async () => [stale],
    updateMany: async () => { updated = true; return { count: 1 }; },
    findUnique: async () => stale,
  } };
  const claimed = await claimDueTelegramDeliveries(store as never, { now, limit: 1 });
  assert.equal(updated, true);
  assert.equal(claimed.length, 1);
});

test("bounded worker drain claims existing pending rows, increments attempts, and sends each once", async () => {
  const rows = [
    delivery({ id: "delivery-1", status: "PENDING", attemptCount: 0, leaseExpiresAt: null }),
    delivery({ id: "delivery-2", eventKey: "disease:report-1", status: "PENDING", attemptCount: 0, leaseExpiresAt: null }),
  ];
  const store = { telegramDelivery: {
    findMany: async () => rows.filter((row) => row.status === "PENDING"),
    findUnique: async ({ where }: any) => rows.find((row) => row.id === where.id) ?? null,
    updateMany: async ({ where, data }: any) => {
      const index = rows.findIndex((row) => row.id === where.id && (data.status === "PROCESSING" ? row.status === "PENDING" : row.status === where.status));
      if (index < 0) return { count: 0 };
      const row = rows[index];
      rows[index] = {
        ...row,
        ...data,
        attemptCount: data.attemptCount?.increment ? row.attemptCount + data.attemptCount.increment : row.attemptCount,
      };
      return { count: 1 };
    },
  } };

  const result = await runTelegramDeliveryWorkerUntilIdle(
    store as never,
    async () => ({ ok: true, providerMessageId: "provider-message" }),
    { now, limit: 1, maxBatches: 5 },
  );

  assert.deepEqual(result, { claimed: 2, sent: 2, retried: 0, failed: 0 });
  assert.deepEqual(rows.map((row) => [row.status, row.attemptCount]), [["SENT", 1], ["SENT", 1]]);
});

test("a stale backlog older than 6 hours is expired, not sent", async () => {
  const expireCalls: any[] = [];
  const store = { telegramDelivery: {
    findMany: async () => [],
    updateMany: async (args: any) => { if (!args.where.id) expireCalls.push(args); return { count: 3 }; },
    findUnique: async () => null,
  } };
  const claimed = await claimDueTelegramDeliveries(store as never, { now });
  assert.equal(claimed.length, 0);
  assert.equal(expireCalls.length, 1);
  assert.equal(expireCalls[0].where.status, "PENDING");
  assert.equal(expireCalls[0].where.createdAt.lt.getTime(), now.getTime() - 6 * 60 * 60 * 1000);
  assert.equal(expireCalls[0].data.status, "FAILED");
  assert.equal(expireCalls[0].data.lastErrorCode, "EXPIRED");
});
