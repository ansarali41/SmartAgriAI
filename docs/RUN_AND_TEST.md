# SmartAgri — Run & Test Guide

A step-by-step guide to running the project locally and testing every one of the
six proposal features (both through the **UI** and via **API/curl**).

---

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| PostgreSQL | 14+ (running) | `pg_isready` |
| Python | 3.10+ (3.10–3.12 to load the real TF model) | `python3 --version` |

> macOS (Homebrew): `brew install postgresql@16 && brew services start postgresql@16`

---

## 2. First-time setup

```bash
cd smartagriai

# 2.1 Create the database
createdb smartagriai

# 2.2 Configure environment
cp .env.example .env.development
# Edit .env.development:
#   DATABASE_URL="postgresql://<your-username>@localhost:5432/smartagriai?schema=public"
#   AUTH_SECRET="<run: openssl rand -base64 32>"

# 2.3 Install dependencies
npm install

# 2.4 Create the schema + seed demo data
npm run db:migrate     # applies Prisma migrations
npm run db:seed        # demo user, garden, pot, plant, device, sample readings
```

The seed prints the demo credentials:

```
Login:        sanzida@smartagri.ai / password123
Device key:   sk_dev_demo_esp32_key_0001
Hardware ID:  esp32-001
```

---

## 3. Run the three processes

Open **three terminals**.

### Terminal 1 — Next.js app (frontend + backend API)
```bash
cd smartagriai
npm run dev
# → http://localhost:3000   (use another port if 3000 is busy: PORT=3100 npm run dev)
```

### Terminal 2 — AI disease-detection microservice (FastAPI)
```bash
cd smartagriai/services/ai
python3 -m venv .venv && source .venv/bin/activate

# Install with the REAL trained model (TensorFlow). Verified on Python 3.10–3.13.
pip install -r requirements.txt

# (Lighter alternative — runs the realistic MOCK predictor, no TensorFlow:
#  pip install -r requirements-base.txt )

uvicorn app.main:app --port 8001
```

> **`http://localhost:8001/` returns `{"detail":"Not Found"}` — that is normal.**
> The service has no `/` route. Use the real endpoints:

Confirm it's up — check **`/health`** (not `/`):
```bash
curl http://localhost:8001/health
```
- `{"status":"ready","labels":3}` → **trained model loaded** (real TensorFlow inference)
- `{"status":"missing_model",...}` → mock fallback active (install `requirements.txt`)

The input image size (255×255 for this model) and class count are auto-detected
from the model, and `models/labels.json` maps class indices to names.

### Terminal 3 — Sensor data (pick one)
```bash
# Option A: software simulator (acts like the ESP32)
cd smartagriai
npm run simulate
# If the app runs on a non-default port:
#   BASE_URL=http://localhost:3100 npm run simulate

# Option B: real hardware — flash iot/esp32/src/main.ino after editing
#   WIFI_SSID / WIFI_PASSWORD, INGEST_URL (your machine's LAN IP), DEVICE_KEY.
```

Then open **http://localhost:3000**, click **Sign in**, and use
`sanzida@smartagri.ai` / `password123`.

---

## 4. Testing each feature (UI)

> Keep the simulator (Terminal 3) running so the dashboard shows live data.

### Feature 1 — 🔬 Leaf Disease Detection
1. Sidebar → **Disease AI**.
2. Click the upload box, choose a leaf image
   (e.g. `../SmartGarden-main/DL_images_test/test6.JPG`).
3. Click **Analyze leaf**.
4. Expect: disease name, crop, confidence %, severity badge, symptoms, and a
   four-part treatment plan (Immediate / Organic / Chemical / Prevention).
5. The diagnosis appears under **Recent diagnoses** and is saved to the DB.

### Feature 2 — 🌡️ Soil Moisture Monitoring
1. Sidebar → **Dashboard**.
2. Watch the **Soil Moisture / Temperature / Humidity** tiles and the three live
   charts update every ~5s as the simulator posts readings.

### Feature 3 — 💧 Automatic Irrigation
1. Sidebar → **Irrigation**.
2. **Threshold:** drag the slider (e.g. to 50%) → **Save threshold**.
3. With the simulator running, when moisture drops below the threshold the
   **Pump** flips to **ON** and an entry appears in **Irrigation history** with a
   reason. (If live weather rain probability ≥ 70%, it intentionally **skips**
   watering — the reason explains this.)
4. **Manual override:** click **Turn on** / **Turn off** — the pump obeys you and
   the badge shows "Manual override". Click **Back to auto** to resume automation.

### Feature 4 — 🧠 Soil & Environmental Recommendations
1. Sidebar → **Dashboard** → **Recommendations** card.
2. Expect actionable advice driven by the latest readings vs. ideal ranges
   (e.g. "Soil is dry (15%). Irrigate now…", high-humidity disease warnings,
   rain advisories). Severity is colour-coded.

### Feature 5 — 📊 Crop Health Score
1. **Dashboard** → **Crop Health Score** gauge (0–100).
2. It combines moisture, temperature, humidity, and the latest disease result.
3. To see it react: run a disease analysis (Feature 1) with a diseased leaf —
   the score drops on the next refresh as the disease contribution flows in.

### Feature 6 — 🌦️ Live Weather
1. **Dashboard** → **Live Weather** card shows current temperature, condition,
   rain probability, humidity, and wind for your location.
2. Set your coordinates in **Settings** (Latitude / Longitude) to localize it.

### Extras
- **Gardens / Pots / Plants** — create and delete records; counts update.
- **Devices** — register a device; the **device key is shown once** (use it on the
  ESP32). "Last seen" updates as the device posts (seconds under a minute). Status:
  **Online** within 45 s of the last report, **Delayed** 45–90 s, **Offline** after 90 s
  (`DEVICE_STALE_THRESHOLD_SECONDS` / `DEVICE_OFFLINE_THRESHOLD_SECONDS`). To test:
  unplug the board — Delayed after ~45 s, Offline (with an alert) after ~90 s.
