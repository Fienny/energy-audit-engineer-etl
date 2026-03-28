"""
SQLAlchemy ORM models for the Engineering Workspace.

ER relationships:
  User 1---* Project (created_by)
  Project 1---* ProjectFile
  User 1---* ProjectFile (uploaded_by)
"""

import enum
from datetime import datetime

from sqlalchemy import (
    String, Text, Integer, BigInteger, Enum, Boolean,
    ForeignKey, DateTime, Index,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# -- Enums --

class UserRole(str, enum.Enum):
    admin = "admin"
    engineer = "engineer"
    other = "other"


class ProjectStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    archived = "archived"


# -- Users --

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

    projects_created: Mapped[list["Project"]] = relationship(
        back_populates="creator", foreign_keys="Project.created_by"
    )
    files_uploaded: Mapped[list["ProjectFile"]] = relationship(
        back_populates="uploader", foreign_keys="ProjectFile.uploaded_by"
    )


# -- Projects --

class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus, name="project_status"), default=ProjectStatus.active, nullable=False
    )
    building_type: Mapped[str | None] = mapped_column(String(100))
    building_subtype: Mapped[str | None] = mapped_column(String(100))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    creator: Mapped["User"] = relationship(
        back_populates="projects_created", foreign_keys=[created_by]
    )
    files: Mapped[list["ProjectFile"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_projects_code", "code"),
        Index("ix_projects_status", "status"),
    )


# -- Project Files --

class ProjectFile(Base):
    __tablename__ = "project_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    stored_name: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), default="other", nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    project: Mapped["Project"] = relationship(back_populates="files")
    uploader: Mapped["User"] = relationship(
        back_populates="files_uploaded", foreign_keys=[uploaded_by]
    )

    __table_args__ = (
        Index("ix_project_files_project", "project_id"),
    )
