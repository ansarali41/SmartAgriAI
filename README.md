# SmartAgri

**AI-Driven IoT Framework for Crop Health Prediction and Smart Irrigation Management.**

A unified merge of three source projects (`smartagriai-main`, `SmartGarden-main`,
`smart-garden-iot-main`) into one Next.js full-stack application with a Python
AI microservice and ESP32 firmware, delivering the six features of the CSE-4000
proposal:

1. 🔬 **Leaf disease detection** — upload a leaf image → AI diagnosis + treatment plan
2. 🌡️ **Soil moisture monitoring** — live ESP32 sensor readings (moisture, temp, humidity)
3. 💧 **Automatic irrigation** — pump auto-activates below a moisture threshold (with manual override + rain-aware skipping)
4. 🧠 **Soil & environmental recommendations** — rules engine vs. per-plant thresholds
5. 📊 **Crop health score (0–100)** — combines environment + latest disease diagnosis
6. 🌦️ **Live weather** — OpenWeatherMap (with keyless Open-Meteo fallback)

## Architecture

```
apps/web (Next.js App Router)          services/ai (FastAPI + TensorFlow)
  ├─ frontend (Tailwind, SWR polling)     ├─ /predict  (leaf image → disease)
  ├─ API routes  ── HTTP ──────────────▶  └─ trained .h5 model (+ mock fallback)
  ├─ Prisma  ── ▶  PostgreSQL
  └─ /api/iot/ingest  ◀── HTTP (device key) ── iot/esp32 firmware
```

- **Frontend + backend:** Next.js 16 (App Router) + Tailwind CSS 4
- **Database:** PostgreSQL via Prisma 6
- **Auth:** Auth.js (NextAuth v5) Credentials + JWT session
- **AI:** FastAPI + TensorFlow (Keras `.h5` from SmartGarden), mock fallback when TF is unavailable
- **IoT:** ESP32 over WiFi → HTTP POST → auto-irrigation command in the response
- **Real-time:** dashboard polling (SWR `refreshInterval`)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design and the
merge mapping from the three source projects.

## Quick start

### 1. Prerequisites
- Node.js 18+, PostgreSQL 14+, Python 3.10+ (3.10–3.12 to load the real TF model)

### 2. Database + app
```bash
createdb smartagriai
cp .env.example .env          # edit DATABASE_URL + AUTH_SECRET
npm install
npm run db:migrate            # apply schema
npm run db:seed               # demo user + device + sample readings
npm run dev                   # http://localhost:3000
```
Demo login: **demo@smartagri.ai** / **password123**

### 3. AI microservice (separate terminal)
```bash
cd services/ai
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt    # real model (TensorFlow 2.20, Python 3.10–3.13)
# Lighter: pip install -r requirements-base.txt  # mock predictor, no TensorFlow
uvicorn app.main:app --port 8001
```
Verify with `curl http://localhost:8001/health` → `{"status":"ready","labels":3}`.
(`http://localhost:8001/` has no route and returns `Not Found` — expected.)

The trained model (`models/plant_disease_model.h5` + `labels.json`) loads
automatically; input size and class count are auto-detected. Without TensorFlow
the service serves a realistic mock so the full pipeline still works.

### 4. Feed sensor data
- **Simulator:** set `DEVICE_ID` to the registered `hardwareId`, `DEVICE_KEY` to
  its one-time registration key, and `POT_IDS` to comma-separated database Pot
  IDs from that device's garden; then run `npm run simulate`.
- **Real hardware:** flash `iot/esp32/src/main.ino` after setting WiFi creds, the
  backend URL, and the device key shown when you register a device (Sensors page).

## Scripts
| Command | Purpose |
|---|---|
| `npm run dev` / `npm start` | Next.js dev / production server |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Prisma Studio (DB admin UI) |
| `npm run telegram:worker` | One-shot, bounded Telegram outbox worker (safe for existing due `PENDING` rows) |
| `npm run simulate` | Run the ESP32 sensor simulator |

## Verifying the features
With the app + AI service running and data seeded:
- **Dashboard** shows live tiles, health gauge, weather, recommendations.
- **Disease AI** — upload `SmartGarden-main/DL_images_test/*.JPG` → diagnosis + treatment; the crop health score drops accordingly.
- **Irrigation** — toggle the pump / move the threshold; the simulator's `pump` response reflects it.
- **Analytics** — sensor charts + CSV export.
