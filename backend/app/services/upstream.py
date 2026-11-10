"""Fetch chart payloads from configured upstream services (Postman contracts)."""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import Settings, get_settings


class UpstreamError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _base_for(service: str, settings: Settings) -> str:
    mapping = {
        "a2c": settings.upstream_a2c_base_url,
        "grievance": settings.upstream_grievance_base_url,
        "farmer": settings.upstream_farmer_base_url,
        "livestock": settings.upstream_livestock_base_url,
        "crop": settings.upstream_crop_base_url,
        "gateway": settings.upstream_gateway_base_url,
    }
    return (mapping.get(service) or "").rstrip("/")


def unwrap_chart_payload(payload: Any) -> list[dict] | dict | Any:
    """Normalize Postman-style envelopes to rows or a single object."""
    if payload is None:
        return []
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return payload
    # { status, data: [...] } or { status, data: {...} }
    if "data" in payload:
        data = payload["data"]
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            # gateway style: { chartId: { data: [...] } }
            if all(isinstance(v, dict) and ("data" in v or "chartName" in v) for v in data.values()):
                # return first chart's data if single; else full map
                if len(data) == 1:
                    only = next(iter(data.values()))
                    return only.get("data", only)
                return data
            return data
    return payload


async def fetch_chart(
    *,
    service: str,
    chart_key: str,
    endpoint: str | None = None,
    params: dict | None = None,
    settings: Settings | None = None,
) -> tuple[Any, dict]:
    """
    Returns (normalized_data, meta).
    meta includes upstream_ok, url, error.
    """
    settings = settings or get_settings()
    base = _base_for(service, settings)
    meta: dict[str, Any] = {"service": service, "chart_key": chart_key, "upstream_ok": False}

    if not base:
        meta["error"] = (
            f"Upstream '{service}' is not configured. "
            f"Set UPSTREAM_{service.upper()}_BASE_URL in the environment."
        )
        return [], meta

    path = endpoint or f"/api/v1/charts/{chart_key}"
    if not path.startswith("http"):
        url = f"{base}{path if path.startswith('/') else '/' + path}"
    else:
        url = path

    meta["url"] = url
    try:
        async with httpx.AsyncClient(timeout=settings.upstream_timeout_seconds) as client:
            res = await client.get(url, params=params or {})
        if res.status_code >= 400:
            meta["error"] = f"HTTP {res.status_code}: {res.text[:300]}"
            meta["status_code"] = res.status_code
            return [], meta
        payload = res.json()
        meta["upstream_ok"] = True
        return unwrap_chart_payload(payload), meta
    except Exception as exc:  # noqa: BLE001
        meta["error"] = str(exc)
        return [], meta


async def fetch_report_charts(
    *,
    service: str,
    chart_keys: list[str],
    endpoint: str | None = None,
    params: dict | None = None,
    settings: Settings | None = None,
) -> tuple[dict[str, Any], dict]:
    """Fetch one or more chart keys; returns {chart_key: data}, aggregate meta."""
    settings = settings or get_settings()
    out: dict[str, Any] = {}
    errors: list[str] = []
    urls: list[str] = []
    ok = True

    # Prefer explicit endpoint for the primary chart when provided
    for i, key in enumerate(chart_keys or []):
        ep = endpoint if i == 0 and endpoint else None
        data, meta = await fetch_chart(service=service, chart_key=key, endpoint=ep, params=params, settings=settings)
        out[key] = data
        if meta.get("url"):
            urls.append(meta["url"])
        if not meta.get("upstream_ok"):
            ok = False
            if meta.get("error"):
                errors.append(f"{key}: {meta['error']}")

    return out, {
        "upstream_ok": ok and bool(chart_keys),
        "errors": errors,
        "urls": urls,
    }
