import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, getToken, setToken } from "./api";
import { Login } from "./Login";
import { Board } from "./Board";
import { TaskDetail } from "./TaskDetail";
import { DashboardPanel, MembersPanel, NotificationList } from "./Panels";
import { atLeast, type Dashboard, type Me, type Member, type Notification, type Org, type Project, type Status, type Task } from "./types";

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const logout = useCallback(() => { setToken(null); setAuthed(false); }, []);
  if (!authed) return <Login onLoggedIn={() => setAuthed(true)} />;
  return <Workspace onLogout={logout} />;
}

function Workspace({ onLogout }: { onLogout: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [oid, setOid] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [members, setMembers] = useState<Member[]>([]);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [open, setOpen] = useState<Task | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");
  const PAGE = 50;

  // A 401 means the token expired: return to the login screen. Other errors are shown to the user.
  const guard = useCallback(async (fn: () => Promise<void>) => {
    setError("");
    try { await fn(); } catch (e) {
      if (e instanceof ApiError && e.status === 401) onLogout(); else setError((e as Error).message);
    }
  }, [onLogout]);

  const role = orgs.find((o) => o.id === oid)?.role;

  const loadOrgs = useCallback(() => guard(async () => {
    const o = await api.orgs();
    setOrgs(o);
    setOid((cur) => cur ?? o[0]?.id ?? null);
  }), [guard]);

  const loadTasks = useCallback(() => guard(async () => {
    if (pid === null) return;
    const r = await api.tasks(pid, { q, status, page, size: PAGE });
    setTasks(r.items); setTotal(r.total);
  }), [guard, pid, q, status, page]);

  const loadDash = useCallback(() => guard(async () => { if (oid !== null) setDash(await api.dashboard(oid)); }), [guard, oid]);
  const loadNotifs = useCallback(() => guard(async () => setNotifs(await api.notifications())), [guard]);

  useEffect(() => { guard(async () => setMe(await api.me())); loadOrgs(); loadNotifs(); }, [guard, loadOrgs, loadNotifs]);
  useEffect(() => {
    setProjects([]); setPid(null); setTasks([]); setOpen(null);
    if (oid === null) return;
    guard(async () => {
      const [p, m] = await Promise.all([api.projects(oid), api.members(oid)]);
      setProjects(p.items); setPid(p.items[0]?.id ?? null); setMembers(m);
    });
    loadDash();
  }, [oid, guard, loadDash]);
  useEffect(() => { setPage(1); }, [pid, q, status]);
  useEffect(() => { loadTasks(); }, [loadTasks]);

  const refresh = async () => { await loadTasks(); await loadDash(); await loadNotifs(); };

  function addTask(e: FormEvent) {
    e.preventDefault();
    if (pid === null || !newTitle.trim()) return;
    guard(async () => { await api.createTask(pid, { title: newTitle.trim() }); setNewTitle(""); await refresh(); });
  }

  return (
    <div className="app">
      <header>
        <h1>TaskFlow</h1>
        <select aria-label="Organization" value={oid ?? ""} onChange={(e) => setOid(Number(e.target.value))}>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.role})</option>)}
        </select>
        <button onClick={() => { const n = prompt("Organization name"); if (n) guard(async () => { const o = await api.createOrg(n); await loadOrgs(); setOid(o.id); }); }}>+ org</button>
        <select aria-label="Project" value={pid ?? ""} onChange={(e) => setPid(Number(e.target.value))}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {atLeast(role, "manager") && oid !== null && (
          <button onClick={() => { const n = prompt("Project name"); if (n) guard(async () => { const p = await api.createProject(oid, n); setProjects((x) => [...x, p]); setPid(p.id); await loadDash(); }); }}>+ project</button>
        )}
        {role === "admin" && oid !== null && (
          <button onClick={() => { const email = prompt("Member email"); const r = email && prompt("Role: admin, manager or member", "member"); if (email && r) guard(async () => { await api.addMember(oid, email, r); setMembers(await api.members(oid)); }); }}>+ member</button>
        )}
        <NotificationList items={notifs} onRead={(n) => guard(async () => { await api.markRead(n.id); await loadNotifs(); })} />
        <span>{me?.name || me?.email}</span>
        <button onClick={onLogout}>Log out</button>
      </header>
      {error && <p role="alert" className="err">{error}</p>}
      {dash && <DashboardPanel d={dash} />}
      <MembersPanel members={members} isAdmin={role === "admin"}
        onRole={(m, r) => guard(async () => { await api.setRole(oid!, m.user_id, r); setMembers(await api.members(oid!)); await loadOrgs(); })} />
      {pid !== null && (
        <>
          <div className="toolbar">
            <input aria-label="Search tasks" placeholder="search" value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value as Status | "")}>
              <option value="">all</option><option value="todo">todo</option><option value="doing">doing</option><option value="done">done</option>
            </select>
            <form onSubmit={addTask}>
              <input aria-label="New task" placeholder="new task" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <button type="submit">Add</button>
            </form>
          </div>
          <Board tasks={tasks} role={role} me={me} onOpen={setOpen}
            onMove={(t, s) => guard(async () => { await api.updateTask(t.id, { status: s }); await refresh(); })}
            onDelete={(t) => guard(async () => { await api.deleteTask(t.id); await refresh(); })} />
          <p>
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            {" "}Page {page} of {Math.max(1, Math.ceil(total / PAGE))} ({total} tasks){" "}
            <button disabled={page * PAGE >= total} onClick={() => setPage(page + 1)}>Next</button>
          </p>
        </>
      )}
      {open && <TaskDetail task={open} members={members} onClose={() => setOpen(null)} />}
    </div>
  );
}
