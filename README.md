# TaskFlow: multi-tenant project manager (FastAPI + SQLAlchemy)

A small SaaS-style backend with a minimal web UI: users sign up, create **workspaces** (tenants), invite members with roles, and manage **projects** and **tasks** on a kanban board.

> Honest scope: the UI is a single plain HTML/JS page (no React build). The focus is the backend: auth, tenant isolation, roles, tests. Docker files are provided but were **not built or run** in the environment this was written in (no Docker available); the tests and the app were run locally with Python 3.10 and SQLite.

## Stack
FastAPI, SQLAlchemy 2, SQLite (default) or PostgreSQL, JWT (PyJWT), PBKDF2 password hashing (stdlib), pytest, GitHub Actions CI.

## Run
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload     # http://localhost:8000  (API docs: /docs)
pytest -q                         # 7 tests
```
With Docker (untested by the author): `docker compose up --build`.
Set `JWT_SECRET` (32+ chars) and `DATABASE_URL` for anything beyond local use.

## Architecture
```
Browser (static/index.html) --JSON/Bearer JWT--> FastAPI routes (app/main.py)
   deps.py: auth + tenant checks  ->  models.py (SQLAlchemy)  ->  SQLite/Postgres
```
- `security.py`: password hashing, token create/decode.
- `deps.py`: `current_user`, and the helpers that load a project/task **through its workspace membership**.
- `models.py`: User, Workspace, Membership(role), Project, Task.

## How it works / key decisions
1. **Auth**: login returns a signed JWT (1h). Each request sends `Authorization: Bearer ...`; the server decodes it and loads the user. Passwords are never stored, only salted PBKDF2-SHA256 hashes.
2. **Multi-tenancy**: every project/task belongs to a workspace; access is only via a `Membership` row. Not a member -> **404** (not 403) so ids can't be probed. Tested in `test_tenant_isolation`.
3. **Roles**: owner (manage members), member (read/write), viewer (read only). Enforced in one function, `require_write`.
4. **Validation**: Pydantic rejects bad input (status must be todo/doing/done, password 8+ chars). An assignee must be a member of the same workspace.
5. **Known limits** (what I'd do next): migrations (Alembic) instead of `create_all`, refresh tokens, rate limiting, pagination, a real React frontend, an audit log.

## Interview questions to prepare
Why 404 vs 403? Why JWT and what are its downsides (no easy revocation)? How would you add Alembic? How would you scale reads? How does the ORM avoid SQL injection?

## CI
A GitHub Actions workflow is in `ci/github-actions-ci.yml`. Move it to `.github/workflows/ci.yml` to enable it. It is not enabled because the push token had no `workflow` scope, and it has not been run on GitHub.
