"""File upload / download / delete for projects."""

import os
import uuid
import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.models import Project, ProjectFile, User
from app.schemas.schemas import ProjectFileOut
from app.core.security import get_current_user
from app.core.config import settings
from jose import JWTError, jwt

router = APIRouter(tags=["files"])

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/data/uploads"))


def _verify_token(token: str | None):
    """Verify JWT token from query parameter. Raises 401 if invalid."""
    if not token:
        raise HTTPException(status_code=401, detail="Token required")
    try:
        jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")


def classify_file(filename: str) -> str:
    """Determine file_type based on extension."""
    ext = Path(filename).suffix.lower()
    if ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"):
        return "image"
    if ext in (".doc", ".docx", ".pdf", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv"):
        return "document"
    return "other"


@router.post(
    "/projects/{project_id}/files",
    response_model=list[ProjectFileOut],
    status_code=status.HTTP_201_CREATED,
)
async def upload_files(
    project_id: int,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project_dir = UPLOAD_DIR / str(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)

    created = []
    for upload in files:
        ext = Path(upload.filename or "file").suffix
        stored_name = f"{uuid.uuid4().hex}{ext}"
        file_path = project_dir / stored_name

        content = await upload.read()
        file_path.write_bytes(content)

        pf = ProjectFile(
            project_id=project_id,
            file_name=upload.filename or "unnamed",
            stored_name=stored_name,
            file_type=classify_file(upload.filename or ""),
            file_size=len(content),
            uploaded_by=current_user.id,
        )
        db.add(pf)
        await db.flush()
        await db.refresh(pf)
        created.append(pf)

    return created


@router.get("/projects/{project_id}/files", response_model=list[ProjectFileOut])
async def list_files(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProjectFile)
        .options(selectinload(ProjectFile.uploader))
        .where(ProjectFile.project_id == project_id)
        .order_by(ProjectFile.created_at.desc())
    )
    return result.scalars().all()


@router.get("/files/{file_id}/download")
async def download_file(
    file_id: int,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    _verify_token(token)
    result = await db.execute(select(ProjectFile).where(ProjectFile.id == file_id))
    pf = result.scalar_one_or_none()
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = UPLOAD_DIR / str(pf.project_id) / pf.stored_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File missing from storage")

    media_type = mimetypes.guess_type(pf.file_name)[0] or "application/octet-stream"
    return FileResponse(
        path=str(file_path),
        filename=pf.file_name,
        media_type=media_type,
    )


@router.get("/files/{file_id}/preview")
async def preview_file(
    file_id: int,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Serve file inline for preview (images)."""
    _verify_token(token)
    result = await db.execute(select(ProjectFile).where(ProjectFile.id == file_id))
    pf = result.scalar_one_or_none()
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = UPLOAD_DIR / str(pf.project_id) / pf.stored_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File missing from storage")

    media_type = mimetypes.guess_type(pf.file_name)[0] or "application/octet-stream"
    return FileResponse(path=str(file_path), media_type=media_type)


@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(ProjectFile).where(ProjectFile.id == file_id))
    pf = result.scalar_one_or_none()
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")

    # Remove physical file
    file_path = UPLOAD_DIR / str(pf.project_id) / pf.stored_name
    if file_path.exists():
        file_path.unlink()

    await db.delete(pf)
    await db.flush()
