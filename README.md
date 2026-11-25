# TaskFlow: multi-tenant SaaS project manager

Mini Trello/Asana: organizations with roles (admin / manager / member), teams, projects, tasks with assignment, comments, notifications and a statistics dashboard.

**Stack:** React 18 + TypeScript (Vite) · FastAPI · PostgreSQL · SQLAlchemy 2 · JWT · Pytest + Vitest · Docker.

## What was actually verified
| Item | Status |
|---|---|
| Backend tests: 20 pytest tests | **Run and passing against real PostgreSQL 16** (embedded, via the `pgserver` package) |
| Frontend: `npm run build` (tsc + vite) and 9 Vitest tests | **Run and passing** |
| Frontend talking to the real backend in a browser | **Not done** (tests mock `fetch`; API is covered by pytest) |
| `docker build` / `docker compose up` | **Not run** (Docker unavailable where this was built). Files are written but unverified |
| GitHub Actions workflow | In `ci/github-actions-ci.yml`, **not enabled and never run** (the push token lacked `workflow` scope) |

## Features
Register/login (JWT) · organizations & per-org roles · teams · projects (search, pagination) · tasks (priority, due date, assignee, status, search/filter/pagination) · comments · notifications (on assignment and on comments) · dashboard (counts, % done, overdue, assigned to me, per-project progress) · REST API (`/docs`).

## Run locally
```bash
# backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg2://user:pass@localhost:5432/taskflow   # default is local SQLite
uvicorn app.main:app --reload              # API on :8000, docs at /docs
pytest -q                                  # uses an embedded Postgres if pgserver is installed (pip install pgserver)
# frontend
cd frontend && npm install
npm run dev                                # :5173/app/ , proxies /api to :8000
npm test && npm run build                  # build output is served by FastAPI at /app/
```
Docker (unverified): `docker compose up --build`, then open http://localhost:8000/app/.

## Architecture
```
React SPA (frontend/src) --JSON + Bearer JWT--> FastAPI (app/main.py)
   deps.py: auth, tenant check, role check      -> SQLAlchemy models -> PostgreSQL
```
Tables: users, organizations, memberships(role), teams, team_members, projects, tasks, comments, notifications.

## Permission matrix (enforced in `app/deps.py` + routes, tested in `tests/test_permissions.py`)
| Action | admin | manager | member |
|---|---|---|---|
| Add members / change roles | yes | no | no |
| Create teams and projects | yes | yes | no |
| Delete project | yes | no | no |
| Create task | yes | yes | yes (assign only to self) |
| Edit task | any | any | only tasks assigned to / created by them |
| Reassign / delete task | yes | yes | no |
| Comment, read everything in the org | yes | yes | yes |

## Key decisions (read these to explain the project)
1. **JWT auth**: the token holds the user id and an expiry. The server verifies the signature on every request; no session table. Downside: hard to revoke early. Passwords are salted PBKDF2-SHA256 hashes.
2. **Tenant isolation**: everything hangs off an organization, and access is only through a `Membership` row. Non-members get **404, not 403**, so ids can't be probed. Tested for every resource type.
3. **Roles are per organization**, not global: the same user can be admin in one org and member in another.
4. **Authorization lives on the server**. The React app hides buttons using the same rules (`frontend/src/types.ts`), but that is only UX; the API rejects the call regardless.
5. **Pagination/search/filter** are done in SQL (`LIMIT/OFFSET`, `ILIKE`, indexed columns) with page size capped at 100 so a client can't request everything.
6. **Notifications** are written in the same DB transaction as the action that causes them, so they can't be lost or duplicated by a half-failure. The actor is never notified of their own action.
7. **Invariants**: an org must keep at least one admin; assignees and teams must belong to the same org.

## Known limits / next steps
No migrations (uses `create_all`; add Alembic), no email delivery for notifications (in-app only), no real-time updates (refresh/poll), OFFSET pagination gets slow for huge tables (use keyset), no rate limiting or refresh tokens, no file attachments.

## Interview questions to prepare
Why 404 vs 403? JWT vs sessions trade-offs? Why are roles per organization? How would you add Alembic migrations to a live DB? What breaks with OFFSET pagination at scale? Where would you add caching?
