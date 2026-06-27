// ============================================================================
//  OCR  –  due motori, scelti automaticamente (nessuna configurazione utente):
//   1. ML Kit (nativo, on-device) — usato dentro l'APK Android. Gratis, offline,
//      molto più preciso di Tesseract, nessuna chiave. Riconosciuto via il bridge
//      Capacitor (window.Capacitor.Plugins).
//   2. Tesseract.js — ripiego per il browser/PWA (dove ML Kit non esiste).
//  In entrambi i casi l'elaborazione resta sul dispositivo: nessun dato esce.
// ============================================================================

import { parseReceipt } from "./parser.js";

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

// ---------------------------------------------------------------------------
//  Motore 1: ML Kit nativo (on-device) tramite il bridge Capacitor
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
  if (typeof res.text === "string") return res.text;
  if (typeof res.value === "string") return res.value;
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
async function nativeRecognize(file, onProgress) {
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
  if (onProgress) onProgress(0.4);
  const base64 = await fileToBase64(file);

  const candidates = [
    // @capacitor-community/image-to-text  (nome bridge: "CapacitorOcr")
    { name: "CapacitorOcr", call: (p) => p.detectText({ base64, orientation: "UP" }) },
    // ripieghi per altri plugin OCR diffusi
    { name: "Ocr", call: (p) => (p.detectText ? p.detectText({ base64, orientation: "UP" }) : p.recognize({ base64 })) },
    { name: "TextRecognition", call: (p) => (p.detectText ? p.detectText({ base64Image: base64 }) : p.processImage({ base64 })) },
    { name: "MlkitTextRecognition", call: (p) => p.processImage({ base64 }) },
  ];

  for (const cand of candidates) {
    const plugin = getPlugin(cand.name);
    if (!plugin) continue;
    try {
      const res = await cand.call(plugin);
      const text = extractText(res);
      if (text && text.trim().length > 2) {
        if (onProgress) onProgress(1);
        return text;
      }
    } catch (e) {
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
export async function readReceipt(file, _opts, onProgress) {
  // 1) OCR nativo on-device (ML Kit) se disponibile -> più preciso, offline
  if (isNative()) {
    try {
      const text = await nativeRecognize(file, onProgress);
      if (text) return parseReceipt(text);
      console.warn("Nessun plugin OCR nativo trovato: uso Tesseract.");
    } catch (e) {
      console.warn("OCR nativo fallito, ripiego su Tesseract:", e && e.message);
    }
  }
  // 2) ripiego: Tesseract.js (browser o APK senza plugin)
  return ocrTesseract(file, onProgress);
}
