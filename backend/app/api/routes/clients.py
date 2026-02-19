from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.models import Client, User, UserRole
from app.schemas.schemas import ClientCreate, ClientOut
from app.core.security import require_role

router = APIRouter(prefix="/clients", tags=["clients"])


@router.post("", response_model=ClientOut, status_code=201)
async def create_client(
    data: ClientCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.operator, UserRole.admin)),
):
    client = Client(**data.model_dump())
    db.add(client)
    await db.flush()
    await db.refresh(client)
    return client


@router.get("", response_model=list[ClientOut])
async def list_clients(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.operator, UserRole.admin)),
):
    result = await db.execute(select(Client).order_by(Client.id.desc()))
    return result.scalars().all()


@router.get("/{client_id}", response_model=ClientOut)
async def get_client(
    client_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.operator, UserRole.admin)),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client
