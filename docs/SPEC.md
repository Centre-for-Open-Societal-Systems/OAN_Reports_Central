# Product & functional specification — Report Center

**Product:** OpenAgriNet — Report Center  
**Design source:** [Figma — OpenAgriNet Report Center](https://www.figma.com/proto/486SSPYdkaCFkiVke9B6ZD/OpenAgriNet-%E2%80%94-Report-Center)  
**Repo:** `OAN_Reports_Central`  
**Status:** Implementable baseline for server deployment and upstream wiring  

---

## 1. Purpose

Report Center is the ATI-facing place to:

1. Browse **standard (out-of-the-box) reports** aligned to the Figma Report Library across five domains.
2. Open each report with live chart data from OpenAgriNet dashboard/chart services.
3. **Customise** standard reports (widgets, mapping, endpoints) without redeploying code.
4. **Create new reports dynamically** from an API endpoint or pasted JSON response, mapping fields to charts/KPI cards/tables.
5. Schedule delivery and adjust user/map preferences (baseline UI).

It does **not** replace the operational registries or credit dashboards; sidebar “Dashboards” links open those external systems.

---

## 2. Personas (from Figma)

| Persona | Notes |
|---------|--------|
| ATI Director | Full library; Access to Credit + registries + grievance |
| ATI Credit Manager | A2C-focused library variants in design |
| ATI Administrator | Custom reports department / map settings (Figma frames) |

UI currently surfaces a configurable profile (name/initials/role) via settings; role-based filtering of the catalog can be added later without changing report definitions.

---

## 3. Information architecture

### Shell

- Left sidebar: Report Library, Custom Reports, Schedule · Dashboards (Registries, Access to Credit, external) · Settings  
- Top bar: search (`/` focus), notifications, user chip  

### Domains (categories)

| Category | System report count | Primary upstream |
|----------|---------------------|------------------|
| Access to Credit | 11 | A2C Dashboard Service |
| Farmer Registry | 8 | Farmer charts API |
| Livestock | 6 | Livestock charts API |
| Crop Sown | 6 | Crop sown charts API |
| Grievance | 12 | Grievance Dashboard Service |

**Total out-of-box reports: 43** (seeded as `is_system=true`).

### Filter chips (examples from Figma)

- Grievance: All / Volume and Status / Timeliness / Performance  
- Access to Credit: All / Applications / Providers and Places / Consent and Data Sharing  

---

## 4. Functional requirements

### 4.1 Report Library

| ID | Requirement |
|----|-------------|
| RL-1 | List categories with report counts |
| RL-2 | Show category KPI strip from upstream KPI chart (empty state if upstream unset) |
| RL-3 | Grid/list of report cards with tag, title, frequency, preview when data available |
| RL-4 | Search reports by title/tag/description |
| RL-5 | “New Custom Report” navigates to builder |
| RL-6 | “Open Dashboard” / external links use configured dashboard URLs |
| RL-7 | No fabricated KPI numbers shipped in the product |

### 4.2 Report detail

| ID | Requirement |
|----|-------------|
| RD-1 | Breadcrumb: Library → Category → Report |
| RD-2 | Render one or more widgets (chart, KPIs, table, big number) from `/api/reports/{id}/data` |
| RD-3 | Show upstream status/error when chart fetch fails or is unconfigured |
| RD-4 | **Customise** opens builder preloaded with that report (`?id=`) |
| RD-5 | Filters UI may be present as preview; live filter passthrough to upstream is a later enhancement |

### 4.3 Custom / dynamic reports

| ID | Requirement |
|----|-------------|
| CR-1 | Create report with name, description, category |
| CR-2 | Data source: **API endpoint**, **pasted JSON**, or start from library/upstream definition |
| CR-3 | Detect JSON array paths and field types; map label/value/KPI/column fields |
| CR-4 | Add multiple widgets: column/bar/line/doughnut, KPI cards, table, big number |
| CR-5 | Live preview while configuring |
| CR-6 | Persist via API (`POST` / `PATCH`); no deploy required for new reports |
| CR-7 | List shows custom reports and **edited** system reports |
| CR-8 | System reports: soft-hide on delete; **Reset** restores seed snapshot |

### 4.4 Schedule & settings

| ID | Requirement |
|----|-------------|
| SC-1 | List/add/remove/toggle delivery schedules bound to report ids |
| ST-1 | Persist UI profile and preferences |
| ST-2 | Map settings (zone/woreda) stored for choropleth configuration UI |

### 4.5 Non-functional

| ID | Requirement |
|----|-------------|
| NF-1 | PostgreSQL for team/server; Docker Compose provided |
| NF-2 | Configurable CORS and upstream base URLs via env |
| NF-3 | OpenAPI available at `/docs` |
| NF-4 | Branches: `developer`, `staging`, `master` |
| NF-5 | Frappe app shell retained for later Desk integration |

---

## 5. Out-of-box report inventory

### Access to Credit (11)

Credit Programme Summary · Credit Providers Onboarded · Applications by Credit Provider · Credit Activity by Location · Credit Consent Request Status · Loan Applications by Status · Loan Applications by Product · Monthly Application Cohorts · Application Decline Reasons · Data-Sharing Delivery Status · Data-Sharing Exceptions  

### Farmer Registry (8)

Farmer Registry Summary · Farmers by Age and Gender · Farmers by Education · Farmers by Farming Type · Farmers by Location · Land Tenure · Registration Trend · Registry Coverage  

### Livestock (6)

Livestock Summary · Animals by Species and Breed · Herd Health and Vaccination · Holding Approval Status · Keepers by Location · Livestock Registration Trend  

### Crop Sown (6)

Crop Sown Summary · Area Sown by Crop · Area Sown by Location · Crop by Season · Registration Status and Stage · Sowing Trend  

### Grievance (12)

Grievance Summary · Grievances by Status · Grievances by Category · Grievances by Administrative Level · Submission and Resolution Throughput · Retained Backlog Trend · Grievances at Risk of SLA Breach · Grievance Performance Score · Resolution Rate by Region · Resolution Time by Category · Oldest Open Grievances · Pending Duplicates  

Chart key mappings live in `backend/app/seed/catalog.py` and align with collections under `postman/`.

---

## 6. Acceptance criteria (MVP for server handoff)

1. `docker compose up` starts Postgres + API; seed creates 43 system reports.  
2. Frontend loads catalog from API with no sample KPI fixtures.  
3. With upstreams unset, library/detail show clear empty/error states.  
4. With one upstream configured (e.g. grievance), related reports return widget specs from live data.  
5. User can create a custom report from pasted JSON, add a chart + table, save, and see it under Custom Reports.  
6. User can Customise a system report, save, see `is_customized`, then Reset to seed.  

---

## 7. Out of scope (near term)

- Full authN/Z and role-gated catalogs  
- Real GIS boundaries for map widgets  
- Server-side PDF/XLSX generation for schedules  
- Writing metrics into Postgres (read-through proxy only)  
- Complete Frappe Desk SPA packaging on production bench  

---

## 8. Related docs

- [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) — architecture  
- [BACKEND.md](./BACKEND.md) — API runbook  
- [FRONTEND.md](./FRONTEND.md) — SPA guide  
