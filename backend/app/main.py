from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import auth, projects, files, building_types

app = FastAPI(
    title=settings.PROJECT_NAME,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
for r in (auth, projects, files, building_types):
    app.include_router(r.router, prefix=settings.API_V1_PREFIX)

# Serve frontend static files
app.mount("/", StaticFiles(directory="static", html=True), name="static")
