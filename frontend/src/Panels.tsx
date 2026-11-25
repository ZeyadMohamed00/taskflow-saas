import type { Dashboard, Member, Notification } from "./types";

export function DashboardPanel({ d }: { d: Dashboard }) {
  return (
    <section className="stats" aria-label="Dashboard">
      <div><b>{d.total}</b> tasks</div>
      <div><b>{d.percent_done}%</b> done</div>
      <div><b>{d.overdue}</b> overdue</div>
      <div><b>{d.assigned_to_me}</b> assigned to me</div>
      <div className="bars">
        {d.projects.map((p) => (
          <div key={p.project_id}>
            {p.name}: {p.done}/{p.total}
            <progress max={Math.max(p.total, 1)} value={p.done} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function NotificationList({ items, onRead }: { items: Notification[]; onRead: (n: Notification) => void }) {
  const unread = items.filter((n) => !n.read);
  return (
    <details className="notifs">
      <summary aria-label="Notifications">🔔 {unread.length}</summary>
      {items.length === 0 && <p>No notifications</p>}
      <ul>
        {items.map((n) => (
          <li key={n.id} style={{ fontWeight: n.read ? "normal" : "bold" }}>
            {n.text} {!n.read && <button onClick={() => onRead(n)}>mark read</button>}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function MembersPanel({ members, isAdmin, onRole }: { members: Member[]; isAdmin: boolean; onRole: (m: Member, role: string) => void }) {
  return (
    <details>
      <summary>Members ({members.length})</summary>
      <ul>
        {members.map((m) => (
          <li key={m.user_id}>
            {m.name || m.email} ({m.email}){" "}
            {isAdmin ? (
              <select aria-label={`Role of ${m.email}`} value={m.role} onChange={(e) => onRole(m, e.target.value)}>
                <option>admin</option><option>manager</option><option>member</option>
              </select>
            ) : m.role}
          </li>
        ))}
      </ul>
    </details>
  );
}
