import { useEffect, useState } from "react";
import { api } from "./api";
import { atLeast, canEditTask, type Comment, type Me, type Member, type Priority, type Role, type Status, type Task } from "./types";
import { Avatar, Modal, ago, useToast } from "./ui";

interface Props { task: Task; members: Member[]; me: Me | null; role: Role | undefined; onClose: () => void; onChanged: () => void }

export function TaskDetail({ task, members, me, role, onClose, onChanged }: Props) {
  const toast = useToast();
  const [draft, setDraft] = useState(task);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const editable = canEditTask(role, me, task);
  const who = (id: number) => members.find((m) => m.user_id === id)?.name || members.find((m) => m.user_id === id)?.email || `user ${id}`;

  useEffect(() => { setDraft(task); api.comments(task.id).then(setComments).catch((e) => setError(e.message)); }, [task]);

  async function save() {
    try {
      await api.updateTask(task.id, { title: draft.title, description: draft.description, status: draft.status, priority: draft.priority, assignee_id: draft.assignee_id, due_date: draft.due_date });
      toast("Task saved", "ok"); onChanged(); onClose();
    } catch (e) { setError((e as Error).message); toast((e as Error).message, "bad"); }
  }
  async function remove() {
    if (!confirm("Delete this task?")) return;
    try { await api.deleteTask(task.id); toast("Task deleted"); onChanged(); onClose(); } catch (e) { setError((e as Error).message); }
  }
  async function send() {
    if (!body.trim()) return;
    try { const c = await api.addComment(task.id, body.trim()); setComments((x) => [...x, c]); setBody(""); } catch (e) { setError((e as Error).message); }
  }
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Modal drawer title="Task details" onClose={onClose}>
      <div className="col" aria-label="Task details">
        <label className="f">Title<input aria-label="Title" disabled={!editable} value={draft.title} onChange={(e) => set("title", e.target.value)} /></label>
        <label className="f">Description<textarea aria-label="Description" disabled={!editable} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Add details, acceptance criteria, links..." /></label>
        <div className="grid g2">
          <label className="f">Status<select disabled={!editable} value={draft.status} onChange={(e) => set("status", e.target.value as Status)}><option value="todo">To do</option><option value="doing">In progress</option><option value="done">Done</option></select></label>
          <label className="f">Priority<select disabled={!editable} value={draft.priority} onChange={(e) => set("priority", e.target.value as Priority)}><option>low</option><option>medium</option><option>high</option></select></label>
          <label className="f">Assignee<select disabled={!editable} value={draft.assignee_id ?? ""} onChange={(e) => set("assignee_id", e.target.value ? Number(e.target.value) : null)}><option value="">Unassigned</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}</option>)}</select></label>
          <label className="f">Due date<input type="date" disabled={!editable} value={draft.due_date ?? ""} onChange={(e) => set("due_date", e.target.value || null)} /></label>
        </div>
        <div className="row">
          {editable && <button className="btn primary" onClick={save}>Save changes</button>}
          {atLeast(role, "manager") && <button className="btn danger sp" onClick={remove}>Delete</button>}
        </div>
        {error && <p role="alert" className="err">{error}</p>}
        <h3 style={{ marginTop: 10 }}>Comments ({comments.length})</h3>
        <div className="list">
          {comments.length === 0 && <p className="muted small">No comments yet. Start the conversation.</p>}
          {comments.map((c) => (
            <div key={c.id} className="row" style={{ alignItems: "flex-start" }}>
              <Avatar name={who(c.author_id)} />
              <div><b>{who(c.author_id)}</b> <span className="muted small">{c.created_at ? ago(c.created_at) : ""}</span><p>{c.body}</p></div>
            </div>
          ))}
        </div>
        <div className="row"><input style={{ flex: 1 }} aria-label="New comment" value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Write a comment" /><button className="btn" onClick={send}>Comment</button></div>
      </div>
    </Modal>
  );
}
