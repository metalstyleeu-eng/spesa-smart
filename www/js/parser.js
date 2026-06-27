// ============================================================================
//  PARSER SCONTRINI ITALIANI
//  Trasforma il testo grezzo dell'OCR in dati strutturati:
//  { store, date, items:[{name, qty, price}], total, raw }
// ============================================================================

// Catene di supermercati italiani note -> nome canonico + colore badge.
// L'ordine conta: i nomi più specifici vanno prima.
export const STORES = [
  { match: /esselunga/i,            name: "Esselunga",      color: "#e2001a" },
  { match: /\bconad\b/i,            name: "Conad",          color: "#e30613" },
  { match: /coop|ipercoop|coop ?italia/i, name: "Coop",      color: "#e2001a" },
  { match: /\blidl\b/i,             name: "Lidl",           color: "#0050aa" },
  { match: /eurospin/i,             name: "Eurospin",       color: "#005baa" },
  { match: /carrefour/i,            name: "Carrefour",      color: "#004e9e" },
  { match: /\bpam\b|panorama/i,     name: "Pam Panorama",   color: "#e2001a" },
  { match: /bennet/i,               name: "Bennet",         color: "#e30613" },
  { match: /\bmd\b|md discount/i,   name: "MD",             color: "#e2001a" },
  { match: /\baldi\b/i,             name: "Aldi",           color: "#00497b" },
  { match: /\bdespar|interspar|eurospar/i, name: "Despar",  color: "#e2001a" },
  { match: /\bcrai\b/i,             name: "Crai",           color: "#ed1c24" },
  { match: /tigre|tigota|gabrielli/i, name: "Tigre",        color: "#f39200" },
  { match: /tos[aà]no/i,            name: "Tosano",         color: "#e30613" },
  { match: /famila|a&o|aeo/i,       name: "Famila",         color: "#009640" },
  { match: /\bin's\b|in's mercato/i, name: "In's",          color: "#e2001a" },
  { match: /\bdok\b|sigma|sis[aà]/i, name: "Dok/Sigma",     color: "#009640" },
  { match: /penny ?market|\bpenny\b/i, name: "Penny Market", color: "#e2001a" },
  { match: /todis/i,                name: "Todis",          color: "#009640" },
  { match: /decò|\bdeco\b|gruppo arena/i, name: "Decò",     color: "#e2001a" },
];

