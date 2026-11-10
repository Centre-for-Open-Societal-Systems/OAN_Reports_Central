"""Local mock API matching Postman chart endpoints (no Frappe bench required)."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = json.loads((ROOT / "sample_data" / "charts_sample.json").read_text(encoding="utf-8"))

app = FastAPI(title="OAN Reports Central Mock API", version="0.0.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _find(chart: str):
    for domain in ("farmer_registry", "livestock", "crop_sown", "a2c", "grievance"):
        if chart in SAMPLE.get(domain, {}):
            return SAMPLE[domain][chart]
    return None


@app.get("/api/health")
def health():
    return {"status": "ok", "mode": "sample"}


@app.get("/api/v1/charts/{chart}")
def chart_v1(chart: str):
    rows = _find(chart)
    if rows is None:
        raise HTTPException(404, f"Unknown chart: {chart}")
    return {
        "status": "success",
        "data": rows,
        "meta": {"as_of": SAMPLE.get("_meta", {}).get("generated_at")},
    }


@app.get("/api/charts")
def charts_gateway(charts: str | None = Query(default=None)):
    names = [c.strip() for c in (charts or "farmerKpis,livestockKpis,cropKpis").split(",") if c.strip()]
    out = {}
    errors = []
    for name in names:
        rows = _find(name)
        if rows is None:
            errors.append({"chart": name, "error": "not_found"})
            continue
        out[name] = {"chartName": name, "success": True, "data": rows, "error": None}
    return {
        "success": True,
        "data": out,
        "errors": errors,
        "summary": {"total": len(names), "successful": len(out), "failed": len(errors)},
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
