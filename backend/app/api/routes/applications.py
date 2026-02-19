from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.models import Application, ApplicationStatus, User, UserRole
from app.schemas.schemas import ApplicationCreate, ApplicationOut, ApplicationDetail
from app.core.security import get_current_user, require_role

router = APIRouter(prefix="/applications", tags=["applications"])


@router.post("", response_model=ApplicationOut, status_code=201)
async def create_application(
    data: ApplicationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.operator, UserRole.admin)),
):
    app = Application(
        operator_id=user.id,
        audit_object_id=data.audit_object_id,
        service_type=data.service_type,
        notes=data.notes,
    )
    db.add(app)
    await db.flush()
    await db.refresh(app)
    return app


@router.get("", response_model=list[ApplicationOut])
async def list_applications(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    q = select(Application).order_by(Application.created_at.desc())
    if status:
        q = q.where(Application.status == ApplicationStatus(status))
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{app_id}", response_model=ApplicationDetail)
async def get_application(
    app_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Application)
        .options(selectinload(Application.audit_object), selectinload(Application.operator))
        .where(Application.id == app_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@router.patch("/{app_id}/status", response_model=ApplicationOut)
async def update_status(
    app_id: int,
    new_status: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    app.status = ApplicationStatus(new_status)
    await db.flush()
    await db.refresh(app)
    return app
