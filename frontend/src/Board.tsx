import { STATUSES, canEditTask, atLeast, type Me, type Role, type Status, type Task } from "./types";

interface Props {
  tasks: Task[];
  role: Role | undefined;
  me: Me | null;
  onMove: (task: Task, status: Status) => void;
  onDelete: (task: Task) => void;
  onOpen: (task: Task) => void;
}

const LABEL: Record<Status, string> = { todo: "To do", doing: "Doing", done: "Done" };

/** Kanban columns. Buttons are shown only when the role allows the action (the API enforces it again). */
export function Board({ tasks, role, me, onMove, onDelete, onOpen }: Props) {
  return (
    <div className="cols">
      {STATUSES.map((s) => {
        const col = tasks.filter((t) => t.status === s);
        return (
          <section className="col" key={s} aria-label={LABEL[s]}>
            <h3>{LABEL[s]} ({col.length})</h3>
            {col.map((t) => (
              <div className={`card prio-${t.priority}`} key={t.id}>
                <button className="link" onClick={() => onOpen(t)}>{t.title}</button>
                <small> {t.priority}{t.due_date ? ` · due ${t.due_date}` : ""}</small>
                {canEditTask(role, me, t) && (
                  <div>
                    {STATUSES.filter((x) => x !== s).map((x) => (
                      <button key={x} onClick={() => onMove(t, x)}>→ {x}</button>
                    ))}
                    {atLeast(role, "manager") && <button aria-label={`Delete ${t.title}`} onClick={() => onDelete(t)}>Delete</button>}
                  </div>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
