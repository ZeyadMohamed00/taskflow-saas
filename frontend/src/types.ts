export type Status = "todo" | "doing" | "done";
export type Priority = "low" | "medium" | "high";
export type Role = "admin" | "manager" | "member";
export interface Me { id: number; email: string; name: string }
export interface Org { id: number; name: string; role: Role }
export interface Member { user_id: number; email: string; name: string; role: Role }
export interface Project { id: number; org_id: number; team_id: number | null; name: string; description: string }
export interface Task {
  id: number; project_id: number; title: string; description: string; status: Status; priority: Priority;
  due_date: string | null; assignee_id: number | null; created_by: number | null;
}
export interface Comment { id: number; task_id: number; author_id: number; body: string; created_at: string }
export interface Notification { id: number; task_id: number | null; text: string; read: boolean; created_at: string }
export interface Page<T> { items: T[]; total: number; page: number; size: number }
export interface Dashboard {
  todo: number; doing: number; done: number; total: number; percent_done: number; overdue: number; assigned_to_me: number;
  projects: { project_id: number; name: string; total: number; done: number }[];
}
export const STATUSES: Status[] = ["todo", "doing", "done"];

const RANK: Record<Role, number> = { member: 1, manager: 2, admin: 3 };
/** Mirrors the server's permission matrix (the server is the real enforcer; this only hides buttons). */
export const atLeast = (role: Role | undefined, min: Role) => !!role && RANK[role] >= RANK[min];
export const canEditTask = (role: Role | undefined, me: Me | null, t: Task) =>
  atLeast(role, "manager") || (!!me && (t.assignee_id === me.id || t.created_by === me.id));
