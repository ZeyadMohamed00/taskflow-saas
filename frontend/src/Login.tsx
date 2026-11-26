import { useState, type FormEvent } from "react";
import { api, setToken } from "./api";
import { useTheme } from "./ui";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  useTheme();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ access_token: string }>) {
    setError(""); setBusy(true);
    try { setToken((await fn()).access_token); onLoggedIn(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); run(() => api.auth(mode, email, password, name)); };

  return (
    <div style={{ minHeight: "100%", display: "grid", alignItems: "center" }}>
      <div className="hero">
        <span className="logo" style={{ width: 52, height: 52, fontSize: 24, borderRadius: 14 }}>T</span>
        <h1>TaskFlow</h1>
        <p>Projects, tasks and teams in one place. Kanban board, roles, comments and live dashboards.</p>
        <button className="btn primary" style={{ padding: "12px 26px", fontSize: 15 }} disabled={busy} onClick={() => run(api.demo)}>{busy ? "Loading..." : "Try the live demo (no sign-up)"}</button>
        <p className="small">The demo creates a throwaway workspace with clearly synthetic sample data.</p>
        <form className="card authbox col" onSubmit={submit}>
          <h3>{mode === "login" ? "Log in" : "Create an account"}</h3>
          {mode === "register" && <label className="f">Name<input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} /></label>}
          <label className="f">Email<input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="f">Password<input aria-label="Password" type="password" placeholder="8+ characters" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <p role="alert" className="err">{error}</p>}
          <button className="btn primary" type="submit" disabled={busy}>{mode === "login" ? "Log in" : "Register"}</button>
          <button type="button" className="btn ghost sm" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "New here? Create an account" : "Have an account? Log in"}</button>
        </form>
      </div>
    </div>
  );
}
