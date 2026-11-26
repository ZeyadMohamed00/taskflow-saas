import type { Comment, Dashboard, Me, Member, Notification, Org, Page, Priority, Project, Status, Task } from "./types";

// Dev: Vite proxies /api -> FastAPI. Production: served by FastAPI itself (same origin).
export const API_BASE: string = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "/api" : "");
const KEY = "tf_token";

export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : "Invalid input";
    } catch { /* keep statusText */ }
    throw new ApiError(res.status, detail);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const qs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

export interface TaskQuery { q?: string; status?: Status | ""; priority?: Priority | ""; page?: number; size?: number }

export const api = {
  auth: (kind: "login" | "register", email: string, password: string, name = "") =>
    request<{ access_token: string }>(`/auth/${kind}`, "POST", { email, password, name }),
  demo: () => request<{ access_token: string }>("/auth/demo", "POST", {}),
  me: () => request<Me>("/me"),
  orgs: () => request<Org[]>("/orgs"),
  createOrg: (name: string) => request<Org>("/orgs", "POST", { name }),
  members: (oid: number) => request<Member[]>(`/orgs/${oid}/members`),
  addMember: (oid: number, email: string, role: string) => request(`/orgs/${oid}/members`, "POST", { email, role }),
  setRole: (oid: number, uid: number, role: string) => request(`/orgs/${oid}/members/${uid}`, "PATCH", { role }),
  projects: (oid: number) => request<Page<Project>>(`/orgs/${oid}/projects?size=100`),
  createProject: (oid: number, name: string) => request<Project>(`/orgs/${oid}/projects`, "POST", { name }),
  dashboard: (oid: number) => request<Dashboard>(`/orgs/${oid}/dashboard`),
  tasks: (pid: number, query: TaskQuery = {}) => request<Page<Task>>(`/projects/${pid}/tasks?${qs({ size: 50, ...query })}`),
  createTask: (pid: number, body: { title: string; priority?: Priority; assignee_id?: number | null; due_date?: string | null }) =>
    request<Task>(`/projects/${pid}/tasks`, "POST", body),
  updateTask: (tid: number, patch: Partial<Pick<Task, "status" | "title" | "priority" | "assignee_id" | "due_date">>) =>
    request<Task>(`/tasks/${tid}`, "PATCH", patch),
  deleteTask: (tid: number) => request<void>(`/tasks/${tid}`, "DELETE"),
  comments: (tid: number) => request<Comment[]>(`/tasks/${tid}/comments`),
  addComment: (tid: number, body: string) => request<Comment>(`/tasks/${tid}/comments`, "POST", { body }),
  notifications: () => request<Notification[]>("/notifications"),
  markRead: (nid: number) => request<void>(`/notifications/${nid}/read`, "POST"),
};
