# CLAUDE.md — Project Context for AI Assistant

> **This file must be read first before making any changes to the repository.**
> After every change, update this file with what was done.

---

## Project Overview

**Energy Audit System** — self-hosted web application for managing energy audit workflows.
Operators create applications, engineers perform on-site inspections from tablets, metrics are stored in PostgreSQL, and Word reports are generated on-the-fly.

**Stack:** Python 3.12 + FastAPI, PostgreSQL 16, Vanilla JS (SPA), Docker Compose.

---

## Repository Structure

```
energy-audit-engineer-etl/
├── backend/
│   ├── app/
│   │   ├── api/routes/           # FastAPI route handlers
│   │   │   ├── auth.py           # JWT login, /me, user CRUD (admin only)
│   │   │   ├── clients.py        # Client CRUD (operator)
│   │   │   ├── objects.py        # Audit object CRUD (operator)
│   │   │   ├── applications.py   # Application CRUD + status transitions
│   │   │   ├── inspections.py    # Inspection CRUD + submit/lock logic
│   │   │   └── reports.py        # Word report generation & download
│   │   ├── core/
│   │   │   ├── config.py         # pydantic-settings, reads .env (prefix APP_)
│   │   │   └── security.py       # JWT auth, bcrypt, role-based dependencies
│   │   ├── db/
│   │   │   ├── base.py           # SQLAlchemy DeclarativeBase
│   │   │   └── session.py        # Async engine, session factory, get_db
│   │   ├── models/models.py      # All ORM models (User, Client, AuditObject, Application, Inspection)
│   │   ├── schemas/schemas.py    # Pydantic request/response schemas
│   │   ├── services/
│   │   │   └── report_generator.py  # python-docx in-memory report generation
│   │   └── main.py               # FastAPI app, CORS, router mounting, static files
│   ├── static/                   # Frontend (served by FastAPI StaticFiles)
│   │   ├── index.html            # Single HTML entry point
│   │   ├── css/style.css         # Responsive CSS (CSS Grid, mobile-friendly)
│   │   └── js/
│   │       ├── api.js            # Fetch wrapper, JWT token management
│   │       └── app.js            # SPA logic: login, tabs, forms, tables
│   ├── Dockerfile
│   └── requirements.txt
├── scripts/
│   └── ddl.sql                   # PostgreSQL schema + seed admin user
├── docker-compose.yml            # PostgreSQL 16 + backend service
├── .env.example                  # Environment variable template
├── docs/
│   └── reference.docx            # Generated reference: all enums, statuses, metrics (Russian)
├── .gitignore
├── README.md                     # Project documentation (Russian)
└── CLAUDE.md                     # ← This file
```

---

## Key Architectural Decisions

1. **Async everywhere** — SQLAlchemy async + asyncpg for non-blocking DB access.
2. **JSONB for extensibility** — `extra_params` on audit_objects, `extra_metrics` on inspections allow adding new fields without migrations.
3. **Typed columns + JSONB hybrid** — frequent metrics (heating, electricity, etc.) are typed columns for indexing; rare/future ones go to JSONB.
4. **Inspection locking** — `_assert_draft()` guard in inspections.py blocks PUT/DELETE after submit. HTTP 409 on violation.
5. **Optimistic concurrency** — `If-Unmodified-Since` header support on inspection updates.
6. **UNIQUE(application_id, engineer_id)** — each engineer gets exactly one inspection record per application. Multiple engineers work on the same application without conflicts.
7. **In-memory Word reports** — python-docx writes to `io.BytesIO`, streamed via `StreamingResponse`. Nothing stored on disk/DB.
8. **Single SPA** — one `index.html`, role-dependent tabs (operator vs engineer vs admin).

---

## Database Entities

- **users** — roles: operator, engineer, admin. JWT auth with bcrypt.
- **clients** — company/person info for the audit customer.
- **audit_objects** — physical buildings/sites to be audited. Linked to client.
- **applications** — work orders created by operators. Statuses: new → in_progress → inspection_done → report_generated → closed.
- **inspections** — metric records created by engineers. Statuses: draft → submitted (immutable after submit).

---

## API Endpoints Summary

