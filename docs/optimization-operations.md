# Optimization and Operations Guide

## Runtime health

The Flask service exposes `/health/live` for process liveness and `/health/ready` for dependency readiness. A readiness response is HTTP 200 only when the detector and database are initialized and shutdown has not started. The existing `/health` endpoint remains backward compatible.

## Configuration

Copy `ayam-counter-web/.env.example` and set a non-default `SECRET_KEY` in production. Restrict `CORS_ORIGINS` to the dashboard origin. Tune `HISTORY_MAX_LIMIT`, `REQUEST_TIMEOUT_SECONDS`, `PIN_MAX_ATTEMPTS`, `PIN_LOCK_SECONDS`, and reconnect bounds for the deployment. Never commit real credentials or camera URLs.

## Data and performance

SQLite uses WAL mode, a busy timeout, and additive indexes for session start time, date, and detection session IDs. History requests are bounded and support `limit`, `offset`, and `search`; clients should paginate instead of requesting unbounded history. The dashboard uses Socket.IO for realtime statistics and falls back to bounded REST polling without overlapping requests.

## Camera lifecycle

The capture worker uses a bounded latest-frame queue. Camera failures should be observed through device status and readiness telemetry; the worker reconnects without growing memory. Validate a source before switching it in production and release camera resources during shutdown.

## Verification

```bash
cd ayam-counter-web
python -m py_compile app/app.py
python -m pytest -q
cd ..
npx tsc --noEmit
npm run lint
npm run build
```

When hardware is unavailable, document the exact limitation and still run deterministic route, validation, export path, and frontend browser smoke checks.

## Rollback

The changes are additive. Roll back the application branch while preserving the SQLite file; WAL and indexes are compatible with the existing schema. Restore previous environment values only when required by the deployment, and verify `/health/live` and `/health/ready` after rollback.

_Last reviewed: 2026-09-08._
