# Backend guide (dev team)

## What this is

PostgreSQL-backed FastAPI service for **OpenAgriNet Report Center**.

- **Out-of-the-box reports** — the 43 Figma Report Library reports are seeded as `is_system=true` rows (definitions + widget layouts + Postman chart keys). No fabricated KPI numbers are stored.
- **Live data** — chart payloads are fetched from upstream services configured via `UPSTREAM_*_BASE_URL` (contracts in `/postman`).
- **Dynamic reports** — `POST /api/reports` creates custom reports; `PATCH /api/reports/{id}` edits **system or custom** reports (widgets, field mapping, endpoints). `POST /api/reports/{id}/reset` restores a system report to its seed snapshot.

## Quick start (Docker)

```bash
cp .env.example .env
# set UPSTREAM_* when services are ready
docker compose up --build
```

API: http://localhost:8000/api/health  
OpenAPI: http://localhost:8000/docs

## Quick start (local Python + existing Postgres)

```bash
cp .env.example .env
# DATABASE_URL=postgresql+psycopg2://USER:PASS@HOST:5432/oan_reports
cd backend
pip install -r requirements.txt
set PYTHONPATH=.
uvicorn app.main:app --reload --port 8000
```

On first boot the API creates tables and seeds the Figma catalog.

## Key endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness + which upstreams are configured |
| GET | `/api/categories` | Category list + report counts |
| GET | `/api/categories/{id}/summary` | Library KPI strip (from upstream KPI chart) |
| GET | `/api/reports` | Catalog (`?category=&q=`) |
| GET | `/api/reports/{id}` | One report definition |
| GET | `/api/reports/{id}/data` | Definition + widget specs built from upstream data |
| POST | `/api/reports` | Create custom report |
| PATCH | `/api/reports/{id}` | Edit system or custom report |
| DELETE | `/api/reports/{id}` | Delete custom / soft-hide system |
| POST | `/api/reports/{id}/reset` | Restore system report seed |
| GET/PUT | `/api/settings` | UI + map settings |
| GET/PUT | `/api/schedules` | Delivery schedules |
| GET | `/api/v1/charts/{key}?service=` | Direct upstream chart proxy |

## Upstream wiring

Match Postman bases:

- `UPSTREAM_A2C_BASE_URL` → A2C Dashboard Service  
- `UPSTREAM_GRIEVANCE_BASE_URL` → Grievance Dashboard Service  
- `UPSTREAM_FARMER_BASE_URL` / `LIVESTOCK` / `CROP` → Registry Dashboard APIs  
- `UPSTREAM_GATEWAY_BASE_URL` → OAN Dashboards gateway (`/api/charts?charts=`)

Until these are set, report data endpoints return empty specs with an `upstream.error` message — intentional so the UI can be reviewed without fake numbers.

## Editing out-of-the-box reports

1. `GET /api/reports/grievance-summary`
2. Change `widgets` / `field_mapping` / `api_endpoint`
3. `PATCH /api/reports/grievance-summary` with the body  
4. `is_customized` becomes `true`; use `/reset` to restore seed

## Frappe note

`oan_reports_central/` remains the Frappe app shell for later Desk install. This FastAPI service is the runnable reports API for server deployment and local UI development today.
