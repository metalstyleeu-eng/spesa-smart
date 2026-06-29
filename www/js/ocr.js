// ============================================================================
//  OCR  –  tre motori, scelti automaticamente (nessuna configurazione utente):
//   1. AI cloud (Gemini via mini-server) — qualità massima, anche scontrini
//      difficili/a colonne. Usato se configurato (config.js) e c'è internet.
//   2. ML Kit (nativo, on-device) — ripiego offline dentro l'APK.
//   3. Tesseract.js — ripiego per il browser/PWA.
//  I dati restano sul telefono; con l'AI cloud la foto viene inviata SOLO per
//  la lettura (non conservata, non venduta).
// ============================================================================

import { parseReceipt, CATEGORIES } from "./parser.js";
import { CLOUD_OCR_URL, CLOUD_OCR_KEY, cloudConfigured } from "./config.js";

// --- Ridimensiona/migliora l'immagine prima dell'OCR (più veloce e preciso) ---
async function prepImage(file, maxW = 1600) {
  const img = await fileToImage(file);
  const scale = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  // grayscale + leggero aumento contrasto -> aiuta Tesseract sugli scontrini
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    g = (g - 128) * 1.25 + 128;            // contrasto
    g = Math.max(0, Math.min(255, g));
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(data, 0, 0);
  return cv;
}

function fileToImage(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Ridimensiona la foto e restituisce un data URL JPEG ("data:image/jpeg;base64,...").
// Fondamentale: passare l'immagine a piena risoluzione al plugin nativo può
// bloccare il bridge. Ridimensionando, la lettura è veloce e affidabile.
async function imageToResizedDataURL(file, maxW = 2200, quality = 0.92) {
  const img = await fileToImage(file);
  const scale = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return cv.toDataURL("image/jpeg", quality);
}

// Promessa con timeout: se non si risolve entro ms, viene rifiutata
// (così un plugin nativo bloccato fa scattare il ripiego su Tesseract).
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error((label || "OCR") + " timeout " + ms + "ms")), ms)),
  ]);
}

// ---------------------------------------------------------------------------
//  Motore 1: AI cloud (Gemini via mini-server)  → restituisce già strutturato
// ---------------------------------------------------------------------------
async function cloudRecognize(file, onProgress) {
  const dataUrl = await imageToResizedDataURL(file, 2000, 0.85);
  const base64 = dataUrl.split(",")[1];
  if (onProgress) onProgress(0.4);

  const headers = { "Content-Type": "application/json" };
  if (CLOUD_OCR_KEY) headers["x-app-key"] = CLOUD_OCR_KEY;

  const resp = await fetch(CLOUD_OCR_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ image: base64 }),
  });
  if (onProgress) onProgress(0.85);
  if (!resp.ok) throw new Error("server " + resp.status);

  const data = await resp.json();
  if (data && data.error) throw new Error(data.error);

  const allowed = new Set(CATEGORIES.map((c) => c.label));
  const items = Array.isArray(data.items)
    ? data.items
        .map((it) => ({ name: String(it.name || "").trim(), qty: +it.qty || 1, price: +it.price || 0 }))
        .filter((it) => it.name || it.price)
    : [];
  if (onProgress) onProgress(1);
  return {
    store: String(data.store || "").trim(),
    type: allowed.has(data.type) ? data.type : "Altro",
    date: /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : new Date().toISOString().slice(0, 10),
    items,
    total: +data.total || 0,
    raw: "(AI cloud)\n" + items.map((it) => `${it.name}  ${fmtNum(it.price)}`).join("\n"),
  };
}

function fmtNum(n) { return (Number(n) || 0).toFixed(2); }

// ---------------------------------------------------------------------------
//  Motore 2: ML Kit nativo (on-device) tramite il bridge Capacitor
// ---------------------------------------------------------------------------
function cap() {
  return typeof window !== "undefined" ? window.Capacitor : undefined;
}
export function isNative() {
  const c = cap();
  return !!(c && (c.isNativePlatform ? c.isNativePlatform() : c.platform && c.platform !== "web"));
}

// Normalizza le diverse forme di risposta dei vari plugin OCR in testo grezzo.
function extractText(res) {
  if (!res) return "";
  if (typeof res === "string") return res;
  if (typeof res.text === "string" && res.text.trim()) return res.text;
  if (typeof res.value === "string") return res.value;
  if (Array.isArray(res.results)) return res.results.map((r) => r.text || "").join("\n");        // @jcesarmobile/capacitor-ocr
  if (Array.isArray(res.textDetections)) return res.textDetections.map((d) => d.text || "").join("\n");
  if (Array.isArray(res.blocks)) return res.blocks.map((b) => b.text || "").join("\n");
  if (Array.isArray(res.lines)) return res.lines.map((l) => l.text || l).join("\n");
  if (Array.isArray(res.result)) return res.result.map((r) => r.text || r).join("\n");
  return "";
}

