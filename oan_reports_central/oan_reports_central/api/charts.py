"""Frappe whitelisted methods — thin proxies to the Reports Central API.

Prefer calling the FastAPI service directly from the SPA. These methods exist
so Desk/Frappe apps can reuse the same catalog once the app is installed on a bench.
"""

from __future__ import annotations

import os

import frappe
import requests


def _api_base() -> str:
    return (
        frappe.conf.get("oan_reports_api_base")
        or os.environ.get("OAN_REPORTS_API_BASE")
        or "http://127.0.0.1:8000/api"
    ).rstrip("/")


@frappe.whitelist(allow_guest=True)
def list_reports(category: str | None = None):
    params = {"category": category} if category else None
    res = requests.get(f"{_api_base()}/reports", params=params, timeout=30)
    res.raise_for_status()
    return res.json()


@frappe.whitelist(allow_guest=True)
def get_report_data(report_id: str):
    res = requests.get(f"{_api_base()}/reports/{report_id}/data", timeout=60)
    res.raise_for_status()
    return res.json()
