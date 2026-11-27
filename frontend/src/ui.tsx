import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/* ---------- theme ---------- */
export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem("theme") as "light" | "dark") || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("theme", theme); }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))] as const;
}

/* ---------- toasts ---------- */
type Toast = { id: number; text: string; kind?: "ok" | "bad" };
const ToastCtx = createContext<(text: string, kind?: "ok" | "bad") => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind?: "ok" | "bad") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">{items.map((t) => <div key={t.id} className={`toast ${t.kind ?? ""}`}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}

/* ---------- small pieces ---------- */
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = (name || "?").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("") || "?";
  let h = 0; for (const c of name || "") h = (h * 31 + c.charCodeAt(0)) % 360;
  return <span className="avatar" title={name} style={{ width: size, height: size, background: `hsl(${h} 55% 48%)`, fontSize: size * 0.4 }}>{initials}</span>;
}
export const Badge = ({ kind = "", children }: { kind?: "ok" | "warn" | "bad" | "info" | "acc" | ""; children: ReactNode }) => <span className={`badge ${kind}`}>{children}</span>;
export const Spinner = () => <span className="spin" role="progressbar" aria-label="Loading" />;
export function Empty({ icon = "✦", title, hint, children }: { icon?: string; title: string; hint?: string; children?: ReactNode }) {
  return <div className="empty"><div className="ic" aria-hidden>{icon}</div><h3>{title}</h3>{hint && <p>{hint}</p>}{children}</div>;
}
export const Skeleton = ({ lines = 3 }: { lines?: number }) => <div className="col">{Array.from({ length: lines }, (_, i) => <div key={i} className="skel" style={{ width: `${95 - i * 12}%` }} />)}</div>;
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return <div className="card stat"><div className="l">{label}</div><div className="v">{value}</div>{hint && <div className="d">{hint}</div>}</div>;
}
export function Bar({ pct }: { pct: number }) { return <div className="bar" aria-label={`${Math.round(pct)} percent`}><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>; }
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? "on" : ""}`} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>;
}
export function Modal({ title, onClose, children, drawer }: { title: string; onClose: () => void; children: ReactNode; drawer?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const body = (
    <div className={drawer ? "drawer" : "modal"} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
      <div className="row" style={{ marginBottom: 14 }}><h2>{title}</h2><button className="btn ghost sm sp" aria-label="Close" onClick={onClose}>✕</button></div>
      {children}
    </div>
  );
  return drawer ? <><div className="overlay" onClick={onClose} style={{ placeItems: "stretch" }} />{body}</> : <div className="overlay" onClick={onClose}>{body}</div>;
}

/* ---------- charts (plain SVG, no dependency) ---------- */
export function BarChart({ data, height = 150, color = "var(--accent)", max: maxProp }: { data: { label: string; value: number }[]; height?: number; color?: string; max?: number }) {
  const max = maxProp ?? Math.max(1, ...data.map((d) => d.value)); const w = 100 / Math.max(1, data.length);
  return (
    <svg viewBox={`0 0 100 ${height / 2}`} preserveAspectRatio="none" style={{ width: "100%", height }} role="img" aria-label="Bar chart">
      {data.map((d, i) => { const h = (d.value / max) * (height / 2 - 14); return <g key={i}><rect x={i * w + w * 0.18} y={height / 2 - 12 - h} width={w * 0.64} height={Math.max(h, 0.6)} rx="1.2" fill={color}><title>{`${d.label}: ${d.value}`}</title></rect></g>; })}
    </svg>
  );
}
export function Legend({ data }: { data: { label: string; value: number }[] }) {
  return <div className="row small muted" style={{ justifyContent: "space-between" }}>{data.map((d) => <span key={d.label}>{d.label}</span>)}</div>;
}
export function Donut({ parts, size = 120 }: { parts: { label: string; value: number; color: string }[]; size?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1; let acc = 0; const r = 40, c = 2 * Math.PI * r;
  return (
    <div className="row" style={{ gap: 16 }}>
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Donut chart">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="14" />
        {parts.map((p) => { const len = (p.value / total) * c; const el = <circle key={p.label} cx="50" cy="50" r={r} fill="none" stroke={p.color} strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} transform="rotate(-90 50 50)"><title>{`${p.label}: ${p.value}`}</title></circle>; acc += len; return el; })}
        <text x="50" y="54" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--text)">{total === 1 && parts.every((p) => !p.value) ? 0 : total}</text>
      </svg>
      <div className="col small" style={{ gap: 4 }}>{parts.map((p) => <span key={p.label}><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: p.color, marginRight: 6 }} />{p.label} <b>{p.value}</b></span>)}</div>
    </div>
  );
}
export function Line({ points, height = 120, color = "var(--accent)" }: { points: number[]; height?: number; color?: string }) {
  if (points.length < 2) return <div className="muted small">Not enough data yet</div>;
  const max = Math.max(...points), min = Math.min(...points), span = max - min || 1;
  const xy = points.map((v, i) => `${(i / (points.length - 1)) * 100},${48 - ((v - min) / span) * 44}`).join(" ");
  return <svg viewBox="0 0 100 50" preserveAspectRatio="none" style={{ width: "100%", height }} role="img" aria-label="Line chart"><polyline points={xy} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" /><polygon points={`0,50 ${xy} 100,50`} fill={color} opacity=".12" /></svg>;
}

/* ---------- app shell ---------- */
export interface NavItem { id: string; label: string; icon: string; badge?: number | string }
export function Shell({ brand, tagline, nav, page, onNav, title, actions, footer, children }: { brand: string; tagline?: string; nav: NavItem[]; page: string; onNav: (id: string) => void; title?: string; actions?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [theme, toggle] = useTheme();
  return (
    <div className="shell">
      <aside className={`side ${open ? "open" : ""}`} aria-label="Sidebar">
        <div className="brand"><span className="logo"><img src="/icon.svg" alt="" /></span><div>{brand}{tagline && <div className="small muted" style={{ fontWeight: 400 }}>{tagline}</div>}</div></div>
        {nav.map((n) => (
          <button key={n.id} className={`nav ${page === n.id ? "on" : ""}`} aria-current={page === n.id ? "page" : undefined} onClick={() => { onNav(n.id); setOpen(false); }}>
            <span aria-hidden style={{ width: 18, textAlign: "center" }}>{n.icon}</span>{n.label}{n.badge !== undefined && n.badge !== 0 && <span className="badge acc">{n.badge}</span>}
          </button>
        ))}
        <div className="grow" />{footer}
      </aside>
      <div className="main">
        <div className="top">
          <button className="btn ghost menu-btn" aria-label="Menu" onClick={() => setOpen(!open)}>☰</button>
          <span className="title">{title ?? nav.find((n) => n.id === page)?.label}</span>
          {actions}
          <button className="btn ghost sm" aria-label="Toggle dark mode" title="Toggle dark mode" onClick={toggle}>{theme === "dark" ? "Light" : "Dark"}</button>
        </div>
        <div className="page">{children}</div>
      </div>
    </div>
  );
}
export const ago = (iso: string) => { const s = (Date.now() - new Date(iso).getTime()) / 1000; if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; };
