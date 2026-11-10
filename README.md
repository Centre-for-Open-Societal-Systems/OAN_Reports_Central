# OAN Reports Central

OpenAgriNet **Report Center** — Figma-aligned report library with a **PostgreSQL-backed API**, Vue SPA, and dynamic report builder.

## Architecture

| Layer | Path | Role |
|-------|------|------|
| SPA | `frontend/` | Report Library, detail, Custom Report Builder |
| API | `backend/` | FastAPI + SQLAlchemy; catalog, CRUD, upstream chart proxy |
| DB | Postgres (Docker) | Report definitions, widgets, schedules, settings |
| Frappe shell | `oan_reports_central/` | Installable app for later Desk integration |
| Contracts | `postman/` | Upstream chart API collections |

**Out of the box:** 43 system reports (Figma) are seeded on API startup — definitions and widget layouts only, **no fabricated sample KPIs**.

**Live data:** set `UPSTREAM_*_BASE_URL` to your A2C / grievance / registry services. Until then, the UI shows empty/connected states with clear errors.

**Customise:** create new reports from API/JSON/upstream mapping, and **edit system reports** in place (`PATCH`; `POST …/reset` restores seed).

## Branches

`developer` (default) · `staging` · `master` — create after first commit.

## Run for the team (recommended)

```bash
cp .env.example .env
# set DATABASE_URL (compose sets this) and UPSTREAM_* when ready
docker compose up --build
```

- API: http://localhost:8000/api/health  
- Docs: http://localhost:8000/docs  

Frontend (separate terminal):

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` → the API (see `frontend/vite.config.js`).

## Local Windows notes

This machine may not have Docker/Postgres installed. For smoke tests the repo `.env` can use SQLite (`sqlite:///./oan_reports.db`). **Server / team target is PostgreSQL** via `docker-compose.yml`.

```powershell
.\scripts\seed_and_run_api.ps1
# if port 8000 is busy, run uvicorn on 8001 and point vite proxy there
cd frontend; npm run dev
```

## API surface (summary)

See [docs/BACKEND.md](docs/BACKEND.md).

- `GET /api/reports` — catalog  
- `GET /api/reports/{id}/data` — widgets + specs from upstream  
- `POST|PATCH|DELETE /api/reports` — custom + edit system  
- `POST /api/reports/{id}/reset` — restore system seed  

## What was removed

Hard-coded `charts_sample.json` fixtures used for fake dashboards. Contract reference remains at `sample_data/api_shapes.json`.
