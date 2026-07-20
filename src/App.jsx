import React, { useState, useMemo, useEffect } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";

/* ------------------------------------------------------------------
   Léa — suivi de budget (by Joujou)
   ------------------------------------------------------------------
   Données persistées dans Supabase (une ligne par utilisateur, via RLS).
   Catégories dynamiques : ajout / suppression par l'utilisateur.
   Les montants sont STOCKÉS en AUD ; l'affichage convertit à la volée.
------------------------------------------------------------------- */

// Taux illustratif — à remplacer par un taux live (ex. exchangerate.host)
const RATE_AUD_TO_EUR = 0.6;

// Fallbacks non supprimables (cible de réaffectation)
const FALLBACK = { expense: "Autre (dépense)", income: "Autre (revenu)" };

const DEFAULT_CATS = {
  Loyer:              { color: "#2E5A47", icon: "🏠", type: "expense" },
  Courses:            { color: "#3E7C8C", icon: "🛒", type: "expense" },
  "Restos & sorties": { color: "#D9A441", icon: "🍽️", type: "expense" },
  Transport:          { color: "#8B7BA8", icon: "🚌", type: "expense" },
  Voyage:             { color: "#C06B4E", icon: "✈️", type: "expense" },
  Forfait:            { color: "#6B8E7A", icon: "📱", type: "expense" },
  Santé:              { color: "#C77D9B", icon: "🩹", type: "expense" },
  Shopping:           { color: "#B8A177", icon: "🛍️", type: "expense" },
  "Autre (dépense)":  { color: "#9AA0A6", icon: "✨", type: "expense" },
  Salaire:            { color: "#2E5A47", icon: "💼", type: "income" },
  Pourboires:         { color: "#D9A441", icon: "🪙", type: "income" },
  "Autre (revenu)":   { color: "#6B8E7A", icon: "🌱", type: "income" },
};

const EMOJI_PRESETS = ["🏠","🛒","🍽️","🚌","✈️","📱","🩹","🛍️","☕","🏄","🎁","💪","🐨","🍺","⛽","🎬","💊","📚","🎧","🧺","💼","🪙","🌱","💰"];
const COLOR_PRESETS = ["#2E5A47","#3E7C8C","#D9A441","#8B7BA8","#C06B4E","#6B8E7A","#C77D9B","#B8A177","#4A7BA8","#7A9E5C","#B5563F","#9AA0A6"];

const MONTH_LABELS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const ym = (d) => d.slice(0, 7);
const monthLabel = (key) => {
  const [y, m] = key.split("-");
  const l = MONTH_LABELS[parseInt(m, 10) - 1];
  return `${l.charAt(0).toUpperCase() + l.slice(1)} ${y}`;
};
const shortMonth = (key) => MONTH_LABELS[parseInt(key.split("-")[1], 10) - 1].slice(0, 3);

// Convertit une ligne Supabase `transactions` vers la forme utilisée par l'UI
const rowToTx = (r) => ({
  id: r.id, date: r.date, cat: r.category, amountAUD: Number(r.amount_aud),
  note: r.note || "", type: r.type,
});

