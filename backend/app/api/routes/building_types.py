"""Building type / subtype reference endpoint."""

from fastapi import APIRouter

from app.core.building_types import BUILDING_TYPES

router = APIRouter(prefix="/building-types", tags=["building-types"])


@router.get("")
async def get_building_types() -> dict[str, list[str]]:
    """Return all building types with their subtypes."""
    return BUILDING_TYPES
