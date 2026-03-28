-- =================================================================
-- Engineering Workspace — PostgreSQL DDL
-- =================================================================

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'engineer', 'other');
CREATE TYPE project_status AS ENUM ('active', 'completed', 'archived');

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

-- Projects
CREATE TABLE projects (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50)    NOT NULL UNIQUE,
    name            VARCHAR(255)   NOT NULL,
    description     TEXT,
    status          project_status NOT NULL DEFAULT 'active',
    building_type   VARCHAR(100),
    building_subtype VARCHAR(100),
    created_by      INTEGER        NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX ix_projects_code ON projects(code);
CREATE INDEX ix_projects_status ON projects(status);

-- Project Files
CREATE TABLE project_files (
    id            SERIAL PRIMARY KEY,
    project_id    INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_name     VARCHAR(500) NOT NULL,
    stored_name   VARCHAR(500) NOT NULL,
    file_type     VARCHAR(50)  NOT NULL DEFAULT 'other',
    file_size     BIGINT       NOT NULL DEFAULT 0,
    uploaded_by   INTEGER      NOT NULL REFERENCES users(id),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_project_files_project ON project_files(project_id);

-- Seed: default admin user (password = "admin")
INSERT INTO users (username, hashed_password, full_name, role)
VALUES ('admin', '$2b$12$1VWu8f85hA5zn1zBKBsQCu12fi3SYg/1BaQf9Mvvb85ILH/POLD5O', 'Administrator', 'admin');
