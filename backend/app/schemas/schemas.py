"""Pydantic schemas for request / response validation."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict


# -- Auth --

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
    role: str  # admin | engineer | other


# -- Project --

class ProjectCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    building_type: str | None = None
    building_subtype: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    building_type: str | None = None
    building_subtype: str | None = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    description: str | None
    status: str
    building_type: str | None
    building_subtype: str | None
    created_by: int
    created_at: datetime
    updated_at: datetime


class ProjectDetail(ProjectOut):
    creator: UserOut | None = None
    files: list["ProjectFileOut"] = []


# -- Project File --

class ProjectFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    file_name: str
    file_type: str
    file_size: int
    uploaded_by: int
    created_at: datetime
    uploader: UserOut | None = None
