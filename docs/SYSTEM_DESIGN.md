# System design — Report Center

## 1. Overview

Report Center is a **BFF + SPA** for OpenAgriNet reporting:

```
┌─────────────┐     /api/*      ┌──────────────────┐    HTTP     ┌─────────────────────────┐
│  Vue SPA    │ ──────────────► │  FastAPI (BFF)   │ ─────────► │ Upstream chart services │
│  frontend/  │                 │  backend/        │            │ A2C · Grievance · Reg.  │
└─────────────┘                 └────────┬─────────┘            └─────────────────────────┘
                                         │
                                         ▼
                                ┌──────────────────┐
                                │   PostgreSQL     │
                                │ reports, schedules│
                                │ settings         │
                                └──────────────────┘
```

- **SPA** owns UX (Figma Report Library, detail, builder, schedule, settings).  
- **API** owns catalog persistence, widget specs, and upstream proxying.  
- **Postgres** stores report *definitions* (not fabricated metrics).  
- **Upstream** services (Postman contracts) own live aggregates.

Optional later: install `oan_reports_central` on a Frappe bench and proxy the same API from Desk.

---

## 2. Repository layout

```
OAN_Reports_Central/
├── frontend/                 # Vue 3 + Vite SPA
├── backend/                  # FastAPI application
│   └── app/
│       ├── api/routes.py     # HTTP surface
│       ├── models/           # SQLAlchemy entities
│       ├── seed/catalog.py   # 43 system reports + categories
│       └── services/         # reports, upstream, spec_builder
├── oan_reports_central/      # Frappe app shell
├── postman/                  # Upstream API collections
├── sample_data/              # api_shapes.json (contract reference only)
├── docker-compose.yml        # Postgres + API
├── docs/                     # This documentation set
└── scripts/                  # Local API helpers
```

---

## 3. Runtime components

### 3.1 Frontend (`frontend/`)

| Piece | Responsibility |
|-------|----------------|
| `src/api/*` | Fetch client + report/settings/schedule APIs |
| `src/composables/useCatalog.js` | In-memory catalog cache from API |
| `src/views/ReportLibrary.vue` | Category tabs, KPI strip, cards |
| `src/views/ReportDetail.vue` | Widgets from `/reports/{id}/data` |
| `src/views/CustomReportBuilder.vue` | Dynamic source + field map + widgets |
| `src/utils/dynamicData.js` | Client-side JSON mapping / preview |
| `vite.config.js` | Dev proxy `/api` → backend |

### 3.2 Backend (`backend/`)

| Piece | Responsibility |
|-------|----------------|
| `main.py` | App factory, CORS, create tables, seed on startup |
| `core/config.py` | Env: `DATABASE_URL`, `UPSTREAM_*`, CORS |
| `models/entities.py` | `Report`, `Schedule`, `AppSetting` |
| `seed/catalog.py` | Figma system catalog + chart keys |
| `services/upstream.py` | httpx fetch + envelope unwrap |
| `services/spec_builder.py` | Rows + widget config → SpecView JSON |
| `services/reports.py` | CRUD, reset, category summary, schedules |

### 3.3 Database

**Primary (server):** PostgreSQL 16 (`docker-compose.yml`).  
**Local smoke only:** SQLite via `DATABASE_URL=sqlite:///./oan_reports.db` (not for production).

#### `reports`

| Column | Purpose |
|--------|---------|
| `id` | Stable slug (e.g. `grievance-summary`) |
| `category` | Domain id |
| `title`, `tag`, `frequency`, `description` | Library metadata |
| `is_system` | Seeded Figma report |
| `is_active` | Soft-hide |
| `is_customized` | Diverged from seed |
| `source_type` | `upstream` \| `api` \| `json` \| … |
| `chart_keys` | JSON list of Postman chart ids |
| `upstream_service` | `a2c` \| `grievance` \| `farmer` \| … |
| `api_endpoint` | Path or absolute URL for primary chart |
| `data_path` | JSON path to row array |
| `field_mapping` | JSON mapping helpers |
| `widgets` | JSON list of widget configs |
| `seed_snapshot` | Immutable copy for `/reset` |
| `version`, `owner`, timestamps | Audit |

#### `schedules` / `app_settings`

Delivery schedule rows; key/value JSON docs for `ui` and `map`.

---

