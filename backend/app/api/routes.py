from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.services import reports as report_svc
from app.services.upstream import fetch_chart

router = APIRouter()


@router.get("/health")
def health():
    settings = get_settings()
    db_url = settings.database_url.lower()
    if db_url.startswith("sqlite"):
        db_kind = "sqlite"
    elif "postgres" in db_url:
        db_kind = "postgres"
    else:
        db_kind = "other"
    return {
        "status": "ok",
        "env": settings.app_env,
        "database": db_kind,
        "upstreams": {
            "a2c": bool(settings.upstream_a2c_base_url),
            "grievance": bool(settings.upstream_grievance_base_url),
            "farmer": bool(settings.upstream_farmer_base_url),
            "livestock": bool(settings.upstream_livestock_base_url),
            "crop": bool(settings.upstream_crop_base_url),
            "gateway": bool(settings.upstream_gateway_base_url),
        },
    }


@router.get("/config")
def config():
    settings = get_settings()
    return {
        "app": settings.app_name,
        "categories_seeded": True,
        "cors_origins": settings.cors_origin_list,
    }


@router.get("/categories")
def categories(db: Session = Depends(get_db)):
    return report_svc.list_categories(db)


@router.get("/categories/{category_id}/summary")
async def category_summary(category_id: str, db: Session = Depends(get_db)):
    try:
        return await report_svc.category_summary(db, category_id)
    except KeyError:
        raise HTTPException(404, f"Unknown category: {category_id}") from None


@router.get("/reports")
def reports(
    category: str | None = None,
    q: str | None = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    return report_svc.list_reports(db, category=category, q=q, include_inactive=include_inactive)


@router.get("/reports/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db)):
    rows = report_svc.list_reports(db, include_inactive=True)
    for r in rows:
        if r["id"] == report_id:
            return r
    raise HTTPException(404, f"Report not found: {report_id}")


@router.get("/reports/{report_id}/data")
async def report_data(report_id: str, db: Session = Depends(get_db)):
    try:
        return await report_svc.build_report_data(db, report_id)
    except KeyError:
        raise HTTPException(404, f"Report not found: {report_id}") from None


@router.post("/reports", status_code=201)
def create_report(payload: dict[str, Any], db: Session = Depends(get_db)):
    try:
        row = report_svc.create_report(db, payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return report_svc.serialize_report(row)


@router.patch("/reports/{report_id}")
def patch_report(report_id: str, payload: dict[str, Any], db: Session = Depends(get_db)):
    try:
        row = report_svc.update_report(db, report_id, payload)
    except KeyError:
        raise HTTPException(404, f"Report not found: {report_id}") from None
    return report_svc.serialize_report(row)


@router.delete("/reports/{report_id}")
def remove_report(report_id: str, db: Session = Depends(get_db)):
    try:
        report_svc.delete_report(db, report_id)
    except KeyError:
        raise HTTPException(404, f"Report not found: {report_id}") from None
    return {"ok": True}


@router.post("/reports/{report_id}/reset")
def reset_report(report_id: str, db: Session = Depends(get_db)):
    try:
        row = report_svc.reset_report(db, report_id)
    except KeyError:
        raise HTTPException(404, f"Report not found: {report_id}") from None
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return report_svc.serialize_report(row)


@router.get("/settings")
def get_settings_route(db: Session = Depends(get_db)):
    return report_svc.get_settings_bundle(db)


@router.put("/settings")
def put_settings_route(payload: dict[str, Any], db: Session = Depends(get_db)):
    return report_svc.put_settings_bundle(db, payload)


@router.get("/schedules")
def get_schedules(db: Session = Depends(get_db)):
    return report_svc.list_schedules(db)


@router.put("/schedules")
def put_schedules(payload: list[dict[str, Any]], db: Session = Depends(get_db)):
    return report_svc.replace_schedules(db, payload)


@router.get("/v1/charts/{chart_key}")
async def proxy_chart(
    chart_key: str,
    service: str = Query(default="gateway"),
):
    """Direct chart proxy matching Postman /api/v1/charts/{key} shape."""
    data, meta = await fetch_chart(service=service, chart_key=chart_key)
    if not meta.get("upstream_ok"):
        raise HTTPException(502, meta.get("error") or "Upstream chart fetch failed")
    return {"status": "success", "data": data, "meta": meta}
