"""Build SpecView-compatible specs from upstream rows + widget config."""

from __future__ import annotations

from typing import Any


SERIES_COLORS = ["#1b7a4e", "#e67e22", "#1d6fa5", "#7c3aed", "#be123c", "#0f766e", "#a16207"]


def human(s: Any) -> str:
    if s is None:
        return ""
    return str(s).replace("_", " ").strip().title()


def fmt_number(v: Any) -> str:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return "—"
    if abs(n - round(n)) < 1e-9:
        return f"{int(round(n)):,}"
    return f"{n:,.1f}"


def _get(row: dict, key: str) -> Any:
    if not key:
        return None
    if "." in key:
        cur: Any = row
        for part in key.split("."):
            if not isinstance(cur, dict):
                return None
            cur = cur.get(part)
        return cur
    return row.get(key)


def _as_number(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def normalize_rows(data: Any, *, mode: str = "auto") -> list[dict]:
    """Turn chart payload into a list of objects for widget mapping."""
    if data is None:
        return []
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    if isinstance(data, dict):
        if mode == "object" or not any(isinstance(v, (list, dict)) for v in data.values()):
            return [data]
        # Prefer nested list values
        for v in data.values():
            if isinstance(v, list) and v and isinstance(v[0], dict):
                return [r for r in v if isinstance(r, dict)]
        return [data]
    return []


def build_spec_from_rows(rows: list[dict], widget: dict | None = None) -> dict:
    widget = widget or {}
    wtype = widget.get("type") or "chart"
    if not rows:
        return {
            "kind": "bignumber",
            "value": "—",
            "label": "No data",
            "hint": "Configure upstream base URLs or check the chart endpoint.",
        }

    if wtype == "kpis":
        row = rows[0]
        keys = widget.get("kpi_fields") or [
            k for k, v in row.items() if isinstance(v, (int, float)) and not isinstance(v, bool)
        ][:4]
        return {
            "kind": "kpis",
            "items": [{"label": human(k), "value": fmt_number(_get(row, k)), "hint": k} for k in keys],
        }

    if wtype == "bignumber":
        row = rows[0]
        key = widget.get("value_field") or next(
            (k for k, v in row.items() if isinstance(v, (int, float))), None
        )
        return {
            "kind": "bignumber",
            "value": fmt_number(_get(row, key)),
            "label": widget.get("title") or human(key) or "Value",
            "hint": key,
        }

    if wtype == "table":
        cols = widget.get("column_fields") or list(rows[0].keys())[:6]
        return {
            "kind": "table",
            "columns": [
                {
                    "key": c,
                    "label": human(c),
                    "format": "number"
                    if any(isinstance(_get(r, c), (int, float)) for r in rows[:3])
                    else None,
                }
                for c in cols
            ],
            "rows": [{c: _get(r, c) for c in cols} for r in rows],
        }

    # chart
    label_field = widget.get("label_field") or next(
        (k for k, v in rows[0].items() if isinstance(v, str)), next(iter(rows[0].keys()))
    )
    value_fields = widget.get("value_fields") or [
        k for k, v in rows[0].items() if k != label_field and isinstance(v, (int, float))
    ][:2]

    idx = list(range(len(rows)))
    if value_fields:
        key0 = value_fields[0]
        if widget.get("sort") == "desc":
            idx.sort(key=lambda i: _as_number(_get(rows[i], key0)), reverse=True)
        elif widget.get("sort") == "asc":
            idx.sort(key=lambda i: _as_number(_get(rows[i], key0)))
    limit = int(widget.get("limit") or 0)
    if limit > 0:
        idx = idx[:limit]

    labels = [
        str(_get(rows[i], label_field) if _get(rows[i], label_field) is not None else f"#{i + 1}")
        for i in idx
    ]
    datasets = [
        {
            "label": human(key),
            "color": SERIES_COLORS[di % len(SERIES_COLORS)],
            "data": [_as_number(_get(rows[i], key)) for i in idx],
        }
        for di, key in enumerate(value_fields)
    ]
    chart_type = widget.get("chart_type") or widget.get("chartType") or "bar"
    type_name = "bar" if chart_type == "hbar" else chart_type
    return {
        "kind": "chart",
        "type": type_name,
        "indexAxis": "y" if chart_type == "hbar" else "x",
        "stacked": bool(widget.get("stacked")) and type_name == "bar",
        "format": "number",
        "unit": "items",
        "labels": labels,
        "datasets": datasets[:1] if type_name == "doughnut" else datasets,
    }


def category_kpis_from_payload(category_id: str, data: Any) -> list[dict]:
    """Map known KPI objects into library summary cards."""
    rows = normalize_rows(data, mode="object")
    if not rows:
        return []
    row = rows[0]

    def item(label: str, key: str, *, hint: str | None = None, icon: str = "info", tone: str | None = None):
        return {
            "label": label,
            "value": fmt_number(row.get(key)),
            "hint": hint or key,
            "icon": icon,
            **({"tone": tone} if tone else {}),
        }

    if category_id == "grievance":
        return [
            item("Total grievances", "total_grievances", icon="message-alert"),
            item("Awaiting action", "awaiting_action", hint=f"{row.get('new_this_week', '—')} new this week", icon="clock", tone="warn"),
            item("Resolved", "resolved", icon="check", tone="good"),
            item("Escalated", "escalated", icon="flag", tone="danger"),
        ]
    if category_id == "access-to-credit":
        return [
            item("Providers onboarded", "providers_onboarded", icon="landmark"),
            item("Loan applications", "applications_total", icon="file"),
            item("Loans approved", "loans_approved", icon="check", tone="good"),
            item("Approved value", "loan_value_approved", icon="coins"),
        ]
    if category_id == "farmer-registry":
        return [
            item("Registered farmers", "total_farmers", icon="users"),
            item("Female farmers", "female_farmers", icon="user"),
            item("Total land", "total_land_size", icon="map"),
            item("Household heads", "household_heads", icon="home"),
        ]
    if category_id == "livestock":
        return [
            item("Holdings", "holdings", icon="database"),
            item("Keepers", "keepers", icon="users"),
            item("Animals", "animals", icon="paw"),
            item("Breeds tracked", "breeds_tracked", icon="sprout"),
        ]
    if category_id == "crop-sown":
        return [
            item("Area sown", "total_area", icon="map"),
            item("Farmers", "farmers", icon="users"),
            item("Registrations", "registrations", icon="file"),
            item("Crop types", "crop_types", icon="wheat"),
        ]
    # generic
    nums = [k for k, v in row.items() if isinstance(v, (int, float))][:4]
    return [item(human(k), k) for k in nums]
