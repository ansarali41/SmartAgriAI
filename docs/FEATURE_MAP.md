# SmartAgri — Feature → Code Map

"Where is each task done?" Most files carry a `// TASK:` / `// PAGE:` header
comment; this table is the index. Paths are under `src/` unless noted.

## Features

### 🔬 Leaf disease detection (leaf doctor)
| Layer | File |
|---|---|
| UI page | `app/(app)/disease-detection/page.tsx` |
| Report (diagnosis, first steps, home remedies) | `components/DiagnosisReport.tsx` |
| Home-remedy knowledge base | `lib/home-remedies.ts` |
| API (analyze) | `app/api/disease-detection/analyze/route.ts` |
| API (history list / one report / image) | `app/api/disease-detection/reports/route.ts`, `reports/[id]/route.ts`, `images/[id]/route.ts` |
| API (AI service status) | `app/api/disease-detection/health/route.ts` |
| AI bridge | `lib/ai.ts` |
| AI microservice | `services/ai/app/main.py`, `services/ai/app/treatments.py` |
| Trained model | `services/ai/models/` |

### 🌡️ Soil moisture monitoring
| Layer | File |
|---|---|
| Ingestion (board → server) | `app/api/iot/ingest/route.ts` |
| Choosing the pot for a reading | `lib/device-pot.ts` |
| Device list / edit / remote actions | `app/api/devices/route.ts`, `devices/[id]/route.ts`, `devices/[id]/action/route.ts`, `lib/device-actions.ts` |
| Pairing a new board (Wi-Fi + BOOT button) | `app/api/iot/pair/route.ts`, `app/api/devices/pairing/route.ts`, `lib/device-pairing.ts`, `lib/device-claim.ts`, `components/AddDeviceGuide.tsx` |
| Device key hashing / auth | `lib/device-key.ts`, `lib/device-auth.ts` |
| Online / delayed / offline | `lib/device-status.ts`, `lib/device-monitoring.ts` |
| UI | `app/(app)/sensors/page.tsx`, pot cards on Pots / garden pages |
| Firmware | `iot/esp32/src/main.ino`; simulator `simulator.js` (`npm run simulate`) |

### 💧 Automatic irrigation (per pot)
| Layer | File |
|---|---|
| Decision logic (pure) | `lib/irrigation.ts` |
| Runs on each reading | `app/api/iot/ingest/route.ts` |
| Mode & watering levels | `app/api/pots/[id]/irrigation/route.ts` |
| Manual pump on/off | `app/api/pots/[id]/pump/route.ts` |
| Command queue to the board | `lib/device-commands.ts`, `app/api/iot/commands/route.ts` |
| Watering history | `app/api/irrigation/logs/route.ts` |
| UI page | `app/(app)/irrigation/page.tsx` |

### 🪴 Gardens, pots & plants
| Layer | File |
|---|---|
| Gardens (+ cards with alerts) | `app/api/gardens/route.ts`, `gardens/[id]/route.ts`, `gardens/overview/route.ts`, `app/(app)/gardens/**` |
| Garden details (live pots, weather, alerts) | `app/api/gardens/[id]/dashboard/route.ts`, `lib/garden-alerts.ts`, `lib/garden-alerts-server.ts` |
| Add pot + plant (+ sensor) | `app/api/gardens/[id]/plantings/route.ts`, `components/GardenSetupPanels.tsx` |
| Pot serial numbers (POT-1, POT-2…) | `lib/pot-number.ts` |
| Plant guide (86 plants, Bangla names) | `lib/plant-catalog.ts` |
| Pots / plants | `app/api/pots/**`, `app/api/plants/**`, `app/(app)/pots`, `app/(app)/plants` |
| Location search | `app/api/geocode/route.ts`, `components/LocationPicker.tsx` |

### 📊 Analytics & export
| Layer | File |
|---|---|
| Charts data (bucketed, summary) | `app/api/analytics/pot/route.ts`, `lib/pot-analytics-overview.ts` |
| Excel export (raw rows) | `app/api/export/pot-analytics/route.ts`, `lib/pot-analytics.ts` |
| UI page | `app/(app)/analytics/page.tsx`, `components/DatePicker.tsx` |

### 🧠 Soil & environmental recommendations (proposal feature 4)
| Layer | File |
|---|---|
| Rules engine (pure) | `lib/recommendations.ts` |
| API | `app/api/recommendations/route.ts` (not shown in the UI yet) |
| Per-plant soil & watering suggestions | `lib/plant-catalog.ts` (used when adding a pot) |

### ❤️ Crop health score (proposal feature 5)
| Layer | File |
|---|---|
| Formula (pure) | `lib/health-score.ts` |
| API | `app/api/health-score/route.ts` (not shown in the UI yet) |

### 🌦️ Weather
| Layer | File |
|---|---|
| Provider logic | `lib/weather.ts` |
| Saved history (for analytics) | `lib/weather-history.ts` |
| Shown on | garden details + dashboard (via `gardens/[id]/dashboard`) |

### 🔔 Notifications & Telegram
| Layer | File |
|---|---|
| In-app notifications (bell) | `app/api/notifications/route.ts`, `lib/notify.ts`, `lib/app-notifications.ts` |
| Telegram queue & sender | `lib/telegram-outbox.ts`, `lib/telegram-delivery-enqueue.ts`, `lib/telegram.ts` |
| Per-user bot (encrypted token) | `lib/telegram-settings.ts`, `lib/secret-box.ts`, `app/api/telegram/**` |
| Scheduled sender | `app/api/cron/telegram-deliveries/route.ts`, `scripts/telegram-delivery-worker.ts` |
| UI | Settings → Telegram alerts |

## Foundations

| Task | File(s) |
|---|---|
| Database schema | `prisma/schema.prisma` |
| Starter seed data | `prisma/seed.ts` |
| Prisma client singleton | `lib/db.ts` |
| Auth core (Credentials + JWT) | `src/auth.ts`, `app/api/auth/[...nextauth]/route.ts` |
| Registration | `app/api/auth/register/route.ts` |
| Password hashing (scrypt) | `lib/password.ts` |
| Route auth helper (`requireUser`) | `lib/api-auth.ts` |
| Login / Register pages | `app/(auth)/**`, `components/AuthShell.tsx`, `components/AuthFields.tsx` |
| Profile & password | `app/api/profile/route.ts`, `app/(app)/settings/page.tsx` |
| Shared UI | `components/{ui,Sidebar,Topbar,AppShell,Providers,Feedback,SlideOver,SearchList,GardenPicker,PotPicker}.tsx` |
| Home page | `app/page.tsx`, `components/LandingNavigation.tsx` |
