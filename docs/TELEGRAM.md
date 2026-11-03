# Telegram transport

SmartAgri's server-side Telegram transport reads these Vercel environment variables:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Set both in the Vercel project’s Production environment, then redeploy. They must not use the `NEXT_PUBLIC_` prefix and must never be placed in browser code.

## Secure delivery check

`POST /api/telegram/test` sends a fixed timestamped test message to the server-configured chat. It accepts no request body, chat ID, token, or message content and requires an authenticated SmartAgri session. The current schema has no administrator role, so the route cannot safely impose an additional role restriction without inventing one.

Use an authenticated browser session or an authenticated same-origin request to call it once after deployment. A successful response is `{ "success": true }`; failures intentionally return no provider details.

Remove `src/app/api/telegram/test/route.ts` after verification if it is not needed. If retained, keep it authenticated, fixed-message-only, and consider adding an approved administrator role plus rate limiting before broad production use.

## Durable business-event delivery (Phase 4)

Pump acknowledgements/failures and completed disease analyses enqueue a unique, durable `TelegramDelivery` record in the same database transaction as their business event. Queue creation and sensor ingestion never enqueue a pump-confirmed event; sensor-triggered automatic decisions therefore cannot flood Telegram. Failed device acknowledgements are recorded atomically with their PumpEvent and failure delivery record.

`GET /api/cron/telegram-deliveries` is the bounded worker. Vercel Cron invokes it every five minutes in production; it requires `Authorization: Bearer $CRON_SECRET`. Set a high-entropy `CRON_SECRET` in Vercel and never expose it to browser code. The worker claims rows conditionally, recovers expired processing leases, stores safe result codes and provider message IDs, and retries transient failures with capped exponential backoff. Terminal failures remain visible in the authenticated Telegram delivery history.

There is intentionally no new in-app `Notification` row: it is a separate read/unread feed. Telegram delivery failures do not alter an acknowledged command or disease result. The unique event key prevents duplicate outbox rows and leases prevent simultaneous workers from sending the same claimed row. Telegram does not provide general idempotency for an ambiguous timeout: if Telegram accepted a message but its response was lost, a retry can still produce a duplicate message.

## Device monitoring and global categories (Phase 5)

The same scheduled worker also checks devices independently of dashboard visits. `lastSeenAt` means the time SmartAgri successfully received valid authenticated telemetry; it does not prove relay, sensor, or physical-device health. `DEVICE_OFFLINE_THRESHOLD_SECONDS` must be configured for the deployed telemetry interval (the documented 900-second fallback is conservative for a roughly 60-second heartbeat). An ONLINE → OFFLINE transition creates one durable delivery keyed by that device and its last successful receipt. A valid ingestion from OFFLINE → ONLINE creates one recovery delivery. Conditional database updates make both transitions safe when schedulers or ingestions overlap.

Telegram routing remains one server-configured project destination. Category controls are therefore global environment variables, not per-user settings: `TELEGRAM_NOTIFY_PUMP_ACKNOWLEDGED`, `TELEGRAM_NOTIFY_PUMP_FAILED`, `TELEGRAM_NOTIFY_DISEASE_ANALYSIS`, `TELEGRAM_NOTIFY_DEVICE_OFFLINE`, and `TELEGRAM_NOTIFY_DEVICE_RECOVERED`. Each defaults enabled and is disabled only by the explicit value `false`. Low-moisture decision alerts and daily summaries remain deferred: no deduplicated producer or timezone preference exists yet.

Manual production test:
1. In Vercel, set Production TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.
2. Redeploy after changing either variable.
3. Sign in to SmartAgri.
4. From the authenticated site’s browser console, run:
fetch("/api/telegram/test", { method: "POST" }).then((r) => r.json())
5. Confirm { success: true } and the fixed test message in the configured chat.

## Phase 5 verification matrix

Automated tests mock Telegram and cover pump wording, queued-command non-delivery, durable enqueue idempotency, concurrent claims, retry limits, timeout retry behavior, worker authentication, ownership-scoped history, offline transition deduplication, and global category defaults. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npx prisma validate` locally.

Manual checks that can send real Telegram messages (use a non-production destination when possible):

1. Call the authenticated fixed-message endpoint once and confirm the test message.
2. Acknowledge one PUMP_ON and one PUMP_OFF command from a device; confirm each creates a durable delivery only after acknowledgement.
3. Leave a command queued/unacknowledged; confirm no pump-confirmed delivery exists.
4. Submit a failed device acknowledgement; confirm a persisted failed command/PumpEvent and a failure delivery.
5. Complete disease analysis, then force a database failure in a local test environment; confirm only the committed analysis has an outbox row.
6. Submit repeated sensor readings; confirm they do not create additional pump-confirmed messages.
7. Set `DEVICE_OFFLINE_THRESHOLD_SECONDS` to a short local-test value (minimum 60), make an ONLINE device stale, and invoke the cron endpoint with `Authorization: Bearer $CRON_SECRET`; confirm one offline event. Invoke it again and confirm no duplicate. Send valid authenticated telemetry and confirm one recovery event.
8. Simulate a Telegram timeout and repeat cron invocations; confirm attempts/backoff advance and terminal failure occurs after six claims.
9. Verify an unauthenticated cron request is 401, and verify a different user cannot retrieve another user's delivery history.

`GET /api/cron/telegram-deliveries` is a protected operational endpoint. Vercel invokes cron routes only on production deployments; locally invoke it manually with the configured `CRON_SECRET`.
