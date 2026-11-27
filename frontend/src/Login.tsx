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
    <div className="lp">
      <section className="lp-l">
        <div className="brand"><span className="logo"><img src="/icon.svg" alt="" /></span>TaskFlow</div>
        <div>
          <h1>Work that moves, <em>on time.</em></h1>
          <p className="lede">Projects, tasks and teams in one calm workspace. Kanban boards, roles, comments and a dashboard that shows what is late.</p>
        </div>
        <div className="mini" aria-hidden>
          <div><b>To do</b><i className="h">Fix checkout bug</i><i>Write release notes</i></div>
          <div><b>In progress</b><i className="m">Onboarding flow</i><i>API rate limits</i></div>
          <div><b>Done</b><i>Set up CI</i><i>Brand colors</i></div>
        </div>
      </section>
      <section className="lp-r">
        <div className="col authbox" style={{ gap: 14 }}>
          <button className="btn primary" disabled={busy} onClick={() => run(api.demo)}>{busy ? "Loading..." : "Explore without signing up"}</button>
          <div className="or">or</div>
          <form className="col" onSubmit={submit}>
            <h2>{mode === "login" ? "Log in" : "Create an account"}</h2>
            {mode === "register" && <label className="f">Name<input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} /></label>}
            <label className="f">Email<input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="f">Password<input aria-label="Password" type="password" placeholder="8+ characters" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            {error && <p role="alert" className="err">{error}</p>}
            <button className="btn" type="submit" disabled={busy}>{mode === "login" ? "Log in" : "Register"}</button>
            <button type="button" className="btn ghost sm" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "New here? Create an account" : "Have an account? Log in"}</button>
          </form>
        </div>
      </section>
    </div>
  );
}
