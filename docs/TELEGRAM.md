# Telegram alerts

Each user connects their **own** Telegram bot from the app — nothing goes in `.env`.

## Set up (per user, in the app)

1. In Telegram, open **@BotFather**, send `/newbot`, and copy the bot token.
2. In SmartAgri: **Settings → Telegram alerts** → paste the token → **Connect bot**.
   The token is checked with Telegram and stored **encrypted** (AES-256-GCM, key
   derived from `AUTH_SECRET`). It is never sent back to the browser.
3. Click **Open @yourbot**, press **Start** in Telegram, then **I've pressed Start** —
   the chat is found automatically.
4. **Send test message** to confirm.

> Changing `AUTH_SECRET` makes saved tokens unreadable — users then reconnect their bot.

## What gets sent

Pump turned on/off (acknowledged by the board), pump command failed, device
offline, device back online, disease scan result. Every category is on by default;
optionally set any of these to `false` to turn one off for everyone:
`TELEGRAM_NOTIFY_PUMP_ACKNOWLEDGED`, `TELEGRAM_NOTIFY_PUMP_FAILED`,
`TELEGRAM_NOTIFY_DISEASE_ANALYSIS`, `TELEGRAM_NOTIFY_DEVICE_OFFLINE`,
`TELEGRAM_NOTIFY_DEVICE_RECOVERED`.

## How delivery works

- Events are written to a durable queue (`TelegramDelivery`) in the same database
  transaction as the event itself, keyed so the same event is never queued twice.
- A sender claims queued rows with a lease, sends each with **its owner's bot**,
  retries temporary failures with backoff, and marks permanent failures.
- Alerts older than **6 hours** are skipped (marked `EXPIRED`) so a backlog never
  floods a chat.

Who runs the sender:

| Where | How |
|---|---|
| Local / while the app is open | The notification bell's check (about every 30 s) sends the signed-in user's queued alerts. Settings also has **Send queued now**. |
| Vercel | `vercel.json` cron calls `GET /api/cron/telegram-deliveries` every 5 min with `Authorization: Bearer $CRON_SECRET`. |
| Render / GitHub Actions | `npm run telegram:worker` every 5 min. Needs `DATABASE_URL` and `AUTH_SECRET` (to decrypt bot tokens). |

## Optional server-wide fallback

If `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set, users who haven't connected
their own bot get alerts in that chat instead. Leave them unset to use per-user bots only.
