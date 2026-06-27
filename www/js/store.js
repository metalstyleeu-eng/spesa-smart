// ============================================================================
//  STORE  –  salvataggio 100% LOCALE (solo su questo dispositivo).
//  Nessun cloud, nessun account, nessuna rete: i dati restano nel telefono
//  (localStorage del WebView dell'app). Se disinstalli l'app o perdi il
//  telefono, i dati vanno persi: usa Esporta JSON per fare un backup.
// ============================================================================

const LS_KEY = "scontrini_v1";
const LS_SETTINGS = "scontrini_settings_v1";

const listeners = new Set();
export function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function emit() { listeners.forEach((cb) => cb()); }

// Inizializzazione (nessuna dipendenza esterna): sempre modalità locale.
export async function initStore() {
  return { mode: "local" };
}

function readAll() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
}
function writeAll(arr) {
  localStorage.setItem(LS_KEY, JSON.stringify(arr));
}

// ---------------------------------------------------------------------------
//  CRUD scontrini
// ---------------------------------------------------------------------------
export async function getReceipts() {
  return readAll().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export async function saveReceipt(rec) {
  const arr = readAll();
  const data = { ...rec, updatedAt: Date.now() };
  if (rec.id) {
    const i = arr.findIndex((r) => r.id === rec.id);
    if (i >= 0) arr[i] = { ...arr[i], ...data };
    else arr.push(data);
  } else {
    data.id = "loc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    arr.push(data);
  }
  writeAll(arr);
  emit();
  return data.id || rec.id;
}

export async function deleteReceipt(id) {
  writeAll(readAll().filter((r) => r.id !== id));
  emit();
}

// ---------------------------------------------------------------------------
//  Impostazioni (chiave Gemini opzionale, ecc.) – locali
// ---------------------------------------------------------------------------
export function getSettings() {
  try { return JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}"); }
  catch { return {}; }
}
export function saveSettings(s) {
  localStorage.setItem(LS_SETTINGS, JSON.stringify({ ...getSettings(), ...s }));
}

// ---------------------------------------------------------------------------
//  Import / Export  (backup manuale su file)
// ---------------------------------------------------------------------------
export async function exportAll() {
  const receipts = await getReceipts();
  return JSON.stringify({
    app: "spesa-smart",
    version: 1,
    exportedAt: new Date().toISOString(),
    count: receipts.length,
    receipts,
  }, null, 2);
}

function newId(extra = "") {
  return "loc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7) + extra;
}
// firma per riconoscere i doppioni in modalità "aggiungi"
function sig(r) {
  return `${r.store}|${r.date}|${r.total}|${(r.items || []).length}`;
}

// mode: "replace" (sostituisce tutto) | "merge" (aggiunge saltando i doppioni)
export async function importAll(json, { mode = "replace" } = {}) {
  const data = JSON.parse(json);
  const incoming = Array.isArray(data) ? data : data.receipts || [];
  if (!Array.isArray(incoming)) throw new Error("formato non valido");

  if (mode === "replace") {
    const cleaned = incoming.map((r, i) => ({ ...r, id: r.id || newId(String(i)) }));
    writeAll(cleaned);
    emit();
    return { added: cleaned.length, total: cleaned.length, mode };
  }

  // merge
  const existing = readAll();
  const have = new Set(existing.map(sig));
  let added = 0;
  incoming.forEach((r, i) => {
    if (have.has(sig(r))) return;
    const rec = { ...r, id: newId(String(i)) };
    existing.push(rec);
    have.add(sig(r));
    added++;
  });
  writeAll(existing);
  emit();
  return { added, total: existing.length, mode };
}
