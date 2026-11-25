from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session
import jwt
from .db import get_db
from .models import User, Membership, Project, Task
from .security import decode_token

WRITE_ROLES = {"owner", "member"}


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    try:
        uid = decode_token(authorization[7:])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    user = db.get(User, uid)
    if not user:
        raise HTTPException(401, "Unknown user")
    return user


def membership(db: Session, user: User, workspace_id: int) -> Membership:
    """Tenant isolation: a user only ever sees workspaces they belong to.
    We answer 404 (not 403) so outsiders cannot probe which ids exist."""
    m = db.query(Membership).filter_by(user_id=user.id, workspace_id=workspace_id).first()
    if not m:
        raise HTTPException(404, "Workspace not found")
    return m


def require_write(m: Membership):
    if m.role not in WRITE_ROLES:
        raise HTTPException(403, "Your role is read-only")


def project_for(db: Session, user: User, project_id: int):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return p, membership(db, user, p.workspace_id)


def task_for(db: Session, user: User, task_id: int):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    _, m = project_for(db, user, t.project_id)
    return t, m