function LoadingScreen() {
  const css = `
    .ls-root { min-height: 100vh; display: grid; place-items: center; background: #F6F3EC; }
    .ls-icon {
      width: 112px; height: 112px; border-radius: 25px;
      box-shadow: 0 20px 40px -18px rgba(46,90,71,.45);
      animation: ls-in .6s cubic-bezier(.2,.8,.2,1) both, ls-pulse 1.8s ease-in-out .6s infinite;
    }
    @keyframes ls-in { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: scale(1); } }
    @keyframes ls-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.045); } }
    @media (prefers-reduced-motion: reduce) { .ls-icon { animation: none; } }
  `;
  return (
    <div className="ls-root">
      <style>{css}</style>
      <img src="/lea-icon.svg" alt="" className="ls-icon" />
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);

  const [tx, setTx] = useState([]);
  const [cats, setCats] = useState({});
  const [currency, setCurrency] = useState("AUD");
  const [cursor, setCursor] = useState(() => new Date().toISOString().slice(0, 7));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [catSheetOpen, setCatSheetOpen] = useState(false);

  // Auth : récupère la session courante puis écoute les changements
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Données : chargées une fois la session connue (RLS filtre déjà par utilisateur)
  useEffect(() => {
    if (!session) { setDataLoading(false); return; }
    let cancelled = false;

    (async () => {
      setDataLoading(true);

      let { data: catRows, error: catErr } = await supabase
        .from("categories").select("*").order("created_at", { ascending: true });
      if (catErr) console.error(catErr);

      if (!catErr && catRows && catRows.length === 0) {
        const seed = Object.entries(DEFAULT_CATS).map(([name, c]) => ({
          user_id: session.user.id, name, icon: c.icon, color: c.color, type: c.type,
        }));
        const { data: inserted, error: seedErr } = await supabase.from("categories").insert(seed).select();
        if (seedErr) console.error(seedErr); else catRows = inserted;
      }

      const { data: txRows, error: txErr } = await supabase
        .from("transactions").select("*").order("date", { ascending: true });
      if (txErr) console.error(txErr);

      if (cancelled) return;

      if (catRows) {
        const catsObj = {};
        catRows.forEach((c) => { catsObj[c.name] = { color: c.color, icon: c.icon, type: c.type }; });
        setCats(catsObj);
      }
      if (txRows) setTx(txRows.map(rowToTx));
      setDataLoading(false);
    })();

    return () => { cancelled = true; };
  }, [session]);

  const meta = (name) => cats[name] || { color: "#9AA0A6", icon: "•", type: "expense" };

  const money = (aud, dec = false) => {
    const v = currency === "AUD" ? aud : aud * RATE_AUD_TO_EUR;
    const n = new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 0, maximumFractionDigits: dec ? 2 : 0,
    }).format(v);
    return currency === "AUD" ? `$${n}` : `${n} €`;
  };

  const monthTx = useMemo(
    () => tx.filter((x) => ym(x.date) === cursor).sort((a, b) => b.date.localeCompare(a.date)),
    [tx, cursor]
  );

  const income = monthTx.filter((x) => x.type === "income").reduce((s, x) => s + x.amountAUD, 0);
  const expense = monthTx.filter((x) => x.type === "expense").reduce((s, x) => s + x.amountAUD, 0);
  const net = income - expense;

  const byCat = useMemo(() => {
    const m = {};
    monthTx.filter((x) => x.type === "expense").forEach((x) => { m[x.cat] = (m[x.cat] || 0) + x.amountAUD; });
    return Object.entries(m)
      .map(([name, value]) => ({ name, value, color: meta(name).color, icon: meta(name).icon }))
      .sort((a, b) => b.value - a.value);
  }, [monthTx, cats]);

  const trend = useMemo(() => {
    const keys = [];
    const [y, m] = cursor.split("-").map(Number);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return keys.map((k) => {
      const inc = tx.filter((x) => ym(x.date) === k && x.type === "income").reduce((s, x) => s + x.amountAUD, 0);
      const exp = tx.filter((x) => ym(x.date) === k && x.type === "expense").reduce((s, x) => s + x.amountAUD, 0);
      return { key: k, label: shortMonth(k), net: inc - exp, current: k === cursor };
    });
  }, [tx, cursor]);

  // Nombre de mouvements par catégorie (pour la suppression)
  const usage = useMemo(() => {
    const m = {}; tx.forEach((x) => { m[x.cat] = (m[x.cat] || 0) + 1; }); return m;
  }, [tx]);

  const shiftMonth = (dir) => {
    const [y, m] = cursor.split("-").map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setCursor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const addTx = async (entry) => {
    const type = meta(entry.cat).type;
    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_id: session.user.id,
        date: entry.date,
        category: entry.cat,
        amount_aud: entry.amountAUD,
        note: entry.note,
        type,
      })
      .select()
      .single();
    if (error) { console.error(error); return; }
    setTx((prev) => [...prev, rowToTx(data)]);
    setSheetOpen(false);
    setCursor(ym(entry.date));
  };

  const updateTx = async (entry) => {
    const type = meta(entry.cat).type;
    const { data, error } = await supabase
      .from("transactions")
      .update({
        date: entry.date,
        category: entry.cat,
        amount_aud: entry.amountAUD,
        note: entry.note,
        type,
      })
      .eq("id", entry.id)
      .select()
      .single();
    if (error) { console.error(error); return; }
    setTx((prev) => prev.map((x) => (x.id === entry.id ? rowToTx(data) : x)));
    setSheetOpen(false);
    setEditingTx(null);
    setCursor(ym(entry.date));
  };

  const deleteTx = async (id) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) { console.error(error); return; }
    setTx((prev) => prev.filter((x) => x.id !== id));
    setSheetOpen(false);
    setEditingTx(null);
  };

  // Ajoute une catégorie ; renvoie false si nom vide ou déjà pris
  const addCategory = async ({ name, icon, color, type }) => {
    const key = (name || "").trim();
    if (!key || cats[key]) return false;
    const { error } = await supabase
      .from("categories")
      .insert({ user_id: session.user.id, name: key, icon, color, type });
    if (error) { console.error(error); return false; }
    setCats((prev) => ({ ...prev, [key]: { color, icon, type } }));
    return true;
  };

  // Supprime une catégorie et réaffecte ses mouvements vers "Autre"
  const deleteCategory = async (name) => {
    const type = meta(name).type;
    if (name === FALLBACK[type]) return; // protégée
    const fallbackName = FALLBACK[type];

    const { error: updErr } = await supabase
      .from("transactions").update({ category: fallbackName }).eq("category", name);
    if (updErr) { console.error(updErr); return; }

    const { error: delErr } = await supabase.from("categories").delete().eq("name", name);
    if (delErr) { console.error(delErr); return; }

    setTx((prev) => prev.map((x) => (x.cat === name ? { ...x, cat: fallbackName, type } : x)));
    setCats((prev) => { const c = { ...prev }; delete c[name]; return c; });
  };

  const signOut = () => { supabase.auth.signOut(); };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .mt-root {
      --ink: #22271F; --ink-soft: #5C6157; --paper: #F6F3EC; --card: #FFFFFF;
      --line: #E7E2D6; --euc: #2E5A47; --honey: #D9A441; --clay: #C06B4E;
      font-family: 'Hanken Grotesk', system-ui, sans-serif;
      color: var(--ink); background: var(--paper);
      min-height: 100vh; display: flex; justify-content: center;
      padding: 20px 14px 120px; -webkit-font-smoothing: antialiased;
    }
    .mt-app { width: 100%; max-width: 440px; position: relative; }
    .tnum { font-variant-numeric: tabular-nums; }

    .mt-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
    .mt-logo { font-family: 'Fraunces', serif; font-weight: 600; font-size: 26px; letter-spacing: -0.5px; }
    .mt-logo .dot { color: var(--honey); }
    .mt-brand { display: flex; align-items: baseline; gap: 7px; }
    .mt-by { font-size: 11px; color: var(--ink-soft); font-style: italic; }
    .mt-right { display: flex; align-items: center; gap: 8px; }
    .mt-gear { width: 38px; height: 38px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); cursor: pointer; font-size: 16px; display: grid; place-items: center; transition: all .15s ease; }
    .mt-gear:hover { border-color: var(--euc); }

    .mt-cur { display: inline-flex; background: #EFEADF; border-radius: 999px; padding: 3px; gap: 2px; }
    .mt-cur button { border: 0; background: transparent; cursor: pointer; font-family: inherit; font-weight: 600; font-size: 13px; color: var(--ink-soft); padding: 6px 11px; border-radius: 999px; transition: all .2s ease; }
    .mt-cur button.on { background: var(--ink); color: #F6F3EC; }

    .mt-month { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 16px; }
    .mt-month button { width: 34px; height: 34px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); cursor: pointer; font-size: 16px; color: var(--ink-soft); display: grid; place-items: center; transition: all .15s ease; }
    .mt-month button:hover { border-color: var(--euc); color: var(--euc); }
    .mt-month span { font-weight: 600; font-size: 15px; min-width: 148px; text-align: center; }

    .mt-hero { position: relative; overflow: hidden; border-radius: 22px; padding: 22px 22px 20px; background: var(--euc); color: #F6F3EC; margin-bottom: 14px; box-shadow: 0 12px 30px -14px rgba(46,90,71,.55); }
    .mt-hero::after { content: ""; position: absolute; right: -40px; top: -50px; width: 180px; height: 180px; border-radius: 999px; background: radial-gradient(circle at 30% 30%, rgba(217,164,65,.65), rgba(217,164,65,0) 70%); }
    .mt-hero .lbl { font-size: 12px; opacity: .8; letter-spacing: .4px; text-transform: uppercase; }
    .mt-hero .big { font-family: 'Fraunces', serif; font-weight: 500; font-size: 46px; line-height: 1.05; margin: 4px 0 16px; letter-spacing: -1px; }
    .mt-hero .rows { display: flex; gap: 10px; position: relative; z-index: 1; }
    .mt-hero .pill { flex: 1; background: rgba(255,255,255,.12); border-radius: 14px; padding: 10px 12px; }
    .mt-hero .pill .k { font-size: 11px; opacity: .82; margin-bottom: 3px; }
    .mt-hero .pill .v { font-weight: 600; font-size: 16px; }

    .mt-card { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 18px; margin-bottom: 14px; }
    .mt-card h3 { font-size: 13px; font-weight: 600; color: var(--ink-soft); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 14px; }

    .mt-donut { position: relative; height: 168px; }
    .mt-donut .center { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; pointer-events: none; }
    .mt-donut .center .c1 { font-size: 11px; color: var(--ink-soft); }
    .mt-donut .center .c2 { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 500; }

    .mt-legend { display: flex; flex-direction: column; gap: 9px; margin-top: 6px; }
    .mt-legend .row { display: flex; align-items: center; gap: 10px; font-size: 14px; }
    .mt-legend .sw { width: 9px; height: 9px; border-radius: 3px; flex: none; }
    .mt-legend .nm { flex: 1; }
    .mt-legend .vl { font-weight: 600; }
    .mt-legend .pc { color: var(--ink-soft); font-size: 12px; width: 34px; text-align: right; }

    .mt-trend { height: 92px; display: flex; align-items: flex-end; gap: 8px; }

    .mt-list-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .mt-list-head h3 { margin: 0; }
    .mt-tx { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-top: 1px solid var(--line); cursor: pointer; }
    .mt-tx:first-child { border-top: 0; }
    .mt-tx .ic { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; font-size: 17px; flex: none; }
    .mt-tx .mid { flex: 1; min-width: 0; }
    .mt-tx .mid .c { font-weight: 600; font-size: 14px; }
    .mt-tx .mid .n { font-size: 12px; color: var(--ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mt-tx .amt { font-weight: 600; font-size: 15px; }
    .mt-tx .amt.inc { color: var(--euc); }

    .mt-empty { text-align: center; padding: 30px 10px; color: var(--ink-soft); font-size: 14px; }

    .mt-fab { position: fixed; bottom: 26px; left: 50%; transform: translateX(-50%); background: var(--ink); color: #F6F3EC; border: 0; cursor: pointer; font-family: inherit; font-weight: 600; font-size: 15px; padding: 14px 26px; border-radius: 999px; display: flex; align-items: center; gap: 8px; box-shadow: 0 12px 26px -8px rgba(34,39,31,.5); z-index: 30; }
    .mt-fab:hover { background: var(--euc); }

    .mt-scrim { position: fixed; inset: 0; background: rgba(34,39,31,.4); z-index: 40; opacity: 0; animation: fade .2s forwards; }
    @keyframes fade { to { opacity: 1; } }
    .mt-sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: 100%; max-width: 440px; background: var(--paper); border-radius: 26px 26px 0 0; padding: 20px 20px 28px; z-index: 50; animation: up .28s cubic-bezier(.2,.8,.2,1); max-height: 88vh; overflow-y: auto; }
    @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
    .mt-sheet .grab { width: 40px; height: 4px; border-radius: 999px; background: var(--line); margin: 0 auto 16px; }
    .mt-sheet h2 { font-family: 'Fraunces', serif; font-weight: 500; font-size: 21px; margin-bottom: 4px; }
    .mt-sheet .sub { font-size: 13px; color: var(--ink-soft); margin-bottom: 16px; }

    .mt-seg { display: flex; background: #EFEADF; border-radius: 12px; padding: 3px; margin-bottom: 16px; }
    .mt-seg button { flex: 1; border: 0; background: transparent; cursor: pointer; font-family: inherit; font-weight: 600; font-size: 14px; padding: 9px; border-radius: 9px; color: var(--ink-soft); }
    .mt-seg button.on { background: var(--card); color: var(--ink); box-shadow: 0 1px 3px rgba(0,0,0,.06); }

    .mt-field { margin-bottom: 14px; }
    .mt-field label { display: block; font-size: 12px; font-weight: 600; color: var(--ink-soft); margin-bottom: 6px; }
    .mt-input { width: 100%; border: 1px solid var(--line); background: var(--card); border-radius: 12px; padding: 12px 14px; font-family: inherit; font-size: 15px; color: var(--ink); }
    .mt-input:focus { outline: none; border-color: var(--euc); }
    .mt-amount { font-family: 'Fraunces', serif; font-size: 26px; font-weight: 500; text-align: center; }

    .mt-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .mt-chip { border: 1px solid var(--line); background: var(--card); border-radius: 999px; padding: 8px 13px; font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; color: var(--ink-soft); display: flex; align-items: center; gap: 5px; }
    .mt-chip.on { border-color: transparent; color: #fff; }
    .mt-chip.add { border-style: dashed; color: var(--euc); }

    .mt-save { width: 100%; border: 0; background: var(--ink); color: #F6F3EC; font-family: inherit; font-weight: 600; font-size: 16px; padding: 15px; border-radius: 14px; cursor: pointer; margin-top: 6px; }
    .mt-save:disabled { opacity: .4; cursor: default; }

    .mt-deltx { width: 100%; border: 1px solid var(--clay); background: transparent; color: var(--clay); font-family: inherit; font-weight: 600; font-size: 14px; padding: 13px; border-radius: 14px; cursor: pointer; margin-top: 10px; }
    .mt-deltx.confirm { background: var(--clay); color: #fff; }

    .mt-catrow { display: flex; align-items: center; gap: 12px; padding: 11px 2px; border-top: 1px solid var(--line); }
    .mt-catrow:first-child { border-top: 0; }
    .mt-catrow .sw { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; font-size: 16px; flex: none; }
    .mt-catrow .nm { flex: 1; font-weight: 500; font-size: 14px; }
    .mt-catrow .cnt { font-size: 12px; color: var(--ink-soft); }
    .mt-del { border: 0; background: transparent; cursor: pointer; color: var(--ink-soft); font-size: 17px; padding: 6px 9px; border-radius: 9px; }
    .mt-del:hover { color: var(--clay); }
    .mt-del.confirm { background: var(--clay); color: #fff; font-size: 13px; font-weight: 600; padding: 7px 13px; }
    .mt-locked { font-size: 11px; color: var(--ink-soft); padding: 6px 4px; }

    .mt-newcat { border: 1px dashed var(--line); border-radius: 16px; padding: 16px; margin-top: 14px; background: rgba(255,255,255,.55); }
    .mt-newcat .ttl { font-size: 12px; font-weight: 600; color: var(--ink-soft); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 12px; }
    .mt-pick { display: flex; flex-wrap: wrap; gap: 6px; }
    .mt-pick .em { width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); cursor: pointer; font-size: 18px; display: grid; place-items: center; }
    .mt-pick .em.on { border-color: var(--euc); box-shadow: 0 0 0 2px rgba(46,90,71,.25); }
    .mt-pick .co { width: 30px; height: 30px; border-radius: 999px; cursor: pointer; border: 2px solid transparent; }
    .mt-pick .co.on { border-color: var(--ink); }
    .mt-err { color: var(--clay); font-size: 12px; margin-top: 8px; }
    .mt-addbtn { width: 100%; border: 1px solid var(--euc); background: transparent; color: var(--euc); font-family: inherit; font-weight: 600; font-size: 14px; padding: 12px; border-radius: 12px; cursor: pointer; margin-top: 14px; }
    .mt-addbtn:disabled { opacity: .4; cursor: default; }

    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  `;

  const maxTrend = Math.max(...trend.map((d) => Math.abs(d.net)), 1);

  if (authLoading) return <LoadingScreen />;
  if (!session) return <Auth />;
  if (dataLoading) return <LoadingScreen />;

  return (
    <div className="mt-root">
      <style>{css}</style>
      <div className="mt-app">
        <header className="mt-head">
          <div className="mt-brand">
            <span className="mt-logo">Léa<span className="dot">.</span></span>
            <span className="mt-by">by Joujou</span>
          </div>
          <div className="mt-right">
            <button className="mt-gear" onClick={signOut} aria-label="Se déconnecter">⏻</button>
            <button className="mt-gear" onClick={() => setCatSheetOpen(true)} aria-label="Gérer les catégories">🏷️</button>
            <div className="mt-cur">
              <button className={currency === "AUD" ? "on" : ""} onClick={() => setCurrency("AUD")}>$&nbsp;AUD</button>
              <button className={currency === "EUR" ? "on" : ""} onClick={() => setCurrency("EUR")}>€&nbsp;EUR</button>
            </div>
          </div>
        </header>

        <div className="mt-month">
          <button onClick={() => shiftMonth(-1)} aria-label="Mois précédent">‹</button>
          <span>{monthLabel(cursor)}</span>
          <button onClick={() => shiftMonth(1)} aria-label="Mois suivant">›</button>
        </div>

        <div className="mt-hero">
          <div className="lbl">Solde du mois</div>
          <div className="big tnum">{net >= 0 ? "+" : "−"}{money(Math.abs(net))}</div>
          <div className="rows">
            <div className="pill"><div className="k">Revenus</div><div className="v tnum">{money(income)}</div></div>
            <div className="pill"><div className="k">Dépenses</div><div className="v tnum">{money(expense)}</div></div>
          </div>
        </div>

        {byCat.length > 0 && (
          <div className="mt-card">
            <h3>Répartition des dépenses</h3>
            <div className="mt-donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCat} dataKey="value" innerRadius={54} outerRadius={78} paddingAngle={2} stroke="none">
                    {byCat.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="center"><div><div className="c1">Total dépensé</div><div className="c2 tnum">{money(expense)}</div></div></div>
            </div>
            <div className="mt-legend">
              {byCat.map((d) => (
                <div className="row" key={d.name}>
                  <span className="sw" style={{ background: d.color }} />
                  <span className="nm">{d.icon} {d.name}</span>
                  <span className="vl tnum">{money(d.value)}</span>
                  <span className="pc tnum">{Math.round((d.value / expense) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-card">
          <h3>Solde sur 6 mois</h3>
          <div className="mt-trend">
            {trend.map((d) => {
              const h = Math.max((Math.abs(d.net) / maxTrend) * 72, 4);
              const pos = d.net >= 0;
              return (
                <div key={d.key} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ height: 72, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                    <div style={{ width: 22, height: h, borderRadius: 6, background: pos ? "var(--euc)" : "var(--clay)", opacity: d.current ? 1 : 0.4 }} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 6, fontWeight: d.current ? 700 : 400 }}>{d.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-card">
          <div className="mt-list-head"><h3>Transactions</h3><span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{monthTx.length}</span></div>
          {monthTx.length === 0 ? (
            <div className="mt-empty">Aucune transaction ce mois-ci.<br />Appuie sur « Ajouter » pour commencer.</div>
          ) : (
            monthTx.map((x) => (
              <div className="mt-tx" key={x.id} onClick={() => { setEditingTx(x); setSheetOpen(true); }}>
                <div className="ic" style={{ background: meta(x.cat).color + "1E" }}>{meta(x.cat).icon}</div>
                <div className="mid">
                  <div className="c">{x.cat}</div>
                  <div className="n">{x.note ? x.note + " · " : ""}{new Date(x.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
                </div>
                <div className={"amt tnum" + (x.type === "income" ? " inc" : "")}>{x.type === "income" ? "+" : "−"}{money(x.amountAUD, true)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <button className="mt-fab" onClick={() => { setEditingTx(null); setSheetOpen(true); }}><span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Ajouter</button>

      {sheetOpen && (
        <AddSheet
          cats={cats}
          editing={editingTx}
          onClose={() => { setSheetOpen(false); setEditingTx(null); }}
          onSave={addTx}
          onUpdate={updateTx}
          onDelete={deleteTx}
          onAddCategory={addCategory}
        />
      )}
      {catSheetOpen && <CategorySheet cats={cats} usage={usage} onClose={() => setCatSheetOpen(false)} onAdd={addCategory} onDelete={deleteCategory} />}
    </div>
  );
}

/* --- Formulaire réutilisable de création de catégorie --- */
function CategoryForm({ type, onAdd, cta }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(EMOJI_PRESETS[0]);
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [err, setErr] = useState("");

  const submit = async () => {
    const ok = await onAdd({ name: name.trim(), icon, color, type });
    if (!ok) { setErr("Ce nom existe déjà ou est vide."); return; }
    setName(""); setErr("");
  };

  return (
    <div>
      <div className="mt-field">
        <label>Nom</label>
        <input className="mt-input" placeholder="Ex. Sport, Cadeaux…" value={name}
          onChange={(e) => { setName(e.target.value); setErr(""); }} />
      </div>
      <div className="mt-field">
        <label>Icône</label>
        <div className="mt-pick">
          {EMOJI_PRESETS.map((e) => (
            <button key={e} className={"em" + (icon === e ? " on" : "")} onClick={() => setIcon(e)}>{e}</button>
          ))}
        </div>
      </div>
      <div className="mt-field">
        <label>Couleur</label>
        <div className="mt-pick">
          {COLOR_PRESETS.map((c) => (
            <button key={c} className={"co" + (color === c ? " on" : "")} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>
      </div>
      {err && <div className="mt-err">{err}</div>}
      <button className="mt-addbtn" disabled={!name.trim()} onClick={submit}>{cta || "Ajouter la catégorie"}</button>
    </div>
  );
}

/* --- Feuille de gestion des catégories (ajout + suppression) --- */
function CategorySheet({ cats, usage, onClose, onAdd, onDelete }) {
  const [type, setType] = useState("expense");
  const [confirm, setConfirm] = useState(null);

  const list = Object.keys(cats).filter((k) => cats[k].type === type);

  return (
    <>
      <div className="mt-scrim" onClick={onClose} />
      <div className="mt-sheet">
        <div className="grab" />
        <h2>Catégories</h2>
        <div className="sub">Ajoute les tiennes ou supprime celles que tu n'utilises pas.</div>

        <div className="mt-seg">
          <button className={type === "expense" ? "on" : ""} onClick={() => { setType("expense"); setConfirm(null); }}>Dépenses</button>
          <button className={type === "income" ? "on" : ""} onClick={() => { setType("income"); setConfirm(null); }}>Revenus</button>
        </div>

        <div>
          {list.map((name) => {
            const locked = name === FALLBACK[type];
            const n = usage[name] || 0;
            return (
              <div className="mt-catrow" key={name}>
                <span className="sw" style={{ background: cats[name].color + "22" }}>{cats[name].icon}</span>
                <span className="nm">{name}{n > 0 && <span className="cnt"> · {n} mouvement{n > 1 ? "s" : ""}</span>}</span>
                {locked ? (
                  <span className="mt-locked">par défaut</span>
                ) : confirm === name ? (
                  <button className="mt-del confirm" onClick={() => { onDelete(name); setConfirm(null); }}>
                    Supprimer{n > 0 ? ` (${n} → Autre)` : ""}
                  </button>
                ) : (
                  <button className="mt-del" onClick={() => setConfirm(name)} aria-label={"Supprimer " + name}>🗑</button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-newcat">
          <div className="ttl">Nouvelle catégorie ({type === "expense" ? "dépense" : "revenu"})</div>
          <CategoryForm type={type} onAdd={onAdd} />
        </div>
      </div>
    </>
  );
}

/* --- Feuille d'ajout / modification de transaction --- */
function AddSheet({ cats, editing, onClose, onSave, onUpdate, onDelete, onAddCategory }) {
  const [kind, setKind] = useState(editing ? editing.type : "expense");
  const [amount, setAmount] = useState(editing ? String(editing.amountAUD) : "");
  const [cat, setCat] = useState(editing ? editing.cat : "");
  const [date, setDate] = useState(editing ? editing.date : new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(editing ? editing.note : "");
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const list = Object.keys(cats).filter((c) => cats[c].type === kind);
  const valid = parseFloat(amount) > 0 && cat;

  const handleAddCat = async (c) => {
    const ok = await onAddCategory(c);
    if (ok) { setCat(c.name); setCreating(false); }
    return ok;
  };

  const submit = () => {
    if (!valid) return;
    const entry = { date, cat, amountAUD: parseFloat(amount), note: note.trim() };
    if (editing) onUpdate({ ...entry, id: editing.id });
    else onSave(entry);
  };

  return (
    <>
      <div className="mt-scrim" onClick={onClose} />
      <div className="mt-sheet">
        <div className="grab" />
        <h2>{editing ? "Modifier la transaction" : "Nouvelle transaction"}</h2>
        <div style={{ height: 12 }} />

        <div className="mt-seg">
          <button className={kind === "expense" ? "on" : ""} onClick={() => { setKind("expense"); setCat(""); setCreating(false); }}>Dépense</button>
          <button className={kind === "income" ? "on" : ""} onClick={() => { setKind("income"); setCat(""); setCreating(false); }}>Revenu</button>
        </div>

        <div className="mt-field">
          <label>Montant (AUD)</label>
          <input className="mt-input mt-amount tnum" inputMode="decimal" placeholder="0" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(",", "."))} autoFocus />
        </div>

        <div className="mt-field">
          <label>Catégorie</label>
          <div className="mt-chips">
            {list.map((c) => (
              <button key={c} className={"mt-chip" + (cat === c ? " on" : "")}
                style={cat === c ? { background: cats[c].color } : {}} onClick={() => setCat(c)}>
                {cats[c].icon} {c}
              </button>
            ))}
            <button className="mt-chip add" onClick={() => setCreating((v) => !v)}>+ créer</button>
          </div>
          {creating && (
            <div className="mt-newcat">
              <div className="ttl">Nouvelle catégorie ({kind === "expense" ? "dépense" : "revenu"})</div>
              <CategoryForm type={kind} onAdd={handleAddCat} cta="Créer & choisir" />
            </div>
          )}
        </div>

        <div className="mt-field">
          <label>Date</label>
          <input className="mt-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="mt-field">
          <label>Note (optionnel)</label>
          <input className="mt-input" placeholder="Ex. brunch avec Léa" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <button className="mt-save" disabled={!valid} onClick={submit}>
          {editing ? "Enregistrer les modifications" : "Enregistrer"}
        </button>

        {editing && (
          confirmDelete ? (
            <button className="mt-deltx confirm" onClick={() => onDelete(editing.id)}>
              Confirmer la suppression
            </button>
          ) : (
            <button className="mt-deltx" onClick={() => setConfirmDelete(true)}>
              Supprimer cette transaction
            </button>
          )
        )}
      </div>
    </>
  );
}
