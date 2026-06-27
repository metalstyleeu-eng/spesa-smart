// ============================================================================
//  CONFRONTO & ANALISI
//  Funzioni pure che, dato l'elenco scontrini, producono statistiche:
//   - andamento prezzo di un prodotto nel tempo
//   - confronto spesa per supermercato
//   - alert sulle variazioni di prezzo
// ============================================================================

import { normalizeName, fmtPrice } from "./parser.js";

// Prezzo unitario di una riga (gestisce la quantità).
function unitPrice(item) {
  const q = item.qty && item.qty > 0 ? item.qty : 1;
  return item.price / q;
}

// Tutte le occorrenze di un prodotto (chiave normalizzata) nel tempo.
export function priceHistory(receipts, productKey) {
  const key = normalizeName(productKey);
  const points = [];
  for (const r of receipts) {
    for (const it of r.items || []) {
      if (normalizeName(it.name).includes(key) && key.length >= 2) {
        points.push({
          date: r.date,
          store: r.store || "—",
          name: it.name,
          unit: +unitPrice(it).toFixed(2),
        });
      }
    }
  }
  return points.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

// Confronto dello STESSO prodotto tra supermercati diversi.
// Per ogni negozio in cui il prodotto è stato comprato, restituisce
// l'ultimo prezzo unitario, il prezzo medio e il minimo registrato.
// Ordina dal più economico (ultimo prezzo) al più caro.
export function productByStore(receipts, productKey) {
  const hist = priceHistory(receipts, productKey);
  const map = new Map();
  for (const p of hist) {
    if (!map.has(p.store)) map.set(p.store, { store: p.store, prices: [], lastDate: "", last: null });
    const e = map.get(p.store);
    e.prices.push(p.unit);
    if ((p.date || "") >= (e.lastDate || "")) { e.lastDate = p.date; e.last = p.unit; }
  }
  const rows = [...map.values()].map((e) => ({
    store: e.store,
    last: e.last,
    avg: +(e.prices.reduce((s, x) => s + x, 0) / e.prices.length).toFixed(2),
    min: +Math.min(...e.prices).toFixed(2),
    count: e.prices.length,
    lastDate: e.lastDate,
  })).sort((a, b) => a.last - b.last);

  if (rows.length) {
    const cheapest = rows[0].last;
    const dearest = rows[rows.length - 1].last;
    rows.forEach((r) => {
      r.isCheapest = r.last === cheapest;
      r.diffVsCheapest = +(r.last - cheapest).toFixed(2);
      r.pctVsCheapest = cheapest ? +(((r.last - cheapest) / cheapest) * 100).toFixed(1) : 0;
    });
    rows.maxSaving = +(dearest - cheapest).toFixed(2);
  }
  return rows;
}

// Elenco prodotti distinti (per autocompletamento ricerca).
export function allProducts(receipts) {
  const map = new Map();
  for (const r of receipts) {
    for (const it of r.items || []) {
      const k = normalizeName(it.name);
      if (k.length < 2) continue;
      if (!map.has(k)) map.set(k, { key: k, label: it.name, count: 0 });
      map.get(k).count++;
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// Spesa totale e media per negozio.
export function byStore(receipts) {
  const map = new Map();
  for (const r of receipts) {
    const s = r.store || "Sconosciuto";
    if (!map.has(s)) map.set(s, { store: s, total: 0, count: 0 });
    const e = map.get(s);
    e.total += r.total || 0;
    e.count++;
  }
  return [...map.values()]
    .map((e) => ({ ...e, avg: e.total / e.count }))
    .sort((a, b) => b.total - a.total);
}

// Spesa totale per categoria/tipo di negozio.
export function byType(receipts) {
  const map = new Map();
  for (const r of receipts) {
    const t = r.type || "Altro";
    if (!map.has(t)) map.set(t, { type: t, total: 0, count: 0 });
    const e = map.get(t);
    e.total += r.total || 0;
    e.count++;
  }
  return [...map.values()]
    .map((e) => ({ ...e, avg: e.total / e.count }))
    .sort((a, b) => b.total - a.total);
}

// Variazioni di prezzo: confronta l'ultimo prezzo di ogni prodotto col precedente.
export function priceAlerts(receipts, minPoints = 2) {
  const products = allProducts(receipts);
  const alerts = [];
  for (const p of products) {
    const hist = priceHistory(receipts, p.label);
    if (hist.length < minPoints) continue;
    const last = hist[hist.length - 1];
    const prev = hist[hist.length - 2];
    if (!prev.unit) continue;
    const diff = last.unit - prev.unit;
    if (Math.abs(diff) < 0.01) continue;
    alerts.push({
      name: p.label,
      from: prev.unit,
      to: last.unit,
      diff: +diff.toFixed(2),
      pct: +((diff / prev.unit) * 100).toFixed(1),
      store: last.store,
      date: last.date,
    });
  }
  return alerts.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
}

// Statistiche di sintesi per la home.
export function summary(receipts) {
  const total = receipts.reduce((s, r) => s + (r.total || 0), 0);
  const now = new Date();
  const thisMonth = receipts
    .filter((r) => {
      const d = new Date(r.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, r) => s + (r.total || 0), 0);
  return {
    count: receipts.length,
    total,
    thisMonth,
  };
}

// Confronto di un nuovo scontrino con lo storico: per ogni articolo trova
// l'ultimo prezzo unitario noto e calcola la variazione.
export function compareReceipt(rec, history) {
  return (rec.items || []).map((it) => {
    const past = priceHistory(history, it.name).filter((p) => p.date < rec.date);
    const prev = past.length ? past[past.length - 1] : null;
    const u = unitPrice(it);
    let delta = null;
    if (prev && prev.unit) {
      delta = { abs: +(u - prev.unit).toFixed(2), pct: +(((u - prev.unit) / prev.unit) * 100).toFixed(1), prev: prev.unit };
    }
    return { ...it, unit: +u.toFixed(2), delta };
  });
}

export { fmtPrice };
