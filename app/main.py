from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import User, Workspace, Membership, Project, Task
from . import schemas as s
from .security import hash_password, verify_password, create_token
from .deps import current_user, membership, require_write, project_for, task_for

STATIC = Path(__file__).resolve().parent.parent / "static"


def _check_assignee(db, wid, uid):
    if not db.query(Membership).filter_by(user_id=uid, workspace_id=wid).first():
        raise HTTPException(422, "Assignee must be a workspace member")


def create_app() -> FastAPI:
    Base.metadata.create_all(engine)
    app = FastAPI(title="TaskFlow", version="1.0.0")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    # ---- auth
    @app.post("/auth/register", response_model=s.Token, status_code=201)
    def register(body: s.Credentials, db: Session = Depends(get_db)):
        email = body.email.lower()
        if db.query(User).filter_by(email=email).first():
            raise HTTPException(409, "Email already registered")
        u = User(email=email, password_hash=hash_password(body.password))
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
        return {"id": user.id, "email": user.email}

    # ---- workspaces
    @app.post("/workspaces", response_model=s.WorkspaceOut, status_code=201)
    def create_workspace(body: s.WorkspaceIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
        w = Workspace(name=body.name)
        db.add(w)
        db.flush()
        db.add(Membership(user_id=user.id, workspace_id=w.id, role="owner"))
        db.commit()
        return s.WorkspaceOut(id=w.id, name=w.name, role="owner")

    @app.get("/workspaces", response_model=list[s.WorkspaceOut])
    def list_workspaces(user: User = Depends(current_user), db: Session = Depends(get_db)):
        rows = (db.query(Workspace, Membership.role).join(Membership, Membership.workspace_id == Workspace.id)
                .filter(Membership.user_id == user.id).all())
        return [s.WorkspaceOut(id=w.id, name=w.name, role=r) for w, r in rows]

    @app.post("/workspaces/{wid}/members", status_code=201)
    def add_member(wid: int, body: s.MemberIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
        m = membership(db, user, wid)
        if m.role != "owner":
            raise HTTPException(403, "Only owners can add members")
        target = db.query(User).filter_by(email=body.email.lower()).first()
        if not target:
            raise HTTPException(404, "No user with that email")
        if db.query(Membership).filter_by(user_id=target.id, workspace_id=wid).first():
            raise HTTPException(409, "Already a member")
        db.add(Membership(user_id=target.id, workspace_id=wid, role=body.role))
        db.commit()
        return {"user_id": target.id, "role": body.role}

    # ---- projects
    @app.post("/workspaces/{wid}/projects", response_model=s.ProjectOut, status_code=201)
    def create_project(wid: int, body: s.ProjectIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
        require_write(membership(db, user, wid))
        p = Project(workspace_id=wid, name=body.name)
        db.add(p)
        db.commit()
        return p

    @app.get("/workspaces/{wid}/projects", response_model=list[s.ProjectOut])
    def list_projects(wid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
        membership(db, user, wid)
        return db.query(Project).filter_by(workspace_id=wid).all()

    # ---- tasks
    @app.post("/projects/{pid}/tasks", response_model=s.TaskOut, status_code=201)
    def create_task(pid: int, body: s.TaskIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
        p, m = project_for(db, user, pid)
        require_write(m)
        if body.assignee_id is not None:
            _check_assignee(db, p.workspace_id, body.assignee_id)
        t = Task(project_id=pid, **body.model_dump())
        db.add(t)
        db.commit()
        return t

    @app.get("/projects/{pid}/tasks", response_model=list[s.TaskOut])
    def list_tasks(pid: int, status: s.Status | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
        project_for(db, user, pid)
        q = db.query(Task).filter_by(project_id=pid)
        if status:
            q = q.filter_by(status=status)
        return q.order_by(Task.id).all()

    @app.patch("/tasks/{tid}", response_model=s.TaskOut)
    def update_task(tid: int, body: s.TaskUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
        t, m = task_for(db, user, tid)
        require_write(m)
        data = body.model_dump(exclude_unset=True)
        if data.get("assignee_id") is not None:
            _check_assignee(db, m.workspace_id, data["assignee_id"])
        for k, v in data.items():
            setattr(t, k, v)
        db.commit()
        return t

    @app.delete("/tasks/{tid}", status_code=204)
    def delete_task(tid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
        t, m = task_for(db, user, tid)
        require_write(m)
        db.delete(t)
        db.commit()

    @app.get("/projects/{pid}/summary")
    def summary(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
        project_for(db, user, pid)
        counts = {"todo": 0, "doing": 0, "done": 0}
        for (st,) in db.query(Task.status).filter_by(project_id=pid):
            counts[st] += 1
        total = sum(counts.values())
        return {**counts, "total": total, "percent_done": round(100 * counts["done"] / total) if total else 0}

    app.mount("/static", StaticFiles(directory=STATIC), name="static")

    @app.get("/")
    def index():
        return FileResponse(STATIC / "index.html")

    return app


app = create_app()
