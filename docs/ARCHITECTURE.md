# SmartAgri — Architecture & Merge Mapping

## Why this exists

Three cloned projects were merged into one unified app per the CSE-4000 proposal.
Each source contributed a different layer:

| Source project | Role | What was harvested |
|---|---|---|
| **smartagriai-main** | Backbone | Feature set, UI design language (Tailwind), API/service shapes, FastAPI AI service, weather + health-score + irrigation logic |
| **SmartGarden-main** | AI assets | Trained Keras model `mon_modeleDeepLearning.h5` (→ `services/ai/models/plant_disease_model.h5`), PlantVillage classes, per-plant threshold concept |
| **smart-garden-iot-main** | IoT layer | ESP32/relay/pump hardware pattern, sensor aggregation, `PUMP_ON` control loop |

The original stacks (Angular/Flask/MySQL, React Native/Express/MongoDB,
React/Vite/Express/MongoDB) were consolidated to the **target stack**:
Next.js (App Router) full-stack + Tailwind + PostgreSQL/Prisma + FastAPI AI + ESP32.

## Component layout

```
smartagriai/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/{login,register}          # Auth.js credential pages
│  │  ├─ (app)/{dashboard,gardens,pots,plants,disease-detection,
│  │  │         irrigation,sensors,analytics,notifications,settings}
│  │  └─ api/                              # backend route handlers (see below)
│  ├─ auth.ts                             # NextAuth config (Credentials + JWT)
│  ├─ components/                         # Sidebar, Topbar, ui, SeriesChart, Providers
│  ├─ lib/                                # pure logic: weather, irrigation, health-score,
│  │                                      #   recommendations, ai, device-key, password
│  └─ server/readings.ts                  # latest-reading queries
├─ prisma/{schema.prisma, seed.ts}        # PostgreSQL schema + demo seed
├─ services/ai/                           # FastAPI + TensorFlow + trained model
├─ iot/esp32/src/main.ino                 # ESP32 firmware
└─ scripts/simulate.ts                    # sensor simulator
```

## Data model (PostgreSQL via Prisma)

The two parallel data models in smartagriai-main (a normalized
Garden→Pot→Plant→Device→Reading model **and** a legacy flat
`SensorLog`/`Prediction`/embedded-`user.irrigation` model) were collapsed into
one normalized schema:

- **User** → **Garden** → **Pot** → **Plant** (with optional **PlantThreshold**)
- **Device** (merges legacy `Sensor` + `IotDevice`; holds a hashed `apiKey`)
- **Reading** (merges `SensorReading` + `IotReading` + IoT-project log fields)
- **DiseaseReport** (folds in legacy `Prediction.healthScoreContribution`)
- **IrrigationEvent** (merges `WateringLog` + `IrrigationLog`)
- **IrrigationConfig** (replaces embedded `user.irrigation`)
- **Schedule**, **Notification** (merges `Alert`), **Task**

## Feature → implementation map

| Feature | Route(s) | Logic | Source |
|---|---|---|---|
| Disease detection | `POST /api/disease-detection/analyze`, `GET …/reports` | `lib/ai.ts` → FastAPI `/predict` → `DiseaseReport` | smartagriai controller + SmartGarden `.h5` |
| Soil monitoring | `POST /api/iot/ingest`, `GET /api/sensor-readings/latest` | normalize moisture → `Reading` | ESP32 firmware + smartagriai iotService |
| Auto irrigation | inside `/api/iot/ingest`, `/api/irrigation/{control,threshold,logs}` | `lib/irrigation.ts` (threshold + schedule + manual override + rain-skip) | smartagriai farmController + IoT relay |
| Recommendations | `GET /api/recommendations` | `lib/recommendations.ts` vs `PlantThreshold` | PlantThreshold concept |
| Health score | `GET /api/health-score` | `lib/health-score.ts` (env + disease) | smartagriai `getHealthScore` |
| Weather | `GET /api/weather` | `lib/weather.ts` (OWM → Open-Meteo) | smartagriai weatherController |

## Request flows

**Sensor ingest + auto-irrigation**
```
ESP32 ──POST /api/iot/ingest (x-device-key)──▶ verify device → write Reading rows
   └─ decideIrrigation(moisture, threshold, schedules, weather.rainProb)
        └─ if changed: update IrrigationConfig + log IrrigationEvent
   ◀── { pump: "on"|"off", reason } ── ESP32 actuates relay (watchdog max 4.5s)
```

**Disease detection**
```
Dashboard ──multipart──▶ /api/disease-detection/analyze
   └─ lib/ai.ts ──FormData──▶ FastAPI /predict (TensorFlow or mock)
        └─ persist DiseaseReport (+ healthScoreContribution)
            └─ next /api/health-score call folds the contribution into the score
```

## Key design decisions

- **HTTP ingest over MQTT** — no broker; the pump command rides the ingest response. Simple and serverless-friendly.
- **Polling over WebSockets** — data aggregates slowly; SWR `refreshInterval` needs zero infra.
- **Auth via server-component `auth()` gate** — `(app)/layout.tsx` redirects unauthenticated users; API routes call `requireUser()` (replaces Express `requireAuth`). Next.js 16 renamed middleware → proxy, so route protection is done in the layout, not middleware.
- **Rain-aware irrigation** — `lib/irrigation.ts` skips watering when rain probability ≥ 70%, a cross-feature win between weather and irrigation.
- **Resilient AI service** — loads the trained `.h5` when TensorFlow is present, else serves a structured mock so the pipeline always works (useful when TF can't install, e.g. Python 3.13).

## Next.js 16 notes
- `params`, `cookies`, `headers` are async (awaited) in route handlers and pages.
- Built with Turbopack by default.
