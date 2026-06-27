# 🧾 Spesa Smart – App Scontrini (offline, dati solo sul telefono)

App per telefono che **fotografa lo scontrino, lo legge (OCR), riconosce il
supermercato e confronta i prezzi nel tempo** — inclusa la funzione **"Dove
conviene"** che confronta lo stesso prodotto tra supermercati diversi.

- ✅ **100% locale**: i dati sono salvati **solo sul telefono**, senza account né internet.
- ✅ **Offline**: anche la lettura del testo (OCR) è inclusa nell'app.
- ✅ Si installa come vera app Android tramite **APK** (impacchettata con Capacitor).
- ✅ Nessun file Python: solo HTML + JavaScript.

> ⚠️ Poiché i dati stanno solo sul telefono, **se disinstalli l'app o perdi il
> telefono i dati vanno persi**. Usa *Impostazioni → Esporta backup (JSON)* per
> salvare una copia.

---

## 🚀 Creare e installare l'app sul telefono (APK)

Tutte le istruzioni passo-passo sono in **[BUILD-APK.md](BUILD-APK.md)**.

In sintesi (dopo aver installato **Node.js** e **Android Studio**):

```powershell
npm install
npm run setup          # bundla l'OCR offline (modello italiano)
npx cap init "Spesa Smart" com.spesasmart.scontrini --web-dir=www
npm run add:android
npm run sync
npm run apk            # -> android\app\build\outputs\apk\debug\app-debug.apk
```

---

## 💻 Provare l'app sul PC (senza impacchettarla)

Serve un piccolo server locale (la fotocamera funziona solo su `localhost`/HTTPS):

```powershell
npx serve www
```
…e apri l'indirizzo mostrato. In alternativa, l'estensione VS Code *Live Server*
su `www/index.html`.

---

## 🗂️ Struttura del progetto

```
www/                     ← l'app (viene impacchettata nell'APK)
  index.html             UI
  css/styles.css         stile mobile-first
  js/parser.js           parsing scontrini italiani (negozio, data, righe, totale)
  js/ocr.js              OCR: ML Kit nativo (APK) con ripiego Tesseract (web)
  js/store.js            salvataggio LOCALE (localStorage) – nessun cloud
  js/compare.js          analisi: storico prezzi, confronto negozi, "Dove conviene"
  js/app.js              controller UI
  manifest.webmanifest   metadati app
  sw.js                  service worker (offline nel browser)
  vendor/                creata da "npm run setup": file OCR offline
  icons/icon.svg         icona

capacitor.config.json    configurazione Capacitor (appId, webDir)
package.json             dipendenze + script (setup, add:android, sync, apk)
scripts/                 fetch-ocr-assets.mjs (OCR offline), build-apk.mjs
BUILD-APK.md             guida completa alla creazione dell'APK
PROMPT.md                documento di progettazione
```

---

## 🎯 Lettura degli scontrini (OCR)

- **Nell'APK**: **Google ML Kit on-device** — preciso, offline, gratis, **senza
  alcuna configurazione** da parte dell'utente. Nessuna foto/dato lascia il telefono.
- **Nel browser/PWA**: ripiego su **Tesseract.js** (sempre on-device).
- Dopo la lettura si apre una schermata di **revisione** per correggere/aggiungere
  righe prima di salvare (l'OCR non è mai perfetto sugli scontrini termici).

Il plugin ML Kit si installa in fase di build (vedi [BUILD-APK.md](BUILD-APK.md));
l'app lo rileva automaticamente e altrimenti usa Tesseract.

---

## 🔐 Privacy

Nessun dato lascia il telefono. Nessun account, nessun tracciamento, nessun server.
