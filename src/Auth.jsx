import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Auth() {
  const [step, setStep] = useState("email"); // "email" | "code"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sendCode = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setLoading(false);
    if (error) setError(error.message);
    else setStep("code");
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setLoading(false);
    if (error) setError("Code invalide ou expiré.");
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
    .au-code { text-align: center; font-family: 'Fraunces', serif; font-size: 26px; letter-spacing: 8px; }
    .au-btn { width: 100%; border: 0; background: var(--ink); color: #F6F3EC; font-family: inherit; font-weight: 600; font-size: 15px; padding: 14px; border-radius: 12px; cursor: pointer; margin-top: 16px; }
    .au-btn:disabled { opacity: .5; cursor: default; }
    .au-btn:hover:not(:disabled) { background: var(--euc); }
    .au-link { display: block; width: 100%; background: transparent; border: 0; color: var(--ink-soft); font-family: inherit; font-size: 13px; text-decoration: underline; cursor: pointer; margin-top: 14px; }
    .au-err { color: var(--clay, #C06B4E); font-size: 13px; margin-top: 10px; }
  `;

  return (
    <div className="au-root">
      <style>{css}</style>
      <div className="au-card">
        <div className="au-logo">Léa<span className="dot">.</span></div>

        {step === "email" && (
          <>
            <div className="au-sub">Connecte-toi pour retrouver ton budget.</div>
            <form onSubmit={sendCode}>
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
                {loading ? "Envoi…" : "Recevoir un code"}
              </button>
            </form>
          </>
        )}

        {step === "code" && (
          <>
            <div className="au-sub">
              Entre le code reçu à <b>{email}</b>.
            </div>
            <form onSubmit={verifyCode}>
              <div className="au-field">
                <label>Code reçu par email</label>
                <input
                  className="au-input au-code"
                  inputMode="numeric"
                  placeholder="••••••••"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                />
              </div>
              {error && <div className="au-err">{error}</div>}
              <button className="au-btn" disabled={loading || !code.trim()}>
                {loading ? "Vérification…" : "Valider"}
              </button>
              <button type="button" className="au-link" onClick={() => { setStep("email"); setCode(""); setError(""); }}>
                Changer d'email / renvoyer un code
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
