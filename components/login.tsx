"use client";
import { useState, type FormEvent } from "react";
import { Command, ArrowRight, ShieldCheck } from "lucide-react";
export async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...(body !== undefined ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Permintaan belum berhasil. Silakan coba lagi.");
  return value as T;
}
export function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [email, setEmail] = useState(""); const [token, setToken] = useState(""); const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { if (!sent) { await api("/api/auth/login", { email }); setSent(true); } else { await api("/api/auth/verify", { email, token }); await onLogin(); } }
    catch (error) { setError(error instanceof Error ? error.message : "Belum berhasil masuk."); }
    finally { setBusy(false); }
  }
  return <div className="login-screen"><div className="login-decoration" aria-hidden="true"><Command size={58} /><h2>Right person.<br />Right solution.</h2></div><div className="login-card"><span className="login-brand"><Command size={22} />Whose Job Is It Anyway?</span><h1>Masuk ke workspace.</h1><p>{sent ? `Masukkan kode yang dikirim ke ${email}.` : "Temukan PIC dan bantuan operasional dengan akun kantor Anda."}</p><form onSubmit={(event) => void submit(event)}><label htmlFor="login-email">Email kantor</label><input id="login-email" type="email" required maxLength={254} autoComplete="email" value={email} disabled={sent} onChange={(event) => setEmail(event.target.value)} placeholder="nama@perusahaan.com" />{sent && <><label htmlFor="login-token">Kode masuk</label><input id="login-token" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={8} pattern="[0-9]{6,8}" value={token} onChange={(event) => setToken(event.target.value)} /></>}{error && <p className="form-error" role="alert">{error}</p>}<button className="btn btn-primary" disabled={busy}>{busy ? "Memproses…" : sent ? "Masuk" : "Kirim kode masuk"}<ArrowRight size={16} /></button>{sent && <button className="text-button" type="button" onClick={() => { setSent(false); setToken(""); }}>Gunakan email lain atau kirim ulang</button>}</form><div className="login-note"><ShieldCheck size={16} />Akses khusus karyawan yang telah diundang.</div></div></div>;
}
