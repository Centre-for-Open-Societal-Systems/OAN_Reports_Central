# Frontend guide — Report Center SPA

## Stack

- Vue 3 + Vite 8  
- Vue Router  
- Chart.js / vue-chartjs  
- No sample KPI fixtures; all catalog/data from the BFF  

## Run

```bash
cd frontend
cp .env.example .env   # optional VITE_API_BASE_URL
npm install
npm run dev            # http://127.0.0.1:5173
```

Dev proxy (`vite.config.js`): `/api` → `http://127.0.0.1:8001` (adjust if API listens on 8000).

Production:

```bash
npm run build   # output: frontend/dist
```

## Routes

| Path | View |
|------|------|
| `/` | Report Library (default category grievance) |
| `/library/:category` | Library filtered by category |
| `/reports/:reportId` | Report detail + widgets |
| `/custom` | Custom & edited reports |
| `/custom/new` | Builder (`?id=` edit, `?base=` seed from library) |
| `/custom/map-zone`, `/custom/map-woreda` | Map settings |
| `/schedule` | Schedules |
| `/settings` | User/preferences |

## Key modules

| Path | Role |
|------|------|
| `src/api/client.js` | Fetch wrapper, `VITE_API_BASE_URL` |
| `src/api/reports.js` | Catalog, data, CRUD, settings, schedules |
| `src/api/mappers.js` | snake_case ↔ camelCase form payloads |
| `src/composables/useCatalog.js` | Reactive report list + previews |
| `src/composables/useStores.js` | save/remove/reset report, settings, schedules |
| `src/utils/dynamicData.js` | JSON parse, field discovery, client preview specs |
| `src/components/charts/SpecView.vue` | Renders chart/kpi/table/gauge/bignumber specs |

`App.vue` calls `loadCatalog()` and `loadSettings()` on mount.

## Empty / error states

When upstreams are not configured, `/reports/{id}/data` returns widgets with empty/placeholder specs and `upstream.errors`. The UI must show that honestly — do not reinstate hard-coded sample numbers.

## Customising system reports

From Report Detail → **Customise** → builder with `?id=<reportId>` → Save → `PATCH /api/reports/{id}` → `is_customized=true`. Reset from Custom Reports list when available.

## Related

- [SPEC.md](./SPEC.md)  
- [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md)  
- [BACKEND.md](./BACKEND.md)  
