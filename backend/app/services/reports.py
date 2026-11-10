from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.entities import AppSetting, Report, Schedule
from app.seed.catalog import CATEGORIES, SYSTEM_REPORTS
from app.services.spec_builder import (
    build_spec_from_rows,
    category_kpis_from_payload,
    normalize_rows,
)
from app.services.upstream import fetch_report_charts


def seed_database(db: Session) -> dict[str, int]:
    created = 0
    updated = 0
    for raw in SYSTEM_REPORTS:
        snap = copy.deepcopy(raw)
        existing = db.get(Report, raw["id"])
        if existing is None:
            row = Report(**raw, seed_snapshot=snap, version=1)
            db.add(row)
            created += 1
        else:
            # Refresh seed snapshot; do not overwrite customized system reports
            existing.seed_snapshot = snap
            if existing.is_system and not existing.is_customized:
                for k, v in raw.items():
                    setattr(existing, k, v)
                updated += 1

    if not db.get(AppSetting, "ui"):
        db.add(
            AppSetting(
                key="ui",
                value={
                    "name": "ATI Director",
                    "initials": "DR",
                    "email": "director@ati.example",
                    "role": "Director, Agricultural Transformation Institute",
                    "language": "en",
                    "defaultCategory": "grievance",
                    "areaUnit": "ha",
                    "currency": "ETB",
                    "dateFormat": "DD MMM YYYY",
                    "apiBaseUrl": "/api",
                    "notifyDigest": True,
                    "notifySla": True,
                    "notifyDataShare": False,
                },
            )
        )
    if not db.get(AppSetting, "map"):
        db.add(
            AppSetting(
                key="map",
                value={
                    "zone": {"metric": "farmers", "palette": "green", "classes": 5, "labels": True, "codes": False},
                    "woreda": {"metric": "farmers", "palette": "green", "classes": 5, "labels": True, "codes": False},
                },
            )
        )

    # Default schedules only if empty
    if db.scalar(select(Schedule.id).limit(1)) is None:
        for item in [
            {
                "id": "sc-seed-1",
                "report_id": "grievance-summary",
                "frequency": "Weekly",
                "day": "Monday",
                "time": "08:00",
                "format": "PDF",
                "recipients": "director@ati.example, programme@ati.example",
                "active": True,
            },
            {
                "id": "sc-seed-2",
                "report_id": "credit-programme-summary",
                "frequency": "Monthly",
                "day": "1st",
                "time": "07:30",
                "format": "XLSX",
                "recipients": "credit-team@ati.example",
                "active": True,
            },
        ]:
            db.add(Schedule(**item))

    db.commit()
    return {"created": created, "updated": updated}


def list_categories(db: Session) -> list[dict]:
    reports = db.scalars(select(Report).where(Report.is_active.is_(True))).all()
    counts = {}
    for r in reports:
        counts[r.category] = counts.get(r.category, 0) + 1
    out = []
    for c in CATEGORIES:
        out.append({**c, "report_count": counts.get(c["id"], 0)})
    return out


