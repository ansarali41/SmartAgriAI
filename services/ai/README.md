---
title: SmartAgri Leaf Doctor
emoji: 🌱
colorFrom: green
colorTo: blue
sdk: docker
app_port: 8001
pinned: false
---

# SmartAgri — leaf disease detection service

FastAPI + TensorFlow service used by the SmartAgri web app's **Disease AI** page.
EfficientNet trained on PlantVillage (38 classes).

- `GET /health` — `{"status":"ready","labels":38,...}` when the model is loaded.
- `POST /predict` — multipart `file` (leaf image) → diagnosis, confidence, treatment.
  Optional field `crop` (e.g. `tomato`): only that crop's classes are considered — the
  app sends the pot's plant. The photo is fixed for phone rotation and read as 6 views
  (whole photo, centre, close-up, each mirrored) whose results are averaged.
  Extra response fields: `alternatives` (next likely answers), `uncertain` (low
  confidence, close runner-up, or the photo doesn't look like the crop), `lookedLike`
  (crop the photo resembled), `cropMatch` (0–1), `restrictedTo`.
  Tunable with env `UNSURE_BELOW` (0.55), `UNSURE_MARGIN` (0.15), `CROP_MATCH_MIN` (0.35).
  If the `AI_SERVICE_TOKEN` secret is set, requests must send the same value in an
  `x-ai-token` header (the web app does this when its `AI_SERVICE_TOKEN` matches).

Run locally:

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8001
```

This folder can be pushed as-is to a Hugging Face **Docker Space** (see the main
project's `docs/DEPLOY.md`).
