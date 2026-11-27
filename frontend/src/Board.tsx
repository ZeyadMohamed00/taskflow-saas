import { useState } from "react";
import { STATUSES, canEditTask, type Me, type Member, type Role, type Status, type Task } from "./types";
import { Avatar, Badge, Empty } from "./ui";

interface Props {
  tasks: Task[]; role: Role | undefined; me: Me | null; members?: Member[];
  onMove: (task: Task, status: Status) => void; onOpen: (task: Task) => void; onDelete?: (task: Task) => void;
}
const LABEL: Record<Status, string> = { todo: "To do", doing: "In progress", done: "Done" };
const DOT: Record<Status, string> = { todo: "#9a9688", doing: "#b8700f", done: "#2f7a4f" };
const today = () => new Date().toISOString().slice(0, 10);

/** Kanban lanes with drag and drop. Moves are only offered when the role allows them (the API enforces it again). */
export function Board({ tasks, role, me, members = [], onMove, onOpen }: Props) {
  const [over, setOver] = useState<Status | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const who = (id: number | null) => (id ? members.find((m) => m.user_id === id)?.name || members.find((m) => m.user_id === id)?.email || "" : "");
  return (
    <div className="cols">
      {STATUSES.map((s) => {
        const col = tasks.filter((t) => t.status === s);
        return (
          <section key={s} aria-label={LABEL[s]} className={`lane ${over === s ? "over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = Number(e.dataTransfer.getData("text/plain")); const t = tasks.find((x) => x.id === id); if (t && t.status !== s && canEditTask(role, me, t)) onMove(t, s); }}>
            <div className="lane-h"><i className="dot" style={{ background: DOT[s] }} />{LABEL[s]} <Badge>{col.length}</Badge></div>
            {col.length === 0 && <Empty icon="∅" title="Nothing here" hint="Drag a card here" />}
            {col.map((t) => {
              const late = t.due_date && t.due_date < today() && t.status !== "done";
              return (
                <article key={t.id} className={`tcard p-${t.priority} ${drag === t.id ? "dragging" : ""}`} draggable={canEditTask(role, me, t)} onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(t.id)); setDrag(t.id); }} onDragEnd={() => { setDrag(null); setOver(null); }}>
                  <button className="t" onClick={() => onOpen(t)}>{t.title}</button>
                  <div className="meta">
                    <Badge kind={t.priority === "high" ? "bad" : t.priority === "medium" ? "warn" : "ok"}>{t.priority}</Badge>
                    {t.due_date && <Badge kind={late ? "bad" : ""}>{late ? "Overdue " : "Due "}{t.due_date}</Badge>}
                    {t.assignee_id && <span className="sp"><Avatar name={who(t.assignee_id) || `u${t.assignee_id}`} size={24} /></span>}
                  </div>
                  {canEditTask(role, me, t) && (
                    <div className="row" style={{ marginTop: 8 }}>
                      {STATUSES.filter((x) => x !== s).map((x) => <button key={x} className="btn sm ghost" onClick={() => onMove(t, x)}>→ {LABEL[x]}</button>)}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
