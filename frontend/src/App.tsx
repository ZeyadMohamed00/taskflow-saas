import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api, ApiError, getToken, setToken } from "./api";
import { Login } from "./Login";
import { Board } from "./Board";
import { TaskDetail } from "./TaskDetail";
import { atLeast, type Dashboard, type Me, type Member, type Notification, type Org, type Priority, type Project, type Status, type Task } from "./types";
import { Avatar, Badge, Bar, Donut, Empty, Modal, Shell, Skeleton, Stat, ToastProvider, ago, useToast } from "./ui";

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const logout = useCallback(() => { setToken(null); setAuthed(false); }, []);
  return <ToastProvider>{authed ? <Workspace onLogout={logout} /> : <Login onLoggedIn={() => setAuthed(true)} />}</ToastProvider>;
}

type Page = "dashboard" | "board" | "list" | "projects" | "team" | "inbox";
const STATUS_LABEL: Record<Status, string> = { todo: "To do", doing: "In progress", done: "Done" };

function Workspace({ onLogout }: { onLogout: () => void }) {
  const toast = useToast();
  const [page, setPage] = useState<Page>("dashboard");
  const [me, setMe] = useState<Me | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [oid, setOid] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [open, setOpen] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const guard = useCallback(async (fn: () => Promise<void>) => {
    setError("");
    try { await fn(); } catch (e) {
      if (e instanceof ApiError && e.status === 401) onLogout(); else { setError((e as Error).message); toast((e as Error).message, "bad"); }
    }
  }, [onLogout, toast]);

  const role = orgs.find((o) => o.id === oid)?.role;
  const project = projects.find((p) => p.id === pid);

  const loadOrgs = useCallback(() => guard(async () => { const o = await api.orgs(); setOrgs(o); setOid((c) => c ?? o[0]?.id ?? null); }), [guard]);
  const loadTasks = useCallback(() => guard(async () => {
    if (pid === null) { setTasks([]); return; }
    const r = await api.tasks(pid, { q, status, priority, assignee_id: onlyMine && me ? me.id : undefined, size: 100 });
    setTasks(r.items);
  }), [guard, pid, q, status, priority, onlyMine, me]);
  const loadDash = useCallback(() => guard(async () => { if (oid !== null) setDash(await api.dashboard(oid)); }), [guard, oid]);
  const loadNotifs = useCallback(() => guard(async () => setNotifs(await api.notifications())), [guard]);
  const loadMine = useCallback(() => guard(async () => {
    if (!me || !projects.length) { setMyTasks([]); return; }
    const all = await Promise.all(projects.map((p) => api.tasks(p.id, { assignee_id: me.id, size: 100 })));
    setMyTasks(all.flatMap((r) => r.items).filter((t) => t.status !== "done"));
  }), [guard, me, projects]);

  useEffect(() => { guard(async () => setMe(await api.me())); loadOrgs(); loadNotifs(); }, [guard, loadOrgs, loadNotifs]);
  useEffect(() => {
    setProjects([]); setPid(null); setTasks([]); setOpen(null); setLoading(true);
    if (oid === null) return;
    guard(async () => {
      const [p, m] = await Promise.all([api.projects(oid), api.members(oid)]);
      setProjects(p.items); setPid(p.items[0]?.id ?? null); setMembers(m); setLoading(false);
    });
    loadDash();
  }, [oid, guard, loadDash]);
  useEffect(() => { const t = setTimeout(loadTasks, q ? 250 : 0); return () => clearTimeout(t); }, [loadTasks, q]);
  useEffect(() => { loadMine(); }, [loadMine]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (e.key === "n" && pid !== null) { e.preventDefault(); setCreating(true); }
      if (e.key === "/") { e.preventDefault(); setPage("board"); setTimeout(() => searchRef.current?.focus(), 50); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [pid]);

  const refresh = async () => { await Promise.all([loadTasks(), loadDash(), loadNotifs(), loadMine()]); };
  const move = (t: Task, s: Status) => guard(async () => { await api.updateTask(t.id, { status: s }); toast(`Moved to ${STATUS_LABEL[s]}`, "ok"); await refresh(); });
  const unread = notifs.filter((n) => !n.read).length;
  const who = (id: number | null) => (id ? members.find((m) => m.user_id === id)?.name || members.find((m) => m.user_id === id)?.email || `user ${id}` : "Unassigned");

  const filters = (
    <div className="row">
      <input ref={searchRef} aria-label="Search tasks" placeholder="Search tasks  ( / )" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value as Status | "")}><option value="">All statuses</option><option value="todo">To do</option><option value="doing">In progress</option><option value="done">Done</option></select>
      <select aria-label="Filter priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")}><option value="">All priorities</option><option>high</option><option>medium</option><option>low</option></select>
      <button className={`chip ${onlyMine ? "on" : ""}`} onClick={() => setOnlyMine(!onlyMine)}>Assigned to me</button>
    </div>
  );

  return (
    <Shell brand="TaskFlow" tagline={orgs.find((o) => o.id === oid)?.name} page={page} onNav={(p) => setPage(p as Page)}
      nav={[
        { id: "dashboard", label: "Dashboard", icon: "▦" }, { id: "board", label: "Board", icon: "☷" }, { id: "list", label: "List", icon: "☰" },
        { id: "projects", label: "Projects", icon: "▤", badge: projects.length }, { id: "team", label: "Team", icon: "☺", badge: members.length },
        { id: "inbox", label: "Notifications", icon: "✉", badge: unread },
      ]}
      actions={<>
        {pid !== null && <button className="btn primary sm" onClick={() => setCreating(true)}>+ New task <span className="kbd">n</span></button>}
        <select aria-label="Project" value={pid ?? ""} onChange={(e) => setPid(Number(e.target.value))}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </>}
      footer={<div className="col" style={{ padding: 8 }}>
        <select aria-label="Organization" value={oid ?? ""} onChange={(e) => setOid(Number(e.target.value))}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        <div className="row"><Avatar name={me?.name || me?.email || "?"} /><div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{me?.name || me?.email}</div><div className="small muted">{role}</div></div></div>
        <button className="btn sm" onClick={onLogout}>Log out</button>
      </div>}>
      {error && <p role="alert" className="err">{error}</p>}

      {page === "dashboard" && (
        <>
          <div className="page-h"><div><h1>Welcome back{me?.name ? `, ${me.name.split(" ")[0]}` : ""}</h1><p>Here is where your workspace stands today.</p></div></div>
          {!dash ? <Skeleton lines={4} /> : (
            <>
              <div className="grid g4">
                <Stat label="Total tasks" value={dash.total} hint={`${dash.percent_done}% complete`} />
                <Stat label="In progress" value={dash.doing} hint={`${dash.todo} waiting`} />
                <Stat label="Assigned to me" value={dash.assigned_to_me} hint="Open tasks" />
                <Stat label="Overdue" value={<span style={{ color: dash.overdue ? "var(--bad)" : undefined }}>{dash.overdue}</span>} hint={dash.overdue ? "Needs attention" : "All on track"} />
              </div>
              <div className="grid g-main">
                <div className="card"><h3>Project progress</h3>
                  {dash.projects.length === 0 && <Empty title="No projects yet" hint="Create one on the Projects page" />}
                  <div className="col">{dash.projects.map((p) => (
                    <div key={p.project_id}><div className="row"><b>{p.name}</b><span className="muted small sp">{p.done}/{p.total} done</span></div><Bar pct={p.total ? (100 * p.done) / p.total : 0} /></div>
                  ))}</div>
                </div>
                <div className="card"><h3>Status mix</h3><Donut parts={[{ label: "To do", value: dash.todo, color: "#94a3b8" }, { label: "In progress", value: dash.doing, color: "#f59e0b" }, { label: "Done", value: dash.done, color: "#22c55e" }]} /></div>
              </div>
              <div className="card"><h3>My open tasks</h3>
                {myTasks.length === 0 ? <Empty icon="✓" title="You're all caught up" hint="Nothing is assigned to you right now." /> : (
                  <div className="list">{myTasks.slice(0, 8).map((t) => (
                    <div key={t.id} className="row"><button className="btn ghost" onClick={() => setOpen(t)}>{t.title}</button><Badge kind={t.priority === "high" ? "bad" : t.priority === "medium" ? "warn" : "ok"}>{t.priority}</Badge>{t.due_date && <span className="muted small">due {t.due_date}</span>}<span className="sp"><Badge>{STATUS_LABEL[t.status]}</Badge></span></div>
                  ))}</div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {page === "board" && (
        <>
          <div className="page-h"><div><h1>{project?.name ?? "Board"}</h1><p>{project?.description || "Drag cards between columns, or click one to edit."}</p></div><div className="sp">{filters}</div></div>
          {loading ? <Skeleton lines={4} /> : pid === null ? <div className="card"><Empty title="No project yet" hint="Create your first project to get started."><p><button className="btn primary" style={{ marginTop: 10 }} onClick={() => setPage("projects")}>Go to Projects</button></p></Empty></div>
            : <Board tasks={tasks} role={role} me={me} members={members} onOpen={setOpen} onMove={move} />}
        </>
      )}

      {page === "list" && (
        <>
          <div className="page-h"><div><h1>All tasks</h1><p>{tasks.length} in {project?.name ?? "project"}</p></div><div className="sp">{filters}</div></div>
          <div className="card tw">
            {tasks.length === 0 ? <Empty title="No tasks match" hint="Try clearing the filters." /> : (
              <table className="t"><thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due</th></tr></thead>
                <tbody>{tasks.map((t) => (
                  <tr key={t.id}><td><button className="btn ghost" onClick={() => setOpen(t)}>{t.title}</button></td><td><Badge kind={t.status === "done" ? "ok" : t.status === "doing" ? "warn" : ""}>{STATUS_LABEL[t.status]}</Badge></td>
                    <td><Badge kind={t.priority === "high" ? "bad" : t.priority === "medium" ? "warn" : "ok"}>{t.priority}</Badge></td><td>{who(t.assignee_id)}</td><td>{t.due_date ?? "-"}</td></tr>
                ))}</tbody></table>
            )}
          </div>
        </>
      )}

      {page === "projects" && (
        <ProjectsPage projects={projects} dash={dash} role={role} onSelect={(id) => { setPid(id); setPage("board"); }}
          onCreate={(name, desc) => guard(async () => { const p = await api.createProject(oid!, name, desc); setProjects((x) => [...x, p]); setPid(p.id); toast("Project created", "ok"); await loadDash(); })} />
      )}

      {page === "team" && (
        <TeamPage members={members} role={role} me={me}
          onInvite={(email, r) => guard(async () => { await api.addMember(oid!, email, r); setMembers(await api.members(oid!)); toast("Member added", "ok"); })}
          onRole={(m, r) => guard(async () => { await api.setRole(oid!, m.user_id, r); setMembers(await api.members(oid!)); await loadOrgs(); toast("Role updated", "ok"); })} />
      )}

      {page === "inbox" && (
        <>
          <div className="page-h"><div><h1>Notifications</h1><p>{unread} unread</p></div></div>
          <div className="card">
            {notifs.length === 0 ? <Empty icon="✉" title="No notifications" hint="You'll see assignments and comments here." /> : (
              <div className="list">{notifs.map((n) => (
                <div key={n.id} className="row"><span style={{ width: 8, height: 8, borderRadius: 4, background: n.read ? "transparent" : "var(--accent)" }} /><span style={{ fontWeight: n.read ? 400 : 600 }}>{n.text}</span><span className="muted small sp">{n.created_at ? ago(n.created_at) : ""}</span>
                  {!n.read && <button className="btn sm" onClick={() => guard(async () => { await api.markRead(n.id); await loadNotifs(); })}>Mark read</button>}</div>
              ))}</div>
            )}
          </div>
        </>
      )}

      {open && <TaskDetail task={open} members={members} me={me} role={role} onClose={() => setOpen(null)} onChanged={refresh} />}
      {creating && pid !== null && <NewTask members={members} canAssign={atLeast(role, "manager")} me={me} onClose={() => setCreating(false)}
        onCreate={(b) => guard(async () => { await api.createTask(pid, b); toast("Task created", "ok"); setCreating(false); await refresh(); })} />}
    </Shell>
  );
}

function NewTask({ members, canAssign, me, onClose, onCreate }: { members: Member[]; canAssign: boolean; me: Me | null; onClose: () => void; onCreate: (b: { title: string; description: string; priority: Priority; assignee_id: number | null; due_date: string | null }) => void }) {
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [priority, setPriority] = useState<Priority>("medium");
  const [assignee, setAssignee] = useState<number | null>(null); const [due, setDue] = useState("");
  const submit = (e: FormEvent) => { e.preventDefault(); if (title.trim()) onCreate({ title: title.trim(), description, priority, assignee_id: assignee, due_date: due || null }); };
  return (
    <Modal title="New task" onClose={onClose}>
      <form className="col" onSubmit={submit}>
        <label className="f">Title<input aria-label="New task title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" /></label>
        <label className="f">Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <div className="grid g3">
          <label className="f">Priority<select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}><option>low</option><option>medium</option><option>high</option></select></label>
          <label className="f">Assignee<select value={assignee ?? ""} onChange={(e) => setAssignee(e.target.value ? Number(e.target.value) : null)}><option value="">Unassigned</option>{members.filter((m) => canAssign || m.user_id === me?.id).map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}</select></label>
          <label className="f">Due<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        </div>
        <div className="row"><button className="btn primary" type="submit" disabled={!title.trim()}>Create task</button><button className="btn" type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

function ProjectsPage({ projects, dash, role, onSelect, onCreate }: { projects: Project[]; dash: Dashboard | null; role: string | undefined; onSelect: (id: number) => void; onCreate: (n: string, d: string) => void }) {
  const [show, setShow] = useState(false); const [name, setName] = useState(""); const [desc, setDesc] = useState("");
  const stats = useMemo(() => new Map(dash?.projects.map((p) => [p.project_id, p])), [dash]);
  return (
    <>
      <div className="page-h"><div><h1>Projects</h1><p>{projects.length} in this organization</p></div>{atLeast(role as never, "manager") && <div className="sp"><button className="btn primary" onClick={() => setShow(true)}>+ New project</button></div>}</div>
      {projects.length === 0 ? <div className="card"><Empty title="No projects" hint="Managers and admins can create projects." /></div> : (
        <div className="grid g3">{projects.map((p) => { const s = stats.get(p.id); const pct = s && s.total ? (100 * s.done) / s.total : 0; return (
          <button key={p.id} className="card col" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => onSelect(p.id)}>
            <h3>{p.name}</h3><p className="muted small">{p.description || "No description"}</p><Bar pct={pct} /><span className="small muted">{s ? `${s.done}/${s.total} tasks done` : ""}</span>
          </button>); })}</div>
      )}
      {show && <Modal title="New project" onClose={() => setShow(false)}>
        <form className="col" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onCreate(name.trim(), desc); setShow(false); setName(""); setDesc(""); } }}>
          <label className="f">Name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="f">Description<textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
          <button className="btn primary" disabled={!name.trim()}>Create project</button>
        </form></Modal>}
    </>
  );
}

function TeamPage({ members, role, me, onInvite, onRole }: { members: Member[]; role: string | undefined; me: Me | null; onInvite: (e: string, r: string) => void; onRole: (m: Member, r: string) => void }) {
  const [email, setEmail] = useState(""); const [r, setR] = useState("member");
  return (
    <>
      <div className="page-h"><div><h1>Team</h1><p>Roles decide who can create projects, assign work and manage people.</p></div></div>
      <div className="card tw"><table className="t"><thead><tr><th>Member</th><th>Email</th><th>Role</th></tr></thead><tbody>
        {members.map((m) => (
          <tr key={m.user_id}><td><span className="row"><Avatar name={m.name || m.email} />{m.name || "-"}{m.user_id === me?.id && <Badge kind="acc">you</Badge>}</span></td><td className="muted">{m.email}</td>
            <td>{role === "admin" && m.user_id !== me?.id ? <select aria-label={`Role for ${m.email}`} value={m.role} onChange={(e) => onRole(m, e.target.value)}><option>admin</option><option>manager</option><option>member</option></select> : <Badge kind={m.role === "admin" ? "bad" : m.role === "manager" ? "warn" : ""}>{m.role}</Badge>}</td></tr>
        ))}</tbody></table></div>
      {role === "admin" && (
        <form className="card row" onSubmit={(e) => { e.preventDefault(); if (email) { onInvite(email, r); setEmail(""); } }}>
          <h3 style={{ margin: 0 }}>Add a member</h3><input aria-label="Member email" type="email" placeholder="email of a registered user" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select aria-label="New member role" value={r} onChange={(e) => setR(e.target.value)}><option>member</option><option>manager</option><option>admin</option></select><button className="btn primary">Add</button>
        </form>
      )}
    </>
  );
}
