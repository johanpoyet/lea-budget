import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .au-root {
      --ink: #22271F; --ink-soft: #5C6157; --paper: #F6F3EC; --card: #FFFFFF;
      --line: #E7E2D6; --euc: #2E5A47; --honey: #D9A441;
      font-family: 'Hanken Grotesk', system-ui, sans-serif;
      color: var(--ink); background: var(--paper);
      min-height: 100vh; display: flex; justify-content: center; align-items: center;
      padding: 20px; -webkit-font-smoothing: antialiased;
    }
    .au-card { width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--line); border-radius: 22px; padding: 28px 24px; }
    .au-logo { font-family: 'Fraunces', serif; font-weight: 600; font-size: 28px; margin-bottom: 6px; }
    .au-logo .dot { color: var(--honey); }
    .au-sub { font-size: 14px; color: var(--ink-soft); margin-bottom: 22px; }
    .au-field label { display: block; font-size: 12px; font-weight: 600; color: var(--ink-soft); margin-bottom: 6px; }
    .au-input { width: 100%; border: 1px solid var(--line); background: var(--paper); border-radius: 12px; padding: 12px 14px; font-family: inherit; font-size: 15px; color: var(--ink); }
    .au-input:focus { outline: none; border-color: var(--euc); }
    .au-btn { width: 100%; border: 0; background: var(--ink); color: #F6F3EC; font-family: inherit; font-weight: 600; font-size: 15px; padding: 14px; border-radius: 12px; cursor: pointer; margin-top: 16px; }
    .au-btn:disabled { opacity: .5; cursor: default; }
    .au-btn:hover:not(:disabled) { background: var(--euc); }
    .au-err { color: var(--clay, #C06B4E); font-size: 13px; margin-top: 10px; }
    .au-sent { font-size: 15px; line-height: 1.5; }
    .au-sent b { color: var(--euc); }
  `;

  return (
    <div className="au-root">
      <style>{css}</style>
      <div className="au-card">
        <div className="au-logo">Léa<span className="dot">.</span></div>
        {sent ? (
          <p className="au-sent">
            Un lien de connexion a été envoyé à <b>{email}</b>.<br />
            Ouvre-le depuis ta boîte mail pour accéder à ton budget.
          </p>
        ) : (
          <>
            <div className="au-sub">Connecte-toi pour retrouver ton budget.</div>
            <form onSubmit={submit}>
              <div className="au-field">
                <label>Email</label>
                <input
                  className="au-input"
                  type="email"
                  placeholder="toi@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </div>
              {error && <div className="au-err">{error}</div>}
              <button className="au-btn" disabled={loading || !email.trim()}>
                {loading ? "Envoi…" : "Recevoir le lien de connexion"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
