import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { Board } from "./Board";
import { atLeast, canEditTask, type Me, type Task } from "./types";

const me: Me = { id: 7, email: "b@x.com", name: "Bob" };
const mk = (id: number, status: Task["status"], extra: Partial<Task> = {}): Task => ({
  id, project_id: 1, title: `Task ${id}`, description: "", status, priority: "medium", due_date: null,
  assignee_id: null, created_by: null, ...extra,
});

type Route = { status?: number; body?: unknown };
function mockFetch(routes: Record<string, Route>) {
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
  "GET /projects/1/tasks": { body: { items: tasks, total: tasks.length, page: 1, size: 50 } },
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
    expect(canEditTask("member", me, mk(3, "todo", { assignee_id: 8 }))).toBe(false);
    expect(canEditTask("manager", me, mk(3, "todo", { assignee_id: 8 }))).toBe(true);
  });
});

describe("Board", () => {
  const tasks = [mk(1, "todo", { assignee_id: 7 }), mk(2, "done")];
  it("groups tasks by column", () => {
    render(<Board tasks={tasks} role="manager" me={me} onMove={() => {}} onDelete={() => {}} onOpen={() => {}} />);
    expect(screen.getByRole("region", { name: "To do" })).toHaveTextContent("Task 1");
    expect(screen.getByRole("region", { name: "Done" })).toHaveTextContent("Task 2");
  });
  it("member sees actions only on own tasks and cannot delete", () => {
    render(<Board tasks={tasks} role="member" me={me} onMove={() => {}} onDelete={() => {}} onOpen={() => {}} />);
    const todo = screen.getByRole("region", { name: "To do" });
    expect(within(todo).getByText("→ doing")).toBeInTheDocument();
    expect(screen.queryByLabelText("Delete Task 1")).toBeNull();
    expect(within(screen.getByRole("region", { name: "Done" })).queryByText("→ todo")).toBeNull();
  });
  it("calls onMove", async () => {
    const onMove = vi.fn();
    render(<Board tasks={tasks} role="admin" me={me} onMove={onMove} onDelete={() => {}} onOpen={() => {}} />);
    await userEvent.click(screen.getAllByText("→ doing")[0]);
    expect(onMove).toHaveBeenCalledWith(tasks[0], "doing");
  });
});

describe("App", () => {
  it("shows an API error on failed login", async () => {
    mockFetch({ "POST /auth/login": { status: 401, body: { detail: "Wrong email or password" } } });
    render(<App />);
    await userEvent.type(screen.getByLabelText("Email"), "a@x.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByText("Log in"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password");
  });

  it("logs in and renders dashboard, board and notifications", async () => {
    mockFetch({ "POST /auth/login": { body: { access_token: "tok" } }, ...appRoutes("manager", [mk(1, "todo"), mk(2, "done")]) });
    render(<App />);
    await userEvent.type(screen.getByLabelText("Email"), "a@x.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByText("Log in"));
    await waitFor(() => expect(screen.getByRole("region", { name: "Dashboard" })).toHaveTextContent("50%"));
    expect(localStorage.getItem("tf_token")).toBe("tok");
    expect(screen.getByRole("region", { name: "To do" })).toHaveTextContent("Task 1");
    expect(screen.getByLabelText("Notifications")).toHaveTextContent("1");
    expect(screen.getByText("+ project")).toBeInTheDocument();
  });

  it("hides manager/admin controls from a member", async () => {
    localStorage.setItem("tf_token", "tok");
    mockFetch(appRoutes("member", [mk(1, "todo")]));
    render(<App />);
    await screen.findByRole("region", { name: "Dashboard" });
    expect(screen.queryByText("+ project")).toBeNull();
    expect(screen.queryByText("+ member")).toBeNull();
  });

  it("returns to login when the token is rejected", async () => {
    localStorage.setItem("tf_token", "expired");
    mockFetch({ "GET /me": { status: 401, body: { detail: "expired" } }, "GET /orgs": { status: 401, body: { detail: "expired" } }, "GET /notifications": { status: 401, body: { detail: "expired" } } });
    render(<App />);
    expect(await screen.findByText("Register")).toBeInTheDocument();
    expect(localStorage.getItem("tf_token")).toBeNull();
  });
});
