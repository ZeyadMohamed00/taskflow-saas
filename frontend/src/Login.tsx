import { useState, type FormEvent } from "react";
import { api, setToken } from "./api";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function submit(kind: "login" | "register", e?: FormEvent) {
    e?.preventDefault();
    setError("");
    try {
      const t = await api.auth(kind, email, password, name);
      setToken(t.access_token);
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="card login" onSubmit={(e) => submit("login", e)}>
      <h2>TaskFlow</h2>
      <input aria-label="Name" placeholder="name (register only)" value={name} onChange={(e) => setName(e.target.value)} />
      <input aria-label="Email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input aria-label="Password" type="password" placeholder="password (8+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} />
      <div>
        <button type="submit">Log in</button>
        <button type="button" onClick={() => submit("register")}>Register</button>
      </div>
      {error && <p role="alert" className="err">{error}</p>}
    </form>
  );
}
