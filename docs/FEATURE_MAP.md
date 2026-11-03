# SmartAgri — Feature → Code Map

"Where is each task done?" Every file carries a `// TASK:` / `// PAGE:` header
comment; this table is the index. Paths are under `src/` unless noted.

## The 6 proposal features

### Feature 1 — 🔬 Leaf Disease Detection
| Layer | File |
|---|---|
| UI page | `app/(app)/disease-detection/page.tsx` |
| API (analyze) | `app/api/disease-detection/analyze/route.ts` |
| API (history) | `app/api/disease-detection/reports/route.ts` |
| AI bridge | `lib/ai.ts` |
| AI microservice | `services/ai/app/main.py`, `services/ai/app/treatments.py` |
| Trained model | `services/ai/models/plant_disease_model.h5` + `labels.json` |

### Feature 2 — 🌡️ Soil Moisture Monitoring
| Layer | File |
|---|---|
| Ingestion (write) | `app/api/iot/ingest/route.ts` |
| Latest + series (read) | `app/api/sensor-readings/latest/route.ts` |
| Query helper | `server/readings.ts` |
| Device registration | `app/api/devices/route.ts`, `app/(app)/sensors/page.tsx` |
| Device key hashing | `lib/device-key.ts` |
| Charts | `components/SeriesChart.tsx`, dashboard/analytics pages |
| Firmware | `iot/esp32/src/main.ino`; simulator `scripts/simulate.ts` |

### Feature 3 — 💧 Automatic Irrigation
| Layer | File |
|---|---|
| Decision logic (pure) | `lib/irrigation.ts` |
| Runs on each reading | `app/api/iot/ingest/route.ts` |
| Manual override / state | `app/api/irrigation/control/route.ts` |
| Threshold | `app/api/irrigation/threshold/route.ts` |
| Event history | `app/api/irrigation/logs/route.ts` |
| Schedules | `app/api/schedules/route.ts` |
| UI page | `app/(app)/irrigation/page.tsx` |

### Feature 4 — 🧠 Soil & Environmental Recommendations
| Layer | File |
|---|---|
| Rules engine (pure) | `lib/recommendations.ts` |
| API | `app/api/recommendations/route.ts` |
| UI | Dashboard "Recommendations" card |

### Feature 5 — 📊 Crop Health Score
| Layer | File |
|---|---|
| Formula (pure) | `lib/health-score.ts` |
| API | `app/api/health-score/route.ts` |
| UI | Dashboard health gauge |

### Feature 6 — 🌦️ Live Weather
| Layer | File |
|---|---|
| Provider logic (pure) | `lib/weather.ts` |
| API | `app/api/weather/route.ts` |
| UI | Dashboard "Live Weather" card |
| Location setting | `app/api/profile/route.ts`, `app/(app)/settings/page.tsx` |

## Foundations & supporting tasks

| Task | File(s) |
|---|---|
| Database schema | `prisma/schema.prisma` |
| Demo seed data | `prisma/seed.ts` |
| Prisma client singleton | `lib/db.ts` |
| Auth core (Credentials + JWT) | `src/auth.ts`, `app/api/auth/[...nextauth]/route.ts` |
| Registration | `app/api/auth/register/route.ts` |
| Password hashing (scrypt) | `lib/password.ts` |
| Route auth helper (`requireUser`) | `lib/api-auth.ts` |
| Protected layout / auth gate | `app/(app)/layout.tsx` |
| Login / Register pages | `app/(auth)/login/*`, `app/(auth)/register/*` |
| Gardens / Pots / Plants CRUD | `app/api/{gardens,pots,plants}/**`, matching pages |
| Dashboard stats | `app/api/dashboard/stats/route.ts` |
| Notifications | `app/api/notifications/route.ts`, notifications page |
| CSV export | `app/api/export/{sensors,irrigation}/route.ts`, analytics page |
| Shared UI / providers | `components/{ui,Sidebar,Topbar,Providers,SeriesChart}.tsx` |
| Defaults / thresholds | `lib/defaults.ts` |

## Source-project provenance
- **smartagriai-main** → backbone: UI design, API/service shapes, weather/health/irrigation logic, FastAPI service.
- **SmartGarden-main** → `services/ai/models/plant_disease_model.h5` (+ treatment knowledge, per-plant thresholds).
- **smart-garden-iot-main** → ESP32 relay/pump pattern in `iot/esp32/src/main.ino` and the ingest→pump-command loop.
