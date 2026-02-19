from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.models import AuditObject, User, UserRole
from app.schemas.schemas import AuditObjectCreate, AuditObjectOut
from app.core.security import require_role

router = APIRouter(prefix="/objects", tags=["audit_objects"])


@router.post("", response_model=AuditObjectOut, status_code=201)
async def create_object(
    data: AuditObjectCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.operator, UserRole.admin)),
):
    obj = AuditObject(**data.model_dump())
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


@router.get("", response_model=list[AuditObjectOut])
async def list_objects(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.operator, UserRole.admin)),
):
    result = await db.execute(select(AuditObject).order_by(AuditObject.id.desc()))
    return result.scalars().all()


@router.get("/{obj_id}", response_model=AuditObjectOut)
async def get_object(
    obj_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.operator, UserRole.admin)),
):
    result = await db.execute(select(AuditObject).where(AuditObject.id == obj_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    return obj
