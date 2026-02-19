"""
Inspection routes.

Key business rules:
- Only engineers can create / update inspections.
- An engineer can only have ONE inspection per application (UNIQUE constraint).
- While status == 'draft', the engineer can edit / delete their inspection.
- After 'submit', the record is locked (immutable).
- Optimistic locking via `updated_at` prevents lost-update race conditions
  when multiple engineers work on the same application concurrently.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.models import (
    Inspection, InspectionStatus, Application, ApplicationStatus,
    User, UserRole,
)
from app.schemas.schemas import InspectionCreate, InspectionUpdate, InspectionOut
from app.core.security import require_role

router = APIRouter(prefix="/inspections", tags=["inspections"])


def _assert_draft(inspection: Inspection):
    if inspection.status == InspectionStatus.submitted:
        raise HTTPException(
            status_code=409,
            detail="Inspection already submitted and cannot be modified",
        )


@router.post("", response_model=InspectionOut, status_code=201)
async def create_inspection(
    data: InspectionCreate,
    db: AsyncSession = Depends(get_db),
    engineer: User = Depends(require_role(UserRole.engineer)),
):
    # Verify application exists and is available
    app_result = await db.execute(
        select(Application).where(Application.id == data.application_id)
    )
    app = app_result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.status == ApplicationStatus.closed:
        raise HTTPException(status_code=409, detail="Application is closed")

    # Move application to in_progress if still new
    if app.status == ApplicationStatus.new:
        app.status = ApplicationStatus.in_progress

    inspection = Inspection(
        application_id=data.application_id,
        engineer_id=engineer.id,
        **data.model_dump(exclude={"application_id"}),
    )
    db.add(inspection)
    try:
        await db.flush()
    except Exception:
        raise HTTPException(
            status_code=409,
            detail="You already have an inspection for this application",
        )
    await db.refresh(inspection)
    return inspection


@router.get("/my", response_model=list[InspectionOut])
async def my_inspections(
    db: AsyncSession = Depends(get_db),
    engineer: User = Depends(require_role(UserRole.engineer)),
):
    result = await db.execute(
        select(Inspection)
        .where(Inspection.engineer_id == engineer.id)
        .order_by(Inspection.updated_at.desc())
    )
    return result.scalars().all()


@router.get("/by-application/{app_id}", response_model=list[InspectionOut])
async def inspections_by_application(
    app_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.engineer, UserRole.operator, UserRole.admin)),
):
    result = await db.execute(
        select(Inspection)
        .options(selectinload(Inspection.engineer))
        .where(Inspection.application_id == app_id)
        .order_by(Inspection.engineer_id)
    )
    return result.scalars().all()


@router.put("/{insp_id}", response_model=InspectionOut)
async def update_inspection(
    insp_id: int,
    data: InspectionUpdate,
    db: AsyncSession = Depends(get_db),
    engineer: User = Depends(require_role(UserRole.engineer)),
    if_unmodified_since: str | None = Header(None),
):
    result = await db.execute(
        select(Inspection).where(Inspection.id == insp_id)
    )
    insp = result.scalar_one_or_none()
    if not insp:
        raise HTTPException(status_code=404, detail="Inspection not found")
    if insp.engineer_id != engineer.id:
        raise HTTPException(status_code=403, detail="Not your inspection")
    _assert_draft(insp)

    # Optimistic concurrency: if client sends If-Unmodified-Since, check it
    if if_unmodified_since:
        client_ts = datetime.fromisoformat(if_unmodified_since)
        if insp.updated_at and insp.updated_at > client_ts:
            raise HTTPException(
                status_code=409,
                detail="Data was modified by another request. Please reload.",
            )

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(insp, key, value)

    await db.flush()
    await db.refresh(insp)
    return insp


@router.post("/{insp_id}/submit", response_model=InspectionOut)
async def submit_inspection(
    insp_id: int,
    db: AsyncSession = Depends(get_db),
    engineer: User = Depends(require_role(UserRole.engineer)),
):
    """Lock the inspection — no further edits allowed."""
    result = await db.execute(
        select(Inspection).where(Inspection.id == insp_id)
    )
    insp = result.scalar_one_or_none()
    if not insp:
        raise HTTPException(status_code=404, detail="Inspection not found")
    if insp.engineer_id != engineer.id:
        raise HTTPException(status_code=403, detail="Not your inspection")
    _assert_draft(insp)

    insp.status = InspectionStatus.submitted
    insp.submitted_at = datetime.now(timezone.utc)

    # Check if ALL inspections for this application are submitted
    all_result = await db.execute(
        select(Inspection).where(Inspection.application_id == insp.application_id)
    )
    all_inspections = all_result.scalars().all()
    if all(i.status == InspectionStatus.submitted for i in all_inspections):
        app_result = await db.execute(
            select(Application).where(Application.id == insp.application_id)
        )
        app = app_result.scalar_one()
        app.status = ApplicationStatus.inspection_done

    await db.flush()
    await db.refresh(insp)
    return insp


@router.delete("/{insp_id}", status_code=204)
async def delete_inspection(
    insp_id: int,
    db: AsyncSession = Depends(get_db),
    engineer: User = Depends(require_role(UserRole.engineer)),
):
    result = await db.execute(
        select(Inspection).where(Inspection.id == insp_id)
    )
    insp = result.scalar_one_or_none()
    if not insp:
        raise HTTPException(status_code=404, detail="Inspection not found")
    if insp.engineer_id != engineer.id:
        raise HTTPException(status_code=403, detail="Not your inspection")
    _assert_draft(insp)
    await db.delete(insp)
