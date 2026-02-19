"""Pydantic schemas for request / response validation."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict


# ── Auth ───────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: str
    role: str
    is_active: bool


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str  # operator | engineer | admin


# ── Client ─────────────────────────────────────────────────────────────

class ClientCreate(BaseModel):
    name: str
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None


class ClientOut(ClientCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# ── Audit Object ───────────────────────────────────────────────────────

class AuditObjectCreate(BaseModel):
    client_id: int
    address: str
    object_type: str
    total_area: float | None = None
    floors: int | None = None
    year_built: int | None = None
    description: str | None = None
    extra_params: dict | None = None


class AuditObjectOut(AuditObjectCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# ── Application ────────────────────────────────────────────────────────

class ApplicationCreate(BaseModel):
    audit_object_id: int
    service_type: str = "energy_audit"
    notes: str | None = None


class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    operator_id: int
    audit_object_id: int
    status: str
    service_type: str
    notes: str | None
    report_generated: bool
    created_at: datetime
    updated_at: datetime


class ApplicationDetail(ApplicationOut):
    audit_object: AuditObjectOut | None = None
    operator: UserOut | None = None


# ── Inspection ─────────────────────────────────────────────────────────

class InspectionCreate(BaseModel):
    application_id: int
    heating_consumption: float | None = None
    electricity_consumption: float | None = None
    water_consumption: float | None = None
    gas_consumption: float | None = None
    wall_thickness_mm: float | None = None
    window_type: str | None = None
    insulation_type: str | None = None
    thermal_resistance: float | None = None
    air_tightness: float | None = None
    indoor_temperature: float | None = None
    outdoor_temperature: float | None = None
    extra_metrics: dict | None = None
    notes: str | None = None


class InspectionUpdate(BaseModel):
    heating_consumption: float | None = None
    electricity_consumption: float | None = None
    water_consumption: float | None = None
    gas_consumption: float | None = None
    wall_thickness_mm: float | None = None
    window_type: str | None = None
    insulation_type: str | None = None
    thermal_resistance: float | None = None
    air_tightness: float | None = None
    indoor_temperature: float | None = None
    outdoor_temperature: float | None = None
    extra_metrics: dict | None = None
    notes: str | None = None


class InspectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    application_id: int
    engineer_id: int
    status: str
    heating_consumption: float | None
    electricity_consumption: float | None
    water_consumption: float | None
    gas_consumption: float | None
    wall_thickness_mm: float | None
    window_type: str | None
    insulation_type: str | None
    thermal_resistance: float | None
    air_tightness: float | None
    indoor_temperature: float | None
    outdoor_temperature: float | None
    extra_metrics: dict | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None
    engineer: UserOut | None = None