| Method | Path | Roles | Purpose |
|--------|------|-------|---------|
| POST | /api/v1/auth/login | all | OAuth2 login → JWT |
| GET | /api/v1/auth/me | all | Current user info |
| POST | /api/v1/auth/users | admin | Create user |
| GET | /api/v1/auth/users | admin | List users |
| POST | /api/v1/clients | operator | Create client |
| GET | /api/v1/clients | operator | List clients |
| GET | /api/v1/clients/{id} | operator | Get client |
| POST | /api/v1/objects | operator | Create audit object |
| GET | /api/v1/objects | operator | List objects |
| GET | /api/v1/objects/{id} | operator | Get object |
| POST | /api/v1/applications | operator | Create application |
| GET | /api/v1/applications | all | List applications |
| GET | /api/v1/applications/{id} | all | Application detail |
| PATCH | /api/v1/applications/{id}/status | all | Change status |
| POST | /api/v1/inspections | engineer | Create inspection |
| GET | /api/v1/inspections/my | engineer | My inspections |
| GET | /api/v1/inspections/by-application/{id} | all | Inspections per app |
| PUT | /api/v1/inspections/{id} | engineer | Update draft only |
| POST | /api/v1/inspections/{id}/submit | engineer | Lock inspection |
| DELETE | /api/v1/inspections/{id} | engineer | Delete draft only |
| GET | /api/v1/reports/{id}/download | all | Generate & download .docx |

---

## Running the Project

```bash
docker-compose up --build
# http://localhost:8000
# Default admin: admin / admin
```

---

## Changelog

### 2026-02-19 — Initial Implementation

**What was done:**

1. **Project structure created** — full directory tree for backend, frontend, scripts, docker.
2. **PostgreSQL DDL** (`scripts/ddl.sql`):
   - Created ENUM types: `user_role`, `application_status`, `inspection_status`, `object_type`.
   - Created tables: `users`, `clients`, `audit_objects`, `applications`, `inspections`.
   - Added indexes on `applications.status` and `inspections(application_id, status)`.
   - Added UNIQUE constraint `(application_id, engineer_id)` on inspections.
   - Seeded default admin user (admin/admin).
3. **SQLAlchemy ORM models** (`backend/app/models/models.py`):
   - Mapped all 5 tables with relationships, enums, JSONB columns.
4. **Pydantic schemas** (`backend/app/schemas/schemas.py`):
   - Request/response schemas for all entities.
5. **Core config & security**:
   - `config.py` — pydantic-settings with `APP_` prefix, reads `.env`.
   - `security.py` — JWT creation/validation, bcrypt hashing, `require_role()` dependency factory.
6. **API routes** (6 route modules):
   - `auth.py` — login, /me, user management.
   - `clients.py` — CRUD for clients.
   - `objects.py` — CRUD for audit objects.
   - `applications.py` — CRUD + status transitions for applications.
   - `inspections.py` — full lifecycle: create → edit → submit (lock) → delete. Enforces draft-only edits, ownership checks, optimistic concurrency.
   - `reports.py` — streams .docx report, marks `report_generated=True`.
7. **Report generator** (`backend/app/services/report_generator.py`):
   - python-docx generates in-memory .docx with application info, object details, all inspections with metric tables.
   - Section 3 left blank for manual completion by engineer.
8. **Frontend** (Vanilla JS SPA):
   - `index.html` — single entry point.
   - `api.js` — fetch wrapper with JWT, auto-logout on 401, blob download for reports.
   - `app.js` — login form, role-based tabs, CRUD forms for all entities, inspection editing with save/submit/delete.
   - `style.css` — responsive layout, status badges, tablet-friendly.
9. **Docker Compose** — PostgreSQL 16 + FastAPI backend, DDL auto-applied via docker-entrypoint-initdb.d.
10. **Configuration** — `.env.example`, `.gitignore`, `Dockerfile`.

### 2026-02-19 — Reference Document (Russian)

**What was done:**

1. **Reference Word document** (`docs/reference.docx`):
   - Created `scripts/generate_reference_doc.py` — standalone script that generates the reference .docx.
   - The document contains full Russian-language descriptions of:
     - **User roles** (operator, engineer, admin) — with access rights.
     - **Application statuses** (new → in_progress → inspection_done → report_generated → closed) — with transition rules and who triggers each.
     - **Inspection statuses** (draft → submitted) — with locking explanation.
     - **Object types** (residential, commercial, industrial, public_building, other) — with examples.
     - **Service types** (energy_audit) — with extensibility notes.
     - **All 11 core metrics** — field name, Russian name, unit, data type, description.
     - **Extra metrics (JSONB)** — format and usage.
     - **All 5 database tables** — full field-by-field reference with types and descriptions.
   - Output: `docs/reference.docx` (42 KB), generated via python-docx.

### 2026-02-20 — README.md

**What was done:**

1. **README.md** created (Russian language) with:
   - Project description and feature list.
   - Tech stack table.
   - Quick start guide (docker-compose).
   - First steps after launch (step-by-step).
   - Full project structure tree.
   - ER diagram (text).
   - Business process flow diagram (text).
   - API endpoints table.
   - Metrics reference table (11 core metrics + JSONB).
   - Extensibility guide.
   - Environment variables reference.
   - Link to reference.docx for detailed Russian docs.
