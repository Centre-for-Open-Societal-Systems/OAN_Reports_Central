# OAN Reports Central (Frappe App)

Frappe application for the OpenAgriNet Report Center UI and chart APIs.

## Install (on a Frappe bench)

```bash
bench get-app /path/to/OAN_Reports_Central/oan_reports_central
bench --site <site> install-app oan_reports_central
```

The SPA is served at `/report-center` once frontend assets are built into
`oan_reports_central/public/frontend`.

## Local UI without a full bench

From the repository root:

```bash
cd frontend
npm install
npm run dev
```

Optional mock API (mirrors Postman chart endpoints with sample data):

```bash
python -m pip install fastapi uvicorn
python mock_api/server.py
```