## 4. Data flow

### 4.1 Library load

1. SPA `GET /api/reports` (+ `/api/categories`).  
2. For active category, `GET /api/categories/{id}/summary` fetches upstream KPI chart and maps to number cards.  
3. Card previews optionally call `GET /api/reports/{id}/data` (first widget spec).

### 4.2 Report detail

1. `GET /api/reports/{id}/data`.  
2. BFF loads report row → `fetch_report_charts` for each `chart_key`.  
3. Normalize payload → rows → `build_spec_from_rows` per widget.  
4. Response: `{ report, widgets:[{spec}], data, upstream, as_of }`.

### 4.3 Customise / create

1. Builder loads definition (`GET /api/reports/{id}`) or blank form.  
2. User sets API URL or pastes JSON; maps fields; adds widgets.  
3. `POST /api/reports` (new) or `PATCH /api/reports/{id}` (edit system/custom).  
4. System edits set `is_customized=true`; `POST …/reset` restores `seed_snapshot`.

```
┌──────────────┐  PATCH widgets/mapping   ┌─────────┐
│ System report│ ───────────────────────► │ DB row  │  is_customized=true
└──────────────┘                          └────┬────┘
                                               │ reset
                                               ▼
                                         seed_snapshot
```

---

## 5. Upstream integration

Env vars (see `.env.example`):

| Variable | Service |
|----------|---------|
| `UPSTREAM_A2C_BASE_URL` | A2C Dashboard Service |
| `UPSTREAM_GRIEVANCE_BASE_URL` | Grievance Dashboard Service |
| `UPSTREAM_FARMER_BASE_URL` | Farmer registry charts |
| `UPSTREAM_LIVESTOCK_BASE_URL` | Livestock charts |
| `UPSTREAM_CROP_BASE_URL` | Crop sown charts |
| `UPSTREAM_GATEWAY_BASE_URL` | Multi-chart gateway |

Contracts: `postman/*.json`. Field shape reference: `sample_data/api_shapes.json`.

**Design choice:** Report Center does not duplicate warehouse logic; it is a presentation and composition layer. When upstreams are missing, APIs return empty specs with `upstream.errors` so the UI never invents numbers.

---

## 6. Spec / widget contract

Widgets stored on a report (simplified):

```json
{
  "id": "w-main",
  "type": "chart",
  "chart_type": "hbar",
  "title": "By category",
  "label_field": "category",
  "value_fields": ["grievances"],
  "sort": "desc",
  "limit": 0,
  "stacked": false
}
```

Rendered `spec` kinds for the SPA `SpecView`: `chart` | `kpis` | `table` | `gauge` | `bignumber`.

---

## 7. Deployment

### Docker (recommended for servers)

```bash
cp .env.example .env
# set UPSTREAM_* and secrets
docker compose up --build -d
```

- API: `:8000`  
- Postgres: `:5432` (`oan` / `oan` / `oan_reports` by default — change for production)

### Frontend

Build static assets (`npm run build`) and serve behind nginx, or run Vite in dev with proxy to the API.

### Environments

| Branch | Typical use |
|--------|-------------|
| `developer` | Active development |
| `staging` | Pre-prod with staging upstream URLs |
| `master` | Production |

---

## 8. Security considerations (handoff)

- Do not commit `.env` or DB files (gitignored).  
- Restrict CORS to known SPA origins in production.  
- Add auth (SSO / API gateway) in front of `/api` before public exposure.  
- Upstream calls should use service credentials / mTLS as those APIs require (extend `upstream.py`).  
- Validate JSON size limits on pasted sample payloads if accepting large bodies.

---

## 9. Extension points

| Need | Approach |
|------|----------|
| New standard report | Add to `seed/catalog.py`, bump seed, deploy API |
| New chart from existing upstream | Point `chart_keys` / widgets via Customise UI |
| New upstream family | Add `UPSTREAM_*`, seed `upstream_service`, Postman file |
| Auth | Middleware or reverse-proxy JWT; attach user to `owner` |
| Frappe Desk | Serve built SPA from `oan_reports_central` www + hooks |

---

## 10. Related docs

- [SPEC.md](./SPEC.md) — functional requirements  
- [BACKEND.md](./BACKEND.md) — API operations  
- [FRONTEND.md](./FRONTEND.md) — SPA structure  
