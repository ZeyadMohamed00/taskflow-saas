import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { Board } from "./Board";
import { atLeast, canEditTask, type Me, type Task } from "./types";

const me: Me = { id: 7, email: "b@x.com", name: "Bob" };
const mk = (id: number, status: Task["status"], extra: Partial<Task> = {}): Task => ({
  id, project_id: 1, title: `Task ${id}`, description: "", status, priority: "medium", due_date: null, assignee_id: null, created_by: null, ...extra,
});

function mockFetch(routes: Record<string, { status?: number; body?: unknown }>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url.replace(/^\/api/, "").split("?")[0]}`;
    calls.push(key);
    const r = routes[key];
    if (!r) throw new Error("unmocked " + key);
    const status = r.status ?? 200;
    return { ok: status < 400, status, statusText: "x", json: async () => r.body } as Response;
  }));
  return calls;
}
const dash = { todo: 1, doing: 0, done: 1, total: 2, percent_done: 50, overdue: 0, assigned_to_me: 1, projects: [{ project_id: 1, name: "Site", total: 2, done: 1 }] };
const appRoutes = (role: string, tasks: Task[]) => ({
  "GET /me": { body: me },
  "GET /orgs": { body: [{ id: 1, name: "Acme", role }] },
  "GET /notifications": { body: [{ id: 1, task_id: 1, text: "You were assigned: Task 1", read: false, created_at: "" }] },
  "GET /orgs/1/projects": { body: { items: [{ id: 1, org_id: 1, team_id: null, name: "Site", description: "" }], total: 1, page: 1, size: 100 } },
  "GET /orgs/1/members": { body: [{ user_id: 7, email: "b@x.com", name: "Bob", role }] },
  "GET /orgs/1/dashboard": { body: dash },
  "GET /projects/1/tasks": { body: { items: tasks, total: tasks.length, page: 1, size: 100 } },
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("permission helpers", () => {
  it("ranks roles", () => {
    expect(atLeast("admin", "manager")).toBe(true);
    expect(atLeast("member", "manager")).toBe(false);
    expect(atLeast(undefined, "member")).toBe(false);
  });
  it("members edit only their own tasks", () => {
    expect(canEditTask("member", me, mk(1, "todo", { assignee_id: 7 }))).toBe(true);
    expect(canEditTask("member", me, mk(2, "todo", { created_by: 7 }))).toBe(true);
    expect(canEditTask("member", me, mk(3, "todo"))).toBe(false);
    expect(canEditTask("manager", me, mk(3, "todo"))).toBe(true);
  });
});

describe("Board", () => {
  it("groups tasks into lanes and offers moves only when allowed", async () => {
    const onMove = vi.fn();
    render(<Board tasks={[mk(1, "todo", { assignee_id: 7 }), mk(2, "doing")]} role="member" me={me} onMove={onMove} onOpen={() => {}} />);
    expect(screen.getByRole("region", { name: "To do" })).toHaveTextContent("Task 1");
    expect(screen.getByRole("region", { name: "In progress" })).toHaveTextContent("Task 2");
    expect(screen.getAllByRole("button", { name: /→/ })).toHaveLength(2); // only the member's own task has move buttons
    await userEvent.click(screen.getAllByRole("button", { name: /→ In progress/ })[0]);
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "doing");
  });
});

describe("App", () => {
  it("shows the landing page and starts the demo", async () => {
    const calls = mockFetch({ "POST /auth/demo": { body: { access_token: "t" } }, ...appRoutes("admin", []) });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /live demo/i }));
    await waitFor(() => expect(calls).toContain("GET /orgs"));
    expect(await screen.findByText(/Project progress/)).toBeInTheDocument();
  });
  it("renders the board for a logged-in user and moves a task", async () => {
    localStorage.setItem("tf_token", "t");
    const calls = mockFetch({ ...appRoutes("admin", [mk(1, "todo")]), "PATCH /tasks/1": { body: mk(1, "doing") } });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /Board/ }));
    await userEvent.click(await screen.findByRole("button", { name: /→ In progress/ }));
    await waitFor(() => expect(calls).toContain("PATCH /tasks/1"));
  });
});
