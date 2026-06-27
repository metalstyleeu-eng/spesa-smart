// Service worker minimale: cache app-shell per uso offline.
// IMPORTANTE: incrementa questo numero a ogni modifica dei file (es. -v3)
// così il service worker scarica la nuova versione invece di servire la cache.
const CACHE = "spesa-smart-v13";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/store.js",
  "./js/ocr.js",
  "./js/parser.js",
  "./js/compare.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  // Non mettere in cache le chiamate a Gemini/Firebase/Tesseract CDN: vanno sempre in rete.
  if (url.includes("googleapis.com") || url.includes("gstatic.com") || url.includes("jsdelivr.net") || url.includes("tessdata")) {
    return; // lascia gestire al browser
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => cached))
  );
});
