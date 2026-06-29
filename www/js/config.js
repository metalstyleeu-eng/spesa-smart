// ============================================================================
//  CONFIGURAZIONE LETTURA AI (cloud)
//  Da compilare DOPO aver pubblicato il mini-server (vedi DEPLOY-SERVER.md).
//  Finché CLOUD_OCR_URL è vuoto, l'app legge in locale (ML Kit/Tesseract).
// ============================================================================

// Incolla qui l'indirizzo del tuo Worker, es:
//   "https://spesa-ocr.tuonome.workers.dev"
export const CLOUD_OCR_URL = "";

// Opzionale ma consigliato: stringa segreta uguale a APP_TOKEN del server.
// Serve a evitare che altri usino il tuo server (e la tua quota Gemini).
export const CLOUD_OCR_KEY = "";

export function cloudConfigured() {
  return typeof CLOUD_OCR_URL === "string" && /^https:\/\/\S+/.test(CLOUD_OCR_URL);
}
