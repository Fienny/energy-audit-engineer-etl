"""
Report generation endpoint.
Generates a .docx file on-the-fly and streams it to the client.
No file is persisted on disk or in DB.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.models import Application, ApplicationStatus, User, UserRole
from app.schemas.schemas import ApplicationOut
from app.services.report_generator import generate_report
from app.core.security import get_current_user

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/{app_id}/download")
async def download_report(
    app_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Application)
        .options(
            selectinload(Application.audit_object),
            selectinload(Application.operator),
            selectinload(Application.inspections),
        )
        .where(Application.id == app_id)
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    buf = generate_report(app)

    # Mark report as generated
    app.report_generated = True
    if app.status == ApplicationStatus.inspection_done:
        app.status = ApplicationStatus.report_generated
    await db.flush()

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="report_application_{app_id}.docx"'
        },
    )
