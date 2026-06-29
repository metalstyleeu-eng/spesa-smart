# ☁️ Attivare la lettura AI (mini-server gratuito)

La lettura AI (precisa, anche su scontrini difficili) funziona così: l'app invia la
foto a un **tuo mini-server**, che la legge con **Google Gemini** e rimanda i dati.
La chiave Gemini sta **solo sul server** (una per tutti gli utenti). Gli utenti
finali non devono fare nulla.

Lo fai **una volta sola**, in ~15 minuti, **senza installare niente**.

---

## Passo 1 — Crea la chiave Gemini (gratis)
1. Vai su **https://aistudio.google.com/apikey** (accedi con un account Google).
2. **Create API key** → copia la chiave (inizia con `AIza...`). Tienila da parte.

> All'inizio il piano gratuito basta. Per volumi alti collegherai un metodo di
> pagamento: il costo è di **frazioni di centesimo a scansione**.

## Passo 2 — Pubblica il mini-server (Cloudflare Workers, gratis)
1. Crea un account gratuito su **https://dash.cloudflare.com/sign-up**
2. Nel pannello: **Workers & Pages** → **Create** → **Create Worker** → dai un nome
   (es. `spesa-ocr`) → **Deploy**.
3. Clicca **Edit code**: cancella tutto e incolla il contenuto del file
   [`server/worker.js`](server/worker.js) → **Deploy**.
4. Vai su **Settings → Variables and Secrets** del Worker e aggiungi:
   - `GEMINI_API_KEY` = la chiave del Passo 1 (tipo **Secret**)
   - `APP_TOKEN` = una stringa segreta a tua scelta (es. `spesa-2026-xY7k`) (tipo **Secret**)
   - *(opzionale)* `MODEL` = `gemini-2.5-flash`
   - **Deploy** per applicare.
5. Copia l'indirizzo del Worker, tipo: `https://spesa-ocr.tuonome.workers.dev`

## Passo 3 — Collega l'app al server
Apri [`www/js/config.js`](www/js/config.js) e compila:
```js
export const CLOUD_OCR_URL = "https://spesa-ocr.tuonome.workers.dev";
export const CLOUD_OCR_KEY = "spesa-2026-xY7k";   // uguale ad APP_TOKEN del server
```
Poi pubblica e ricrea l'APK:
```powershell
git add -A
git commit -m "Attiva lettura AI"
git push
```
(Actions ricompila l'APK → lo reinstalli sul telefono.)

---

## Come verificare che funzioni
- Apri l'app, scansiona uno scontrino: comparirà brevemente **"Lettura AI…"** e poi
  i dati letti, molto più precisi.
- Se non c'è internet, l'app ripiega in automatico sulla lettura on-device.

## Note
- **Costo**: ~€0,0003–0,0005 a scansione, sul tuo account, per tutti gli utenti.
  Con `APP_TOKEN` impostato, solo la tua app può usare il server (anti-abuso).
- **Privacy**: la foto passa dal server **solo** per la lettura, non viene salvata.
  I dati degli scontrini restano sul telefono dell'utente.
- **Limiti/quota**: in Cloudflare puoi aggiungere regole di *Rate limiting*; su
  Google AI Studio vedi i consumi. Per limitare le scansioni gratuite per utente
  (modello free/premium) lo gestiamo nell'app in un secondo momento.
- Se non compili `config.js`, l'app continua a funzionare con la lettura on-device.
