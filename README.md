# SmartAgri

**Smart watering, plant care and alerts for gardens of every size** — balconies,
rooftops, greenhouses and farm plots.

A soil sensor (ESP32) in each pot reports moisture to the web app. The app waters
the pot automatically between the plant's levels, sends alerts in the app and on
Telegram, and includes a **leaf doctor** — photograph a sick leaf to get a diagnosis,
first steps and home remedies.

Built for the CSE-4000 proposal *"AI-Driven IoT Framework for Crop Health Prediction
and Smart Irrigation Management"*.

---

## What it does

| Feature | Where in the app |
|---|---|
| 🪴 Gardens, pots (POT-1, POT-2…) and plants — 86-plant guide with Bangla names and recommended soil & watering | Gardens, Pots, Plants |
| 🌡️ Live soil moisture from an ESP32 per pot; probe faults and offline boards are flagged | Dashboard, Sensors |
| 💧 Automatic irrigation per pot (start / stop levels), manual pump control, history | Irrigation |
| 🔬 Leaf disease detection with first steps + home remedies; every scan saved | Disease AI |
| 📊 Moisture vs. target, waterings, weather, activity log, Excel export | Analytics |
| 🔔 Alerts in the app and on Telegram (your own bot) | Bell, Settings |
| 📶 Add a board with no code: Wi-Fi setup page + BOOT button; restart / reset / sleep it remotely | Sensors |
| 🌦️ Weather for each garden's location | Garden details, Dashboard |

Proposal features **#4 Recommendations** and **#5 Crop health score** are implemented as
APIs (`/api/recommendations`, `/api/health-score`) but not shown in the UI yet.

## Tech stack

- **Web app:** Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · SWR
- **Database:** PostgreSQL + Prisma 6
- **Auth:** Auth.js (NextAuth v5), email + password, JWT sessions
- **AI service:** Python · FastAPI · TensorFlow 2.20 — EfficientNet trained on PlantVillage (38 classes)
- **Board:** ESP32 (Arduino) — soil probe, relay + mini pump, WiFiManager setup page

```
Browser ──▶ Next.js app (pages + /api) ──▶ PostgreSQL
                 │   ▲
                 │   └── ESP32 board: readings in, pump commands out (HTTP, device key)
                 └──────▶ AI service (FastAPI, :8001) — leaf image → diagnosis
```

## Project structure

```
src/app/            pages ((app)/…, (auth)/login, register) and API routes (api/…)
src/components/     shared UI
src/lib/            logic: irrigation, plant catalog, device pairing/commands, alerts, Telegram…
prisma/             schema.prisma, migrations/, seed.ts
services/ai/        Python AI service (FastAPI) + trained model in models/
iot/esp32/src/      ESP32 firmware (main.ino, config.example.h)
simulator.js        software ESP32 for testing without hardware
docs/               architecture, feature → code map, testing guide, Telegram
```

---

## Run it locally

### 1. Requirements

| Tool | Version |
|---|---|
| Node.js | 20 or newer (22 recommended) |
| PostgreSQL | 14 or newer |
| Python | 3.10 – 3.13 (for the AI service) |
| arduino-cli *(only for flashing the board)* | with ESP32 core 3.3.x |

On macOS: `brew install node postgresql@16 python@3.13 arduino-cli`, then `brew services start postgresql@16`.

### 2. Install and configure

```bash
npm install
createdb smartagriai
cp .env.example .env
```

Edit `.env`:

- `DATABASE_URL` — e.g. `postgresql://YOUR_MAC_USERNAME@localhost:5432/smartagriai?schema=public`
- `AUTH_SECRET` — a long random value: `openssl rand -base64 32`