def serialize_report(r: Report) -> dict:
    return {
        "id": r.id,
        "category": r.category,
        "title": r.title,
        "tag": r.tag,
        "frequency": r.frequency,
        "description": r.description,
        "is_system": r.is_system,
        "is_active": r.is_active,
        "is_customized": r.is_customized,
        "source_type": r.source_type,
        "chart_keys": r.chart_keys or [],
        "upstream_service": r.upstream_service,
        "api_endpoint": r.api_endpoint,
        "api_method": r.api_method,
        "data_path": r.data_path,
        "field_mapping": r.field_mapping or {},
        "widgets": r.widgets or [],
        "category_kpi_chart_key": r.category_kpi_chart_key,
        "owner": r.owner,
        "version": r.version,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def list_reports(
    db: Session,
    *,
    category: str | None = None,
    q: str | None = None,
    include_inactive: bool = False,
) -> list[dict]:
    stmt = select(Report)
    if not include_inactive:
        stmt = stmt.where(Report.is_active.is_(True))
    if category:
        stmt = stmt.where(Report.category == category)
    rows = db.scalars(stmt.order_by(Report.category, Report.title)).all()
    if q:
        qq = q.lower()
        rows = [
            r
            for r in rows
            if qq in r.title.lower()
            or qq in (r.tag or "").lower()
            or qq in (r.description or "").lower()
            or qq in r.id.lower()
        ]
    return [serialize_report(r) for r in rows]


async def build_report_data(db: Session, report_id: str, params: dict | None = None) -> dict:
    report = db.get(Report, report_id)
    if not report or not report.is_active:
        raise KeyError(report_id)

    chart_keys = list(report.chart_keys or [])
    charts, meta = await fetch_report_charts(
        service=report.upstream_service or "gateway",
        chart_keys=chart_keys,
        endpoint=report.api_endpoint or None,
        params=params,
    )

    primary_key = chart_keys[0] if chart_keys else None
    primary = charts.get(primary_key) if primary_key else []
    mode = (report.field_mapping or {}).get("mode", "auto")
    rows = normalize_rows(primary, mode=mode)

    widgets_out = []
    for w in report.widgets or []:
        # If widget specifies chart_key override later; for now use primary rows
        spec = build_spec_from_rows(rows, w)
        widgets_out.append(
            {
                "id": w.get("id"),
                "title": w.get("title"),
                "type": w.get("type"),
                "chart_type": w.get("chart_type") or w.get("chartType"),
                "widget": w,
                "spec": spec,
            }
        )

    return {
        "report": serialize_report(report),
        "widgets": widgets_out,
        "data": charts,
        "rows": rows,
        "upstream": meta,
        "as_of": datetime.now(timezone.utc).isoformat(),
    }


async def category_summary(db: Session, category_id: str) -> dict:
    cat = next((c for c in CATEGORIES if c["id"] == category_id), None)
    if not cat:
        raise KeyError(category_id)
    key = cat.get("kpi_chart_key") or ""
    service = cat.get("upstream_service") or ""
    data, meta = await fetch_report_charts(service=service, chart_keys=[key] if key else [])
    payload = data.get(key)
    kpis = category_kpis_from_payload(category_id, payload) if meta.get("upstream_ok") else []
    if not kpis and not meta.get("upstream_ok"):
        kpis = [
            {
                "label": "Upstream not connected",
                "value": "—",
                "hint": meta.get("errors", ["Configure UPSTREAM_*_BASE_URL"])[0]
                if meta.get("errors")
                else "Configure upstream base URLs",
                "icon": "info",
            }
        ]
    return {"category": cat, "kpis": kpis, "upstream": meta, "as_of": datetime.now(timezone.utc).isoformat()}


def create_report(db: Session, payload: dict) -> Report:
    rid = payload.get("id") or f"cr-{uuid.uuid4().hex[:10]}"
    if db.get(Report, rid):
        raise ValueError(f"Report id already exists: {rid}")
    row = Report(
        id=rid,
        category=payload.get("category") or "grievance",
        title=payload.get("title") or payload.get("name") or "Untitled report",
        tag=payload.get("tag") or "Custom",
        frequency=payload.get("frequency") or "Ad hoc",
        description=payload.get("description") or "",
        is_system=False,
        is_active=True,
        is_customized=True,
        source_type=payload.get("source_type") or "api",
        chart_keys=payload.get("chart_keys") or [],
        upstream_service=payload.get("upstream_service") or "",
        api_endpoint=payload.get("api_endpoint") or "",
        api_method=payload.get("api_method") or "GET",
        data_path=payload.get("data_path") or "data",
        field_mapping=payload.get("field_mapping") or {},
        widgets=payload.get("widgets") or [],
        category_kpi_chart_key=payload.get("category_kpi_chart_key") or "",
        owner=payload.get("owner") or "ATI Director",
        version=1,
        seed_snapshot=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_report(db: Session, report_id: str, payload: dict) -> Report:
    row = db.get(Report, report_id)
    if not row:
        raise KeyError(report_id)
    mutable = {
        "title",
        "name",
        "tag",
        "frequency",
        "description",
        "category",
        "is_active",
        "source_type",
        "chart_keys",
        "upstream_service",
        "api_endpoint",
        "api_method",
        "data_path",
        "field_mapping",
        "widgets",
        "category_kpi_chart_key",
        "owner",
    }
    for k, v in payload.items():
        key = "title" if k == "name" else k
        if key in mutable and hasattr(row, key):
            setattr(row, key, v)
    if row.is_system:
        row.is_customized = True
    row.version = (row.version or 1) + 1
    db.commit()
    db.refresh(row)
    return row


def delete_report(db: Session, report_id: str) -> None:
    row = db.get(Report, report_id)
    if not row:
        raise KeyError(report_id)
    if row.is_system:
        # Soft-hide system reports instead of hard delete
        row.is_active = False
        row.is_customized = True
        db.commit()
        return
    db.delete(row)
    db.commit()


def reset_report(db: Session, report_id: str) -> Report:
    row = db.get(Report, report_id)
    if not row:
        raise KeyError(report_id)
    if not row.is_system or not row.seed_snapshot:
        raise ValueError("Only system reports with a seed snapshot can be reset")
    snap = copy.deepcopy(row.seed_snapshot)
    for k, v in snap.items():
        if hasattr(row, k):
            setattr(row, k, v)
    row.is_customized = False
    row.is_active = True
    row.version = (row.version or 1) + 1
    db.commit()
    db.refresh(row)
    return row


def get_settings_bundle(db: Session) -> dict:
    ui = db.get(AppSetting, "ui")
    mp = db.get(AppSetting, "map")
    return {"ui": ui.value if ui else {}, "map": mp.value if mp else {}}


def put_settings_bundle(db: Session, payload: dict) -> dict:
    if "ui" in payload:
        row = db.get(AppSetting, "ui") or AppSetting(key="ui", value={})
        row.value = payload["ui"]
        db.add(row)
    if "map" in payload:
        row = db.get(AppSetting, "map") or AppSetting(key="map", value={})
        row.value = payload["map"]
        db.add(row)
    db.commit()
    return get_settings_bundle(db)


def list_schedules(db: Session) -> list[dict]:
    rows = db.scalars(select(Schedule).order_by(Schedule.created_at.desc())).all()
    return [
        {
            "id": s.id,
            "report_id": s.report_id,
            "frequency": s.frequency,
            "day": s.day,
            "time": s.time,
            "format": s.format,
            "recipients": s.recipients,
            "active": s.active,
        }
        for s in rows
    ]


def replace_schedules(db: Session, items: list[dict]) -> list[dict]:
    db.execute(delete(Schedule))
    for item in items:
        db.add(
            Schedule(
                id=item.get("id") or f"sc-{uuid.uuid4().hex[:8]}",
                report_id=item["report_id"],
                frequency=item.get("frequency") or "Weekly",
                day=item.get("day") or "",
                time=item.get("time") or "08:00",
                format=item.get("format") or "PDF",
                recipients=item.get("recipients") or "",
                active=bool(item.get("active", True)),
            )
        )
    db.commit()
    return list_schedules(db)
