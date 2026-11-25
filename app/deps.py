"""Authentication + authorization helpers.

Permission matrix (enforced here, tested in tests/test_permissions.py):
  admin   : everything, incl. members/roles, deleting projects
  manager : create teams/projects/tasks, assign anyone, edit any task, delete tasks
  member  : create tasks, comment, edit ONLY tasks assigned to them or created by them
"""
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session
import jwt
from .db import get_db
from .models import User, Membership, Project, Task, Team
from .security import decode_token

RANK = {"member": 1, "manager": 2, "admin": 3}


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


def membership(db: Session, user: User, org_id: int) -> Membership:
    """Tenant isolation. Non-members get 404 (not 403) so ids cannot be probed."""
    m = db.query(Membership).filter_by(user_id=user.id, org_id=org_id).first()
    if not m:
        raise HTTPException(404, "Organization not found")
    return m


def require(m: Membership, minimum: str):
    if RANK[m.role] < RANK[minimum]:
        raise HTTPException(403, f"Requires role {minimum} or higher")


def project_for(db: Session, user: User, project_id: int):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return p, membership(db, user, p.org_id)


def task_for(db: Session, user: User, task_id: int):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    p, m = project_for(db, user, t.project_id)
    return t, p, m


def can_edit_task(m: Membership, user: User, t: Task) -> bool:
    return RANK[m.role] >= RANK["manager"] or t.assignee_id == user.id or t.created_by == user.id


def check_assignee(db: Session, org_id: int, uid: int):
    if not db.query(Membership).filter_by(user_id=uid, org_id=org_id).first():
        raise HTTPException(422, "Assignee must belong to the organization")


def team_in_org(db: Session, org_id: int, team_id: int) -> Team:
    t = db.get(Team, team_id)
    if not t or t.org_id != org_id:
        raise HTTPException(422, "Team not in this organization")
    return t