Everything else has working defaults. Telegram is **not** configured here — see [Telegram alerts](#telegram-alerts-optional).

### 3. Create the database tables (and optional starter data)

```bash
npm run db:migrate                             # create / update tables
DEMO_PASSWORD=password123 npm run db:seed      # optional starter data
```

The seed creates **sanzida@smartagri.ai** / **password123** with 2 gardens and 2 pots
each (no devices). If that account already exists it changes nothing; to wipe it and
start over use `SEED_RESET=true DEMO_PASSWORD=password123 npm run db:seed`.
Or skip seeding and create your own account on the **Create account** page.

### 4. Start the web app

```bash
npm run dev
```

Open **http://localhost:3000**.

### 5. Start the AI service (for Disease AI) — second terminal

First time only:

```bash
cd services/ai
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt       # TensorFlow + the real model (~1–2 GB download)
```

Every time:

```bash
cd services/ai
.venv/bin/uvicorn app.main:app --port 8001
```

Check it: `curl http://localhost:8001/health` → `"status":"ready"` and `"labels":38`.
The **Disease AI** page also shows a status chip: **AI model ready**, **demo mode**, or
**offline** (with the start command).

- No TensorFlow? `pip install -r requirements-base.txt` instead — the service then
  returns a **demo** diagnosis so the rest of the flow still works.
- The model was trained on crop leaves (tomato, potato, pepper/chili, corn, grape,
  citrus, apple…). For other plants the report says so and treats the result as a
  rough guide.

### 6. Connect a sensor board (optional)

**Wiring (ESP32 dev board)**

| Part | ESP32 pin |
|---|---|
| Soil moisture probe — signal | GPIO 36 (VP) |
| Relay module — IN | GPIO 5 |
| Relay / probe power | 3V3 / 5V and GND as the module requires |
| Pump | through the relay's COM + NO contacts |

**Flash the firmware (once)**

```bash
arduino-cli core install esp32:esp32
arduino-cli lib install "ArduinoJson@7.4.3" "WiFiManager@2.0.17"
cp iot/esp32/src/config.example.h iot/esp32/src/config.h   # adjust relay polarity / probe calibration if needed
mkdir -p /tmp/smartagri_node
cp iot/esp32/src/main.ino /tmp/smartagri_node/smartagri_node.ino
cp iot/esp32/src/config.h /tmp/smartagri_node/
arduino-cli compile --fqbn esp32:esp32:esp32 /tmp/smartagri_node
arduino-cli upload  --fqbn esp32:esp32:esp32:UploadSpeed=115200 -p /dev/cu.usbserial-XXXX /tmp/smartagri_node
```

(`arduino-cli board list` shows the port. Use `UploadSpeed=115200` — the default speed often fails.)

**Add it to your account — no code needed**

1. Power the board. On your phone, join the Wi-Fi **SmartAgri-Setup**.
2. Pick your home Wi-Fi (2.4 GHz) and enter the server address shown in the app,
   e.g. `http://192.168.1.10:3000` (your computer's LAN IP — not `localhost`).
3. In the app: **Sensors → Add device**, then press the board's **BOOT** button when asked.
4. Connect it to a pot (**Connect to a pot** on its card). Readings start within seconds.

Hold **BOOT for 3 s** to reopen the Wi-Fi setup page. From the app (card ⋮ menu) you
can **Restart**, **Reset Wi-Fi**, **Turn off (sleep)** or **Factory reset** the board.
If the board can't reach the app for 60 s it switches the pump off by itself.

**No hardware?** Use the simulator: register a device, then set `DEVICE_ID`,
`DEVICE_KEY` and `POT_IDS` in `.env` (see `.env.example`) and run `npm run simulate`.

### Telegram alerts (optional)

Nothing goes in `.env`. In the app: **Settings → Telegram alerts** → paste a bot token
from **@BotFather** → **Connect bot** → open the bot and press **Start** → **I've pressed
Start** → **Send test message**. Details: [docs/TELEGRAM.md](docs/TELEGRAM.md).

---

## Day-to-day

Two terminals:

```bash
npm run dev                                                     # web app → http://localhost:3000
cd services/ai && .venv/bin/uvicorn app.main:app --port 8001    # AI service
```

After pulling changes that touch `prisma/schema.prisma`: run `npm run db:migrate`,
then **restart `npm run dev`** (the running server keeps the old database client).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Web app in development mode |
| `npm run build` / `npm start` | Production build / server |
| `npm run db:migrate` | Create / update database tables |
| `npm run db:seed` | Starter data (see step 3) |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run simulate` | Software ESP32 (no hardware needed) |
| `npm run telegram:worker` | Send queued Telegram alerts once (for cron jobs) |
| `npm test` | All tests |
| `npm run lint` · `npm run typecheck` | Lint · TypeScript check |

## Troubleshooting

| Problem | Fix |
|---|---|
| Disease AI shows **AI service offline** | Start the AI service (step 5) and press **Check again**. |
| API errors / `500` right after a database change | `npm run db:migrate`, then restart `npm run dev`. |
| `P1010` / can't connect to the database | Check `DATABASE_URL` (user name, database exists, Postgres running). |
| Board never appears in **Add device** | Server address on the setup page must be your computer's LAN IP + `:3000`, on the same Wi-Fi. |
| Board online but no readings | It isn't connected to a pot yet — use **Connect to a pot** on its card. |
| Upload to the board fails | Add `:UploadSpeed=115200` to the FQBN; hold BOOT while it starts uploading. |

## More docs

- [docs/RUN_AND_TEST.md](docs/RUN_AND_TEST.md) — testing each feature, API examples
- [docs/FEATURE_MAP.md](docs/FEATURE_MAP.md) — where each feature lives in the code
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — design and data model
- [docs/TELEGRAM.md](docs/TELEGRAM.md) — Telegram alerts
