"""
SQLAlchemy ORM models for the Energy Audit system.

ER relationships:
  Client 1---* AuditObject 1---1 Application *---1 User(operator)
  Application 1---* Inspection *---1 User(engineer)
"""

import enum
from datetime import datetime

from sqlalchemy import (
    String, Text, Integer, Numeric, Enum, Boolean,
    ForeignKey, DateTime, JSON, UniqueConstraint, Index,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# ── Enums ──────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    operator = "operator"
    engineer = "engineer"
    admin = "admin"


class ApplicationStatus(str, enum.Enum):
    new = "new"
    in_progress = "in_progress"
    inspection_done = "inspection_done"
    report_generated = "report_generated"
    closed = "closed"


class InspectionStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"


class ObjectType(str, enum.Enum):
    residential = "residential"
    commercial = "commercial"
    industrial = "industrial"
    public_building = "public_building"
    other = "other"


# ── Users ──────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # relationships
    applications_created: Mapped[list["Application"]] = relationship(
        back_populates="operator", foreign_keys="Application.operator_id"
    )
    inspections: Mapped[list["Inspection"]] = relationship(back_populates="engineer")


# ── Clients ────────────────────────────────────────────────────────────

class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_person: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    audit_objects: Mapped[list["AuditObject"]] = relationship(back_populates="client")


# ── Audit Objects ──────────────────────────────────────────────────────

class AuditObject(Base):
    __tablename__ = "audit_objects"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    object_type: Mapped[ObjectType] = mapped_column(Enum(ObjectType, name="object_type"), nullable=False)
    total_area: Mapped[float | None] = mapped_column(Numeric(12, 2))
    floors: Mapped[int | None] = mapped_column(Integer)
    year_built: Mapped[int | None] = mapped_column(Integer)
    description: Mapped[str | None] = mapped_column(Text)
    # JSONB for arbitrary extra parameters — keeps schema extensible
    extra_params: Mapped[dict | None] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    client: Mapped["Client"] = relationship(back_populates="audit_objects")
    application: Mapped["Application | None"] = relationship(
        back_populates="audit_object", uselist=False
    )


# ── Applications (Заявки) ─────────────────────────────────────────────

class Application(Base):
    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    operator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    audit_object_id: Mapped[int] = mapped_column(
        ForeignKey("audit_objects.id"), unique=True, nullable=False
    )
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(ApplicationStatus, name="application_status"), default=ApplicationStatus.new, nullable=False
    )
    service_type: Mapped[str] = mapped_column(
        String(100), default="energy_audit", nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text)
    report_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    operator: Mapped["User"] = relationship(
        back_populates="applications_created", foreign_keys=[operator_id]
    )
    audit_object: Mapped["AuditObject"] = relationship(back_populates="application")
    inspections: Mapped[list["Inspection"]] = relationship(back_populates="application")

    __table_args__ = (
        Index("ix_applications_status", "status"),
    )


# ── Inspections (Обследования / Метрики) ──────────────────────────────

class Inspection(Base):
    """
    Each engineer creates their own Inspection record per Application.
    `metrics` is a JSONB column — this makes adding new metric fields trivial
    without ALTER TABLE. Validation happens at the application layer.
    """
    __tablename__ = "inspections"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(
        ForeignKey("applications.id"), nullable=False
    )
    engineer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    status: Mapped[InspectionStatus] = mapped_column(
        Enum(InspectionStatus, name="inspection_status"), default=InspectionStatus.draft, nullable=False
    )

    # ── Building classification ──
    building_type: Mapped[str | None] = mapped_column(String(100))
    building_subtype: Mapped[str | None] = mapped_column(String(100))

    # ── Core energy-audit metrics (typed columns for indexing / reporting) ──
    heating_consumption: Mapped[float | None] = mapped_column(Numeric(12, 2))
    electricity_consumption: Mapped[float | None] = mapped_column(Numeric(12, 2))
    water_consumption: Mapped[float | None] = mapped_column(Numeric(12, 2))
    gas_consumption: Mapped[float | None] = mapped_column(Numeric(12, 2))
    wall_thickness_mm: Mapped[float | None] = mapped_column(Numeric(8, 2))
    window_type: Mapped[str | None] = mapped_column(String(100))
    insulation_type: Mapped[str | None] = mapped_column(String(100))
    thermal_resistance: Mapped[float | None] = mapped_column(Numeric(8, 4))
    air_tightness: Mapped[float | None] = mapped_column(Numeric(8, 4))
    indoor_temperature: Mapped[float | None] = mapped_column(Numeric(5, 2))
    outdoor_temperature: Mapped[float | None] = mapped_column(Numeric(5, 2))

    # ── Extensible JSONB bucket for any extra / future metrics ──
    extra_metrics: Mapped[dict | None] = mapped_column(JSON, default=dict)

    notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    application: Mapped["Application"] = relationship(back_populates="inspections")
    engineer: Mapped["User"] = relationship(back_populates="inspections")

    __table_args__ = (
        UniqueConstraint(
            "application_id", "engineer_id",
            name="uq_inspection_application_engineer",
        ),
        Index("ix_inspections_app_status", "application_id", "status"),
    )