- **Analytics** — historical charts + **Sensors CSV** / **Irrigation CSV** export.
- **Notifications** — list, mark one / all as read.
- **Settings** — edit farm profile and weather location.

---

## 5. Testing each feature (API / curl)

### 5.1 Public endpoints (no auth)

**IoT ingest + auto-irrigation** (uses the device key, not a login):
```bash
# Low moisture -> pump decision returned in the response
curl -X POST http://localhost:3000/api/iot/ingest \
  -H "Content-Type: application/json" \
  -H "x-device-key: sk_dev_demo_esp32_key_0001" \
  -d '{"hardwareId":"esp32-001","readings":{"soil_moisture":15,"temperature":31,"humidity":40}}'
# → {"success":true,"pump":"on"|"off","reason":"..."}

# Wrong key is rejected
curl -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/iot/ingest \
  -H "x-device-key: wrong" -H "Content-Type: application/json" \
  -d '{"hardwareId":"esp32-001","readings":{"soil_moisture":15}}'
# → 401
```

### 5.2 Authenticated endpoints

Log in once and reuse the cookie jar:

```bash
JAR=/tmp/sa_cookies.txt; rm -f $JAR
CSRF=$(curl -s -c $JAR http://localhost:3000/api/auth/csrf \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl -s -b $JAR -c $JAR -X POST http://localhost:3000/api/auth/callback/credentials \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=sanzida@smartagri.ai" \
  --data-urlencode "password=password123" -o /dev/null
curl -s -b $JAR http://localhost:3000/api/auth/session   # confirm logged in
```

Now exercise the features:

```bash
# Gardens, pots and one garden's live view (moisture, weather, alerts)
curl -s -b $JAR http://localhost:3000/api/gardens
curl -s -b $JAR http://localhost:3000/api/pots
curl -s -b $JAR http://localhost:3000/api/gardens/<GARDEN_ID>/dashboard

# Disease detection (the pot must have a plant; the AI service must be running)
curl -s -b $JAR -X POST http://localhost:3000/api/disease-detection/analyze \
  -F "file=@leaf.jpg" -F "gardenId=<GARDEN_ID>" -F "potId=<POT_ID>"
curl -s -b $JAR "http://localhost:3000/api/disease-detection/reports?limit=5"

# Irrigation for one pot: mode + watering levels, manual pump, history
curl -s -b $JAR -X PATCH http://localhost:3000/api/pots/<POT_ID>/irrigation \
  -H "Content-Type: application/json" \
  -d '{"irrigationMode":"AUTO","moistureOnThreshold":40,"moistureOffThreshold":70}'
curl -s -b $JAR -X POST http://localhost:3000/api/pots/<POT_ID>/pump \
  -H "Content-Type: application/json" -d '{"pumpState":"on"}'   # manual mode only
curl -s -b $JAR "http://localhost:3000/api/irrigation/logs?potId=<POT_ID>&limit=10"

# Analytics + Excel export for one pot
curl -s -b $JAR "http://localhost:3000/api/analytics/pot?gardenId=<GARDEN_ID>&potId=<POT_ID>&range=7d"
curl -s -b $JAR "http://localhost:3000/api/export/pot-analytics?gardenId=<GARDEN_ID>&potId=<POT_ID>&range=7d" -o pot.xlsx

# Notifications
curl -s -b $JAR http://localhost:3000/api/notifications

# CRUD example
curl -s -b $JAR -X POST http://localhost:3000/api/gardens \
  -H "Content-Type: application/json" -d '{"name":"South Plot","type":"greenhouse"}'
```

---

## 6. End-to-end demo flow (the "story" for a viva)

1. **Simulator running** → Dashboard tiles + charts update live (Feature 2).
2. Lower the **threshold** until moisture is below it → **Pump turns ON**,
   logged with a reason (Feature 3); if rain is likely it explains the skip.
3. **Recommendations** card flags the dry soil (Feature 4).
4. Upload a diseased leaf in **Disease AI** → diagnosis + treatment (Feature 1).
5. Back on the Dashboard, the **Crop Health Score** drops as the disease is
   folded in (Feature 5), alongside **Live Weather** (Feature 6).

---

## 7. Inspecting / resetting data

```bash
npm run db:studio     # visual DB browser (Prisma Studio)
npm run db:seed       # re-seed (wipes & recreates the demo user's data)
```

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `EADDRINUSE :3000` | Another app is on 3000 → `PORT=3100 npm run dev` (and pass `BASE_URL=http://localhost:3100` to the simulator). |
| Disease analysis returns 502 | The AI service (Terminal 2) isn't running, or `AI_SERVICE_URL` in `.env.development` is wrong. |
| `http://localhost:8001/` → `{"detail":"Not Found"}` | Normal — there is no `/` route. Check `http://localhost:8001/health` and POST to `/predict`. |
| AI `/health` shows `missing_model` | TensorFlow isn't installed — run `pip install -r requirements.txt` in `services/ai` (TF 2.20 works on Python 3.10–3.13), then restart `uvicorn`. The mock still returns full results until then. |
| Weather shows fallback data | No `OPENWEATHER_API_KEY` set → it uses the free Open-Meteo API. Add a key to `.env.development` for OpenWeatherMap. |
| `Can't reach database server` | PostgreSQL isn't running (`pg_isready`) or `DATABASE_URL` is wrong. |
| Login fails | Re-run `npm run db:seed`; ensure `AUTH_SECRET` is set in `.env.development`. |
