# Deploy: Vercel + Supabase (+ Hugging Face for the AI)

| Part | Where | Cost |
|---|---|---|
| Web app + API | Vercel (Hobby) | free |
| Database + leaf-photo storage | Supabase | free |
| AI service (TensorFlow) | Hugging Face Docker Space | free |
| Telegram sender every 5 min | GitHub Actions (`.github/workflows/telegram-worker.yml`) | free |

Pick **Singapore** for Supabase — `vercel.json` already runs the app in Singapore (`sin1`).

## 1. Supabase (database + storage)

1. supabase.com → **New project** → region **Southeast Asia (Singapore)** → set a database password.
2. **Connect** (top bar) → copy two strings and put your password in:
   - **Transaction pooler** (port **6543**) → this is `DATABASE_URL`. Add
     `?pgbouncer=true&connection_limit=1` to the end.
   - **Session pooler** or **Direct connection** (port **5432**) → this is `DIRECT_URL`.
3. **Project Settings → API Keys** → copy the **Project URL** (`SUPABASE_URL`) and the
   **service_role / secret** key (`SUPABASE_SERVICE_ROLE_KEY`). Keep that key server-only.
   The private `disease-images` storage bucket is created automatically on the first upload.

## 2. AI service on Hugging Face (optional)

Skip this if you'll use **Google Gemini** or **Groq** for Disease AI (Settings → Disease AI,
free API key, nothing to host). Then leave `AI_SERVICE_URL` / `AI_SERVICE_TOKEN` unset.

1. huggingface.co → **New Space** → SDK **Docker** → blank → public or private.
2. Upload everything inside `services/ai/` (keep the folders: `app/`, `models/`,
   `Dockerfile`, `requirements.txt`, `README.md`). The model files are large — the web
   uploader handles them.
3. Space **Settings → Variables and secrets** → add secret `AI_SERVICE_TOKEN` = a long
   random value (`openssl rand -hex 24`).
4. Wait for the build, then open `https://YOUR-SPACE.hf.space/health` → `"status":"ready"`.

Free Spaces sleep after ~48 h idle; the first scan afterwards takes up to a minute.

## Env files

| File | Used by | Contents |
|---|---|---|
| `.env.development` | `npm run dev`, `npm run db:*`, `npm run simulate`, `npm run telegram:worker:dev` | local database + local secrets |
| `.env.vercel` | nothing automatically | your production values — copy them into Vercel; run a command against the live DB only on purpose: `npx dotenv -e .env.vercel -- npx prisma migrate status` |

Both are git-ignored (`.env*`, except `.env.example`). Supabase's newer secret key can be
set as `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`).

## 3. Vercel

1. Push the project to GitHub. vercel.com → **Add New → Project** → import the repo.
   Framework: Next.js (detected). Leave build settings as they are — the
   `vercel-build` script runs `prisma migrate deploy` (creates the tables) before building.
2. **Environment Variables** (Production):

| Name | Value |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler URL + `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Supabase direct / session pooler URL (port 5432) |
| `AUTH_SECRET` | `openssl rand -base64 32` — keep it; changing it logs everyone out and disconnects Telegram bots |
| `AUTH_TRUST_HOST` | `true` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Supabase secret key (`sb_secret_…`; or `SUPABASE_SERVICE_ROLE_KEY` = legacy service_role key) |
| `AI_SERVICE_URL` | `https://YOUR-SPACE.hf.space` |
| `AI_SERVICE_TOKEN` | same value as the Space secret |
| `CRON_SECRET` | `openssl rand -hex 24` |

3. **Deploy**. Open the site → **Create account**.

Optional starter data (gardens/pots) — run once from your computer against Supabase:

```bash
DATABASE_URL="<pooler url>" DIRECT_URL="<direct url>" DEMO_PASSWORD=yourpassword npm run db:seed
```

## 4. Telegram sender (GitHub Actions)

Repo → **Settings → Secrets and variables → Actions** → add `DATABASE_URL` (the
**direct** URL) and `AUTH_SECRET` (same as Vercel). The workflow then sends queued
alerts every 5 minutes. (Vercel Hobby only allows a daily cron, which stays as a backup.)
Users connect their own bot in **Settings → Telegram alerts**.

## 5. The ESP32 board

1. Flash firmware **2.6** (README → "Connect a device"). It supports `https://`
   and verifies the server's certificate (`iot/esp32/src/root_ca.h`).
2. Hold **BOOT 3 s** (or Devices → ⋮ → **Reset Wi-Fi**) to open **SmartAgri-Setup**,
   and enter the server address **`https://your-app.vercel.app`**.
3. In the live app: **Devices → Add device** → press **BOOT** → connect it to a pot.

The board reports every 20 s (plus an immediate report when a reading changes by 2% or
more) and checks for pump commands every 10 s — about 13k requests a day, well inside
Vercel's free plan. (Faster rates: see `config.example.h`.)

## Checklist after deploying

- Sign up, create a garden and a pot.
- **Disease AI** shows **AI model ready**; a scan works and reopens from history.
- The board shows **Online** on **Devices** and moisture appears on its pot.
- **Settings → Telegram alerts → Send test message** arrives.
