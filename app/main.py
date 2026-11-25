from pathlib import Path
from datetime import date
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, or_, case
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import User, Organization, Membership, Team, TeamMember, Project, Task, Comment, Notification
from . import schemas as s
from .security import hash_password, verify_password, create_token
from .deps import current_user, membership, require, project_for, task_for, can_edit_task, check_assignee, team_in_org

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def notify(db: Session, user_id: int | None, actor_id: int, task: Task, text: str):
    if user_id and user_id != actor_id:
        db.add(Notification(user_id=user_id, task_id=task.id, text=text))


def create_app() -> FastAPI:
    Base.metadata.create_all(engine)
    app = FastAPI(title="TaskFlow", version="2.0.0")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    # ------------------------------------------------------------- auth
    @app.post("/auth/register", response_model=s.Token, status_code=201)
    def register(body: s.Credentials, db: Session = Depends(get_db)):
        email = body.email.lower()
        if db.query(User).filter_by(email=email).first():
            raise HTTPException(409, "Email already registered")
        u = User(email=email, name=body.name, password_hash=hash_password(body.password))
        db.add(u)
        db.commit()
        return s.Token(access_token=create_token(u.id))

    @app.post("/auth/login", response_model=s.Token)
    def login(body: s.Credentials, db: Session = Depends(get_db)):
        u = db.query(User).filter_by(email=body.email.lower()).first()
        if not u or not verify_password(body.password, u.password_hash):
            raise HTTPException(401, "Wrong email or password")
        return s.Token(access_token=create_token(u.id))

    @app.get("/me")
    def me(user: User = Depends(current_user)):
        return {"id": user.id, "email": user.email, "name": user.name}

    # ---------------------------------------------------- organizations
    @app.post("/orgs", response_model=s.OrgOut, status_code=201)
    def create_org(body: s.OrgIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
        o = Organization(name=body.name)
        db.add(o)
        db.flush()
        db.add(Membership(user_id=user.id, org_id=o.id, role="admin"))
        db.commit()
        return s.OrgOut(id=o.id, name=o.name, role="admin")

    @app.get("/orgs", response_model=list[s.OrgOut])
    def list_orgs(user: User = Depends(current_user), db: Session = Depends(get_db)):
        rows = (db.query(Organization, Membership.role).join(Membership, Membership.org_id == Organization.id)
                .filter(Membership.user_id == user.id).order_by(Organization.id).all())
        return [s.OrgOut(id=o.id, name=o.name, role=r) for o, r in rows]

    @app.get("/orgs/{oid}/members", response_model=list[s.MemberOut])
    def list_members(oid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
        membership(db, user, oid)
        rows = (db.query(User, Membership.role).join(Membership, Membership.user_id == User.id)
                .filter(Membership.org_id == oid).order_by(User.id).all())
        return [s.MemberOut(user_id=u.id, email=u.email, name=u.name, role=r) for u, r in rows]

    @app.post("/orgs/{oid}/members", status_code=201)
    def add_member(oid: int, body: s.MemberIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
        require(membership(db, user, oid), "admin")
        target = db.query(User).filter_by(email=body.email.lower()).first()
        if not target:
            raise HTTPException(404, "No user with that email")
        if db.query(Membership).filter_by(user_id=target.id, org_id=oid).first():
            raise HTTPException(409, "Already a member")
        db.add(Membership(user_id=target.id, org_id=oid, role=body.role))
        db.commit()
        return {"user_id": target.id, "role": body.role}

    @app.patch("/orgs/{oid}/members/{uid}")
    def change_role(oid: int, uid: int, body: s.MemberRoleIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
        require(membership(db, user, oid), "admin")
        m = db.query(Membership).filter_by(user_id=uid, org_id=oid).first()
        if not m:
            raise HTTPException(404, "Member not found")
        if m.role == "admin" and body.role != "admin":
            admins = db.query(Membership).filter_by(org_id=oid, role="admin").count()
            if admins <= 1:
                raise HTTPException(409, "An organization needs at least one admin")
        m.role = body.role
        db.commit()
        return {"user_id": uid, "role": m.role}

    # ------------------------------------------------------------ teams
    @app.post("/orgs/{oid}/teams", response_model=s.TeamOut, status_code=201)
    def create_team(oid: int, body: s.TeamIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
        require(membership(db, user, oid), "manager")
        t = Team(org_id=oid, name=body.name)
        db.add(t)
        db.commit()
        return t

    @app.get("/orgs/{oid}/teams", response_model=list[s.TeamOut])
    def list_teams(oid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
        membership(db, user, oid)
        return db.query(Team).filter_by(org_id=oid).order_by(Team.id).all()

    @app.post("/orgs/{oid}/teams/{tid}/members", status_code=201)
    def add_team_member(oid: int, tid: int, body: s.TeamMemberIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
        require(membership(db, user, oid), "manager")
        team_in_org(db, oid, tid)
        check_assignee(db, oid, body.user_id)
        if db.query(TeamMember).filter_by(team_id=tid, user_id=body.user_id).first():
            raise HTTPException(409, "Already in team")
        db.add(TeamMember(team_id=tid, user_id=body.user_id))
        db.commit()
        return {"team_id": tid, "user_id": body.user_id}

    # --------------------------------------------------------- projects
    @app.post("/orgs/{oid}/projects", response_model=s.ProjectOut, status_code=201)
    def create_project(oid: int, body: s.ProjectIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
        require(membership(db, user, oid), "manager")
        if body.team_id is not None:
            team_in_org(db, oid, body.team_id)
        p = Project(org_id=oid, **body.model_dump())
        db.add(p)
        db.commit()
        return p

    @app.get("/orgs/{oid}/projects", response_model=s.Page[s.ProjectOut])
    def list_projects(oid: int, q: str = "", page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
                      user: User = Depends(current_user), db: Session = Depends(get_db)):
        membership(db, user, oid)
        query = db.query(Project).filter_by(org_id=oid)
        if q:
            query = query.filter(Project.name.ilike(f"%{q}%"))
        total = query.count()
        items = query.order_by(Project.id).offset((page - 1) * size).limit(size).all()
        return s.Page[s.ProjectOut](items=items, total=total, page=page, size=size)

    @app.delete("/projects/{pid}", status_code=204)
    def delete_project(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
        p, m = project_for(db, user, pid)
        require(m, "admin")
        db.delete(p)
        db.commit()

    # ------------------------------------------------------------ tasks
    @app.post("/projects/{pid}/tasks", response_model=s.TaskOut, status_code=201)
    def create_task(pid: int, body: s.TaskIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
        p, m = project_for(db, user, pid)
        if body.assignee_id is not None:
            check_assignee(db, p.org_id, body.assignee_id)
            if body.assignee_id != user.id:
                require(m, "manager")  # members may only assign to themselves
        t = Task(project_id=pid, created_by=user.id, **body.model_dump())
        db.add(t)
        db.flush()
        notify(db, t.assignee_id, user.id, t, f"You were assigned: {t.title}")
        db.commit()
        return t

    @app.get("/projects/{pid}/tasks", response_model=s.Page[s.TaskOut])
    def list_tasks(pid: int, q: str = "", status: s.Status | None = None, priority: s.Priority | None = None,
                   assignee_id: int | None = None, page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
                   user: User = Depends(current_user), db: Session = Depends(get_db)):
        project_for(db, user, pid)
        query = db.query(Task).filter_by(project_id=pid)
        if q:
            query = query.filter(or_(Task.title.ilike(f"%{q}%"), Task.description.ilike(f"%{q}%")))
        if status:
            query = query.filter_by(status=status)
        if priority:
            query = query.filter_by(priority=priority)
        if assignee_id is not None:
            query = query.filter_by(assignee_id=assignee_id)
        total = query.count()
        items = query.order_by(Task.id).offset((page - 1) * size).limit(size).all()
        return s.Page[s.TaskOut](items=items, total=total, page=page, size=size)

    @app.patch("/tasks/{tid}", response_model=s.TaskOut)
    def update_task(tid: int, body: s.TaskUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
        t, p, m = task_for(db, user, tid)
        if not can_edit_task(m, user, t):
            raise HTTPException(403, "Members can only edit tasks assigned to or created by them")
        data = body.model_dump(exclude_unset=True)
        if "assignee_id" in data:
            if data["assignee_id"] is not None:
                check_assignee(db, p.org_id, data["assignee_id"])
            if data["assignee_id"] != t.assignee_id and data["assignee_id"] != user.id:
                require(m, "manager")
        old_assignee = t.assignee_id
        for k, v in data.items():
            setattr(t, k, v)
        if t.assignee_id != old_assignee:
            notify(db, t.assignee_id, user.id, t, f"You were assigned: {t.title}")
        db.commit()
        return t

    @app.delete("/tasks/{tid}", status_code=204)
    def delete_task(tid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
        t, p, m = task_for(db, user, tid)
        require(m, "manager")
        db.delete(t)
        db.commit()

    # --------------------------------------------------------- comments
    @app.post("/tasks/{tid}/comments", response_model=s.CommentOut, status_code=201)
    def add_comment(tid: int, body: s.CommentIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
        t, p, m = task_for(db, user, tid)
        c = Comment(task_id=tid, author_id=user.id, body=body.body)
        db.add(c)
        for uid in {t.assignee_id, t.created_by}:
            notify(db, uid, user.id, t, f"New comment on: {t.title}")
        db.commit()
        return c

    @app.get("/tasks/{tid}/comments", response_model=list[s.CommentOut])
    def list_comments(tid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
        task_for(db, user, tid)
        return db.query(Comment).filter_by(task_id=tid).order_by(Comment.id).all()

    # ---------------------------------------------------- notifications
    @app.get("/notifications", response_model=list[s.NotificationOut])
    def notifications(unread: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
        q = db.query(Notification).filter_by(user_id=user.id)
        if unread:
            q = q.filter_by(read=False)
        return q.order_by(Notification.id.desc()).limit(50).all()

    @app.post("/notifications/{nid}/read", status_code=204)
    def mark_read(nid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
        n = db.get(Notification, nid)
        if not n or n.user_id != user.id:
            raise HTTPException(404, "Notification not found")
        n.read = True
        db.commit()

    # -------------------------------------------------------- dashboard
    @app.get("/orgs/{oid}/dashboard")
    def dashboard(oid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
        membership(db, user, oid)
        base = db.query(Task).join(Project, Project.id == Task.project_id).filter(Project.org_id == oid)
        by_status = {"todo": 0, "doing": 0, "done": 0}
        for st, n in (db.query(Task.status, func.count()).join(Project, Project.id == Task.project_id)
                      .filter(Project.org_id == oid).group_by(Task.status)):
            by_status[st] = n
        total = sum(by_status.values())
        overdue = base.filter(Task.due_date < date.today(), Task.status != "done").count()
        mine = base.filter(Task.assignee_id == user.id, Task.status != "done").count()
        per_project = [{"project_id": pid, "name": name, "total": n, "done": d or 0}
                       for pid, name, n, d in db.query(
                           Project.id, Project.name, func.count(Task.id),
                           func.sum(case((Task.status == "done", 1), else_=0)))
                       .outerjoin(Task, Task.project_id == Project.id).filter(Project.org_id == oid)
                       .group_by(Project.id, Project.name).order_by(Project.id)]
        return {**by_status, "total": total, "percent_done": round(100 * by_status["done"] / total) if total else 0,
                "overdue": overdue, "assigned_to_me": mine, "projects": per_project}

    if DIST.exists():
        app.mount("/app", StaticFiles(directory=DIST, html=True), name="frontend")

        @app.get("/", include_in_schema=False)
        def index():
            return RedirectResponse("/app/")

    return app


app = create_app()
