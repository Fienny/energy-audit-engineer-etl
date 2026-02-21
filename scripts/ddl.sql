-- =================================================================
-- Energy Audit System — PostgreSQL DDL
-- =================================================================

-- Enums
CREATE TYPE user_role AS ENUM ('operator', 'engineer', 'admin');
CREATE TYPE application_status AS ENUM (
    'new', 'in_progress', 'inspection_done', 'report_generated', 'closed'
);
CREATE TYPE inspection_status AS ENUM ('draft', 'submitted');
CREATE TYPE object_type AS ENUM (
    'residential', 'commercial', 'industrial', 'public_building', 'other'
);

-- Users
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(100) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    role          user_role    NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Clients
CREATE TABLE clients (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    contact_person  VARCHAR(255),
    phone           VARCHAR(50),
    email           VARCHAR(255),
    address         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit Objects
CREATE TABLE audit_objects (
    id            SERIAL PRIMARY KEY,
    client_id     INTEGER      NOT NULL REFERENCES clients(id),
    address       TEXT         NOT NULL,
    object_type   object_type  NOT NULL,
    total_area    NUMERIC(12,2),
    floors        INTEGER,
    year_built    INTEGER,
    description   TEXT,
    extra_params  JSONB        DEFAULT '{}',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Applications (Заявки)
CREATE TABLE applications (
    id              SERIAL PRIMARY KEY,
    operator_id     INTEGER            NOT NULL REFERENCES users(id),
    audit_object_id INTEGER            NOT NULL UNIQUE REFERENCES audit_objects(id),
    status          application_status NOT NULL DEFAULT 'new',
    service_type    VARCHAR(100)       NOT NULL DEFAULT 'energy_audit',
    notes           TEXT,
    report_generated BOOLEAN           NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ        NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ        NOT NULL DEFAULT now()
);

CREATE INDEX ix_applications_status ON applications(status);

-- Inspections (Обследования / Метрики)
CREATE TABLE inspections (
    id                      SERIAL PRIMARY KEY,
    application_id          INTEGER           NOT NULL REFERENCES applications(id),
    engineer_id             INTEGER           NOT NULL REFERENCES users(id),
    status                  inspection_status NOT NULL DEFAULT 'draft',

    -- Core energy-audit metrics
    heating_consumption     NUMERIC(12,2),
    electricity_consumption NUMERIC(12,2),
    water_consumption       NUMERIC(12,2),
    gas_consumption         NUMERIC(12,2),
    wall_thickness_mm       NUMERIC(8,2),
    window_type             VARCHAR(100),
    insulation_type         VARCHAR(100),
    thermal_resistance      NUMERIC(8,4),
    air_tightness           NUMERIC(8,4),
    indoor_temperature      NUMERIC(5,2),
    outdoor_temperature     NUMERIC(5,2),

    -- Extensible JSONB for future metrics
    extra_metrics           JSONB DEFAULT '{}',
    notes                   TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at            TIMESTAMPTZ,

    CONSTRAINT uq_inspection_application_engineer
        UNIQUE (application_id, engineer_id)
);

CREATE INDEX ix_inspections_app_status ON inspections(application_id, status);

-- Seed: default admin user (password = "admin")
-- bcrypt hash for "admin"
INSERT INTO users (username, hashed_password, full_name, role)
VALUES ('admin', '$2b$12$1VWu8f85hA5zn1zBKBsQCu12fi3SYg/1BaQf9Mvvb85ILH/POLD5O', 'Администратор', 'admin');