// Colore di fallback derivato dal nome (hash deterministico).
export function colorFor(name) {
  const known = STORES.find((s) => s.name.toLowerCase() === (name || "").toLowerCase());
  if (known) return known.color;
  let h = 0;
  for (const ch of name || "?") h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 42%)`;
}

// ---------------------------------------------------------------------------
//  Categorie di negozio (tipo di esercizio)
// ---------------------------------------------------------------------------
export const CATEGORIES = [
  { label: "Supermercato",  emoji: "🛒" },
  { label: "Discount",      emoji: "🏷️" },
  { label: "Panetteria",    emoji: "🥖" },
  { label: "Macelleria",    emoji: "🥩" },
  { label: "Pescheria",     emoji: "🐟" },
  { label: "Ortofrutta",    emoji: "🍎" },
  { label: "Gastronomia",   emoji: "🧀" },
  { label: "Farmacia",      emoji: "💊" },
  { label: "Bar/Ristorante",emoji: "🍽️" },
  { label: "Mercato",       emoji: "🧺" },
  { label: "Altro",         emoji: "🏬" },
];

export function emojiForType(type) {
  const c = CATEGORIES.find((c) => c.label === type);
  return c ? c.emoji : "🏬";
}

// catene discount note (per distinguerle dai supermercati "classici")
const DISCOUNT_RE = /\blidl\b|eurospin|\bmd\b|\baldi\b|penny|in's|todis|\bprix\b|dpiu|d[íi]?\s*pi[uù]/i;

// regole per i piccoli negozi / botteghe (vince la più specifica)
const TYPE_RULES = [
  { type: "Panetteria",     re: /panetteria|panificio|\bforno\b|fornai|panific/i },
  { type: "Pescheria",      re: /pescheria|\bpesce\b|ittic/i },
  { type: "Macelleria",     re: /macell|\bcarni\b|polleria|braceria/i },
  { type: "Ortofrutta",     re: /ortofrutta|fruttivendol|frutta\s*e\s*verdura|ortofr/i },
  { type: "Gastronomia",    re: /gastronomia|salumeria|salumi|formaggi|latteria|caseificio|rosticceria/i },
  { type: "Farmacia",       re: /parafarmacia|farmacia/i },
  { type: "Bar/Ristorante", re: /ristorant|pizzeri|trattori|osteri|\bbar\b|caff[èe]|pasticceri|gelateri|tavola\s*calda|paninoteca|enoteca/i },
];

// Riconosce il tipo di negozio dal testo dello scontrino (+ nome rilevato).
export function detectType(text, store = "") {
  const hay = (text || "") + " " + (store || "");
  // 1) catena conosciuta -> Supermercato o Discount
  for (const s of STORES) {
    if (s.match.test(text) || s.match.test(store)) {
      return DISCOUNT_RE.test(hay) ? "Discount" : "Supermercato";
    }
  }
  // 2) parole chiave delle botteghe (più specifiche dei generici)
  for (const r of TYPE_RULES) if (r.re.test(hay)) return r.type;
  // 3) generici
  if (DISCOUNT_RE.test(hay) || /discount/i.test(hay)) return "Discount";
  if (/supermercat|ipermercat|\biper\b|minimarket|\bmarket\b|alimentari/i.test(hay)) return "Supermercato";
  if (/mercato/i.test(hay)) return "Mercato";
  return "Altro";
}

// Parole che indicano righe NON-prodotto (da scartare dalla lista articoli).
const STOP_WORDS = /\b(totale|subtotale|sub-totale|tot\.|tot |iva|imponibile|resto|contant|carta|bancomat|pagamento|importo|n\.?\s*pezzi|num(ero)?\s*articoli|scontrino|documento|commerciale|cod\.?\s*fisc|partita\s*iva|p\.?\s*iva|cassa|operatore|grazie|arrivederci|saldo|punti|fidaty|carta\s*fedelt|sconto\s*tot|netto\s*a\s*pagare|pagato|euro|cambio)/i;

// --- helper numerici (formato italiano: 1.234,56) ---
export function parsePrice(str) {
  if (str == null) return null;
  let s = String(str).trim().replace(/[€\s]/g, "");
  // se ci sono sia . che , -> . sono migliaia
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function fmtPrice(n) {
  return (Number(n) || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Pattern di un prezzo a fine riga: 12,50  /  1.234,56  /  3.00
const PRICE_RE = /(-?\d{1,3}(?:[.\s]\d{3})*[.,]\d{2})\s*(?:€|eur)?\s*[A-Z]?\s*$/i;
// Pattern quantità * prezzo unitario: "2 x 1,20"  "2X1,20"  "3 PZ x 0,99"
const QTY_RE = /^(\d+(?:[.,]\d+)?)\s*(?:x|×|pz\s*x|conf\s*x)\s*(\d{1,3}(?:[.,]\d{2}))/i;

// ---------------------------------------------------------------------------
//  Riconoscimento supermercato
// ---------------------------------------------------------------------------
export function detectStore(text) {
  for (const s of STORES) if (s.match.test(text)) return s.name;
  // fallback: prima riga "significativa" in maiuscolo
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const l of lines.slice(0, 6)) {
    if (/^[A-ZÀ-Ù&'.\s]{4,}$/.test(l) && !STOP_WORDS.test(l) && !/\d{2}[/.]\d{2}/.test(l)) {
      return l.replace(/\s{2,}/g, " ").slice(0, 28);
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
//  Riconoscimento data  (gg/mm/aaaa, gg-mm-aa, ecc.)
// ---------------------------------------------------------------------------
export function detectDate(text) {
  const m = text.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/);
  if (m) {
    let [, d, mo, y] = m;
    d = +d; mo = +mo; y = +y;
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
//  Riconoscimento totale
// ---------------------------------------------------------------------------
export function detectTotal(text) {
  const lines = text.split(/\n/);
  let candidate = null;
  for (const line of lines) {
    if (/\b(totale|tot\.?\s*(complessivo|euro|eur)?|netto\s*a\s*pagare|importo\s*pagato)\b/i.test(line)
        && !/subtotale|sub-totale|n\.?\s*pezzi|articoli|iva/i.test(line)) {
      const m = line.match(/(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2})/g);
      if (m) candidate = parsePrice(m[m.length - 1]);
    }
  }
  return candidate;
}

// ---------------------------------------------------------------------------
//  Estrazione articoli
// ---------------------------------------------------------------------------
export function extractItems(text) {
  const lines = text.split(/\n/).map((l) => l.replace(/\s{2,}/g, " ").trim()).filter(Boolean);
  const items = [];
  let pendingQty = null; // riga "2 x 1,20" che precede/segue una descrizione

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (STOP_WORDS.test(line)) continue;

    // riga "qta x prezzo unitario"
    const q = line.match(QTY_RE);
    if (q && !PRICE_RE.test(line.replace(QTY_RE, ""))) {
      pendingQty = { qty: parsePrice(q[1]), unit: parsePrice(q[2]) };
      // alcuni scontrini mettono il totale riga in fondo a QUESTA riga
      const pm = line.match(PRICE_RE);
      if (pm) {
        const total = parsePrice(pm[1]);
        const name = line.replace(QTY_RE, "").replace(PRICE_RE, "").replace(/[-–]/g, "").trim();
        if (name.length >= 2) {
          items.push({ name: clean(name), qty: pendingQty.qty || 1, price: total });
          pendingQty = null;
        }
      }
      continue;
    }

    const pm = line.match(PRICE_RE);
    if (!pm) continue;

    const price = parsePrice(pm[1]);
    if (price == null || Math.abs(price) > 999) continue; // prezzo riga implausibile
    let name = line.slice(0, pm.index).replace(/[-–.]+$/, "").trim();
    name = clean(name);

    // se il nome è vuoto, prova a usare la riga precedente come descrizione
    if (name.length < 2 && items.length === 0 && i > 0 && !PRICE_RE.test(lines[i - 1])) {
      name = clean(lines[i - 1]);
    }
    if (name.length < 2) continue;
    if (/^\d+$/.test(name)) continue; // solo numeri

    const qty = pendingQty ? pendingQty.qty || 1 : 1;
    items.push({ name, qty, price });
    pendingQty = null;
  }
  return items;
}

function clean(s) {
  return s
    .replace(/^\d{6,}\s*/, "")          // codici a barre iniziali
    .replace(/\s+[A-Z]$/, "")           // lettera aliquota IVA finale ISOLATA (preceduta da spazio)
    .replace(/[*#]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
//  Parser completo
// ---------------------------------------------------------------------------
export function parseReceipt(rawText) {
  const text = rawText || "";
  const items = extractItems(text);
  let total = detectTotal(text);
  if (total == null && items.length) {
    total = items.reduce((s, it) => s + (it.price || 0), 0);
  }
  const store = detectStore(text);
  return {
    store,
    type: detectType(text, store),
    date: detectDate(text),
    items,
    total: total != null ? +total.toFixed(2) : 0,
    raw: text,
  };
}

// Normalizza un nome prodotto per il confronto storico (chiave).
export function normalizeName(name) {
  return (name || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // accenti
    .replace(/\d+\s*(g|gr|kg|ml|cl|l|pz|x)\b/g, "")     // grammature
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
