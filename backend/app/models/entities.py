from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.db import Base

# JSONB on Postgres; plain JSON elsewhere (local SQLite fallback for schema smoke tests)
JsonType = JSON().with_variant(JSONB(), "postgresql")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    category: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    tag: Mapped[str] = mapped_column(String(120), nullable=False, default="Overview")
    frequency: Mapped[str] = mapped_column(String(64), nullable=False, default="Daily")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")

    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_customized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # library | api | json
    source_type: Mapped[str] = mapped_column(String(32), default="upstream", nullable=False)
    # Upstream chart keys from Postman (e.g. ["grvKpis"])
    chart_keys: Mapped[list] = mapped_column(JsonType, default=list)
    # Which upstream family: a2c | grievance | farmer | livestock | crop | gateway
    upstream_service: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    api_endpoint: Mapped[str] = mapped_column(String(512), default="", nullable=False)
    api_method: Mapped[str] = mapped_column(String(16), default="GET", nullable=False)
    data_path: Mapped[str] = mapped_column(String(255), default="data", nullable=False)

    # Field mapping + widget layout (editable for system + custom)
    field_mapping: Mapped[dict] = mapped_column(JsonType, default=dict)
    widgets: Mapped[list] = mapped_column(JsonType, default=list)
    category_kpi_chart_key: Mapped[str] = mapped_column(String(120), default="", nullable=False)

    owner: Mapped[str] = mapped_column(String(120), default="system", nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Immutable seed snapshot so /reset can restore system reports
    seed_snapshot: Mapped[dict | None] = mapped_column(JsonType, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    report_id: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    frequency: Mapped[str] = mapped_column(String(64), nullable=False)
    day: Mapped[str] = mapped_column(String(64), default="")
    time: Mapped[str] = mapped_column(String(16), default="08:00")
    format: Mapped[str] = mapped_column(String(32), default="PDF")
    recipients: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JsonType, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