// Prova i plugin ML Kit OCR più diffusi, registrati sul bridge Capacitor.
// Restituisce il testo riconosciuto oppure null se nessun plugin è disponibile.
// NB: il plugin va installato e sincronizzato in fase di build (vedi BUILD-APK.md).
// Questo adapter è difensivo: se l'API differisse, basta aggiungere una voce qui.
async function nativeRecognize(file, onProgress, diag) {
  const c = cap();
  if (!c) return null;
  // Ottiene il proxy del plugin per nome dal bridge Capacitor.
  // registerPlugin() funziona anche senza bundler (app a moduli "nudi").
  const getPlugin = (name) => {
    try {
      if (typeof c.registerPlugin === "function") return c.registerPlugin(name);
      if (c.Plugins) return c.Plugins[name];
    } catch (_) {}
    return undefined;
  };
  if (onProgress) onProgress(0.3);
  // immagine ridimensionata (non a piena risoluzione) per non bloccare il bridge.
  // dataUrl = "data:image/jpeg;base64,...."  ;  base64 = solo la parte codificata.
  const dataUrl = await imageToResizedDataURL(file);
  const base64 = dataUrl.split(",")[1];
  if (onProgress) onProgress(0.5);

  const candidates = [
    // @jcesarmobile/capacitor-ocr  (bridge "Ocr", ML Kit incluso/offline)
    { name: "Ocr", call: (p) => p.process({ image: dataUrl }) },
    // ripieghi per altri plugin OCR (Capacitor 8)
    { name: "CapacitorPluginMlKitTextRecognition", call: (p) => p.detectText({ base64Image: base64, rotation: 0 }) },
    { name: "TextRecognition", call: (p) => (p.detectText ? p.detectText({ base64Image: base64 }) : p.processImage({ base64 })) },
  ];

  for (const cand of candidates) {
    const plugin = getPlugin(cand.name);
    if (!plugin) continue;
    try {
      // timeout: se il plugin nativo si blocca, si passa al prossimo / a Tesseract
      const res = await withTimeout(cand.call(plugin), 15000, cand.name);
      const text = extractText(res);
      if (text && text.trim().length > 2) {
        if (onProgress) onProgress(1);
        if (diag) diag.steps.push(cand.name + ": OK");
        return text;
      }
      if (diag) diag.steps.push(cand.name + ": risposta vuota");
    } catch (e) {
      if (diag) diag.steps.push(cand.name + ": " + (e && e.message));
      console.warn("Plugin OCR", cand.name, "non utilizzabile:", e && e.message);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
//  Motore 2: Tesseract.js (ripiego per browser / PWA)
// ---------------------------------------------------------------------------
async function ocrTesseract(file, onProgress) {
  if (typeof Tesseract === "undefined") {
    throw new Error("Motore OCR non disponibile (Tesseract non caricato).");
  }
  const canvas = await prepImage(file);
  const opts = {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
    },
  };
  // Se i file di Tesseract sono bundlati nell'app (vendor/), usali → OCR offline.
  // Altrimenti Tesseract userà i percorsi CDN di default.
  const base = typeof window !== "undefined" ? window.OCR_BASE : null;
  if (base) {
    opts.workerPath = base + "worker.min.js";
    opts.corePath = base;            // cartella con tesseract-core*.wasm(.js)
    opts.langPath = base + "lang";   // cartella con ita.traineddata.gz
  }
  const { data } = await Tesseract.recognize(canvas, "ita", opts);
  return parseReceipt(data.text);
}

// ---------------------------------------------------------------------------
//  Entry point: prova prima ML Kit nativo, poi ripiega su Tesseract
// ---------------------------------------------------------------------------
function pluginNames() {
  try { return Object.keys((cap() && cap().Plugins) || {}).join(", ") || "(nessuno)"; }
  catch { return "(n/d)"; }
}

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export async function readReceipt(file, opts, onProgress) {
  const onStatus = (opts && opts.onStatus) || function () {};
  const diag = { native: isNative(), cloud: cloudConfigured(), plugins: pluginNames(), steps: [] };

  // 1) AI cloud (qualità massima) se configurata e c'è connessione
  if (cloudConfigured() && isOnline()) {
    onStatus("Lettura AI…");
    try {
      const rec = await withTimeout(cloudRecognize(file, onProgress), 30000, "AI cloud");
      if (rec && (rec.items.length || rec.total)) return rec;
      diag.steps.push("AI cloud: risposta vuota");
    } catch (e) {
      diag.steps.push("AI cloud errore: " + (e && e.message));
    }
  }

  // 2) OCR nativo on-device (ML Kit) -> ripiego offline
  if (isNative()) {
    onStatus("Lettura con ML Kit…");
    try {
      const text = await withTimeout(nativeRecognize(file, onProgress, diag), 9000, "ML Kit");
      if (text) return parseReceipt(text);
    } catch (e) {
      diag.steps.push("ML Kit errore: " + (e && e.message));
    }
  } else {
    diag.steps.push("ambiente non nativo (browser)");
  }

  // 3) ripiego: Tesseract.js (con timeout, così non resta appeso)
  onStatus("Lettura con Tesseract…");
  try {
    return await withTimeout(ocrTesseract(file, onProgress), 12000, "Tesseract");
  } catch (e) {
    diag.steps.push("Tesseract errore: " + (e && e.message));
    const err = new Error("OCR non riuscito");
    err.diag = diag;
    throw err;
  }
}
