import { useEffect, useState } from "react";
import { api } from "./api";
import type { Comment, Member, Task } from "./types";

export function TaskDetail({ task, members, onClose }: { task: Task; members: Member[]; onClose: () => void }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const who = (id: number) => members.find((m) => m.user_id === id)?.name || members.find((m) => m.user_id === id)?.email || `user ${id}`;

  useEffect(() => { api.comments(task.id).then(setComments).catch((e) => setError(e.message)); }, [task.id]);

  async function send() {
    if (!body.trim()) return;
    try {
      const c = await api.addComment(task.id, body.trim());
      setComments((x) => [...x, c]);
      setBody("");
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <aside className="detail" aria-label="Task details">
      <button onClick={onClose}>Close</button>
      <h2>{task.title}</h2>
      <p>Status: {task.status} · Priority: {task.priority} · Assignee: {task.assignee_id ? who(task.assignee_id) : "none"}</p>
      <h3>Comments</h3>
      <ul>{comments.map((c) => <li key={c.id}><strong>{who(c.author_id)}:</strong> {c.body}</li>)}</ul>
      <input aria-label="New comment" value={body} onChange={(e) => setBody(e.target.value)} placeholder="write a comment" />
      <button onClick={send}>Comment</button>
      {error && <p role="alert" className="err">{error}</p>}
    </aside>
  );
}
