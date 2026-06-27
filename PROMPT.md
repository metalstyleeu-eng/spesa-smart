# Prompt strutturato & documento di progettazione — App Scontrini

> Questo è il "prompt profondo" richiesto: requisiti, ricerca a supporto,
> confronto tra alternative e architettura finale. Serve sia come specifica
> sia come prompt riutilizzabile per rigenerare/estendere l'app.

---

## 1. Obiettivo

> Realizzare un'app **mobile (web/PWA, no Python)** che, durante la spesa,
> permetta di **fotografare lo scontrino**, **memorizzarlo**, **leggerlo (OCR)**,
> **riconoscere il supermercato** e **confrontare gli acquisti con i precedenti**
> analizzando le **differenze di costo** nel tempo.
>
> **Revisione del progetto (vincoli aggiornati):** l'app deve salvare **qualsiasi
> dato solo sul telefono** (nessun cloud, nessun account) e deve essere
> **installabile come APK** che funziona offline. Niente chiavi/account personali
> dello sviluppatore.

## 2. Requisiti

**Funzionali**
1. Acquisizione foto scontrino dalla fotocamera del telefono.
2. OCR del testo e parsing in dati strutturati: negozio, data, righe (prodotto,
   quantità, prezzo), totale.
3. Riconoscimento automatico del supermercato (catene italiane note + fallback).
4. Salvataggio persistente degli scontrini.
5. Schermata di revisione/correzione manuale prima del salvataggio.
6. Confronto prezzi: storico per prodotto, andamento, variazioni (%).
7. Confronto spesa per supermercato.
8. Dettaglio scontrino con delta prezzo vs acquisto precedente.

**Non funzionali**
- Nessun file Python; solo HTML/CSS/JS lato client.
- Nessuna chiave segreta dello sviluppatore hardcodata.
- Gratis nei limiti d'uso personale.
- Funziona offline; installabile (PWA).
- Privacy: dati dell'utente isolati per account.

## 3. Ricerca web e confronto delle alternative (giugno 2026)

### 3.1 Motore OCR
| Opzione | Pro | Contro | Esito |
|---|---|---|---|
| **Tesseract.js** | gratis, on-device, offline, nessuna chiave | ~60% su scontrini termici sbiaditi; richiede correzioni | **Default** |
| **Gemini Flash** (vision) | molto preciso anche su foto storte/sgualcite; output JSON diretto; free tier 1.500 req/giorno | richiede una API key | **Opzionale, chiave dell'utente** |
| Google Cloud Vision | buona accuratezza | richiede billing/credenziali progetto | scartato |
| ABBYY/altri a pagamento | top accuratezza | costo | scartato |

Fonti: i VLM (Gemini/Claude/GPT) battono nettamente Tesseract su scontrini e foto
di bassa qualità, mentre Tesseract resta valido su testo stampato pulito. La
strategia adottata (Tesseract di default + Gemini opzionale come "upgrade"
dell'utente) riflette il pattern 2026 "vision come potenziamento, non obbligo".

### 3.2 Backend / persistenza
| Opzione | Pro | Contro | Esito |
|---|---|---|---|
| **localStorage (solo dispositivo)** | zero setup, offline, nessun account, privacy massima | solo un dispositivo, niente backup automatico | **SCELTO** |
| Firebase Firestore + Auth | sync multi-dispositivo, backup | richiede account/cloud, dati fuori dal telefono | scartato (l'utente vuole tutto sul telefono) |

Decisione chiave (revisione del progetto): **tutti i dati restano solo sul
telefono** (`localStorage` del WebView). Nessun cloud, nessun account. Backup
manuale via Esporta/Importa JSON. Non si salva l'immagine, solo i dati estratti.

### 3.3 Distribuzione / pacchetto
**APK nativo via Capacitor**: i file web in `www/` sono impacchettati dentro
l'app → funziona offline, si installa come app Android. L'OCR (Tesseract + modello
italiano) è bundlato in `www/vendor/` da `npm run setup`, così non serve internet.
Alternative valutate: PWA "Aggiungi a schermata Home" (no file APK) e PWABuilder/
TWA (dipende da un URL hostato) — scartate perché meno "tutto sul telefono".

## 4. Architettura

```
Fotocamera ─▶ ocr.js ──(Tesseract offline | Gemini opz.)──▶ parser.js ─▶ Revisione (UI)
                                                                  │
                                                                  ▼
                                              store.js ──(localStorage, solo device)
                                                                  │
                                                                  ▼
                                          compare.js ─▶ Analisi & confronti (UI)

  Tutto impacchettato in un APK via Capacitor (webDir = www).
```

- **parser.js**: regole per scontrini italiani (formato `1.234,56`, catene note,
  rilevamento data/totale, filtro righe non-prodotto, normalizzazione nomi per il
  confronto storico).
- **store.js**: salvataggio 100% locale (localStorage), con Esporta/Importa JSON.
- **compare.js**: funzioni pure → storico prezzi, media/totale per negozio, alert
  variazioni, delta nel dettaglio, **confronto stesso prodotto tra negozi** ("Dove conviene").

## 5. Modello dati (localStorage)

Chiave `scontrini_v1` → array di scontrini:
```
{
  id:     string            // generato localmente
  store:  string            // "Esselunga"
  date:   string (YYYY-MM-DD)
  items:  [ { name, qty, price } ]   // price = totale riga in €
  total:  number
  createdAt, updatedAt: number
}
```
Impostazioni in `scontrini_settings_v1` (es. chiave Gemini opzionale).

## 6. Limiti noti & possibili evoluzioni
- L'OCR on-device va corretto a mano sugli scontrini peggiori → mitigato dalla
  schermata di revisione e dal motore Gemini opzionale.
- Matching prodotti basato su nome normalizzato (può unire/separare voci simili)
  → migliorabile con codici EAN o un dizionario sinonimi.
- Possibili estensioni: budget mensile, categorie merceologiche, grafici avanzati,
  lista della spesa suggerita, confronto prezzo dello stesso prodotto tra negozi.

## 7. Prompt riutilizzabile (per rigenerare l'app)

> "Crea una PWA in HTML/CSS/JS (senza Python) per gestire gli scontrini della
> spesa: cattura foto da fotocamera, OCR con Tesseract.js on-device (più opzione
> Gemini Flash con chiave inserita dall'utente), parser per scontrini italiani che
> estrae supermercato, data, righe prodotto/prezzo e totale, schermata di revisione
> manuale, salvataggio su Firebase Firestore con Auth Google (regole per-utente) e
> fallback su localStorage, e una sezione di analisi con storico prezzi per
> prodotto, confronto spesa per supermercato e alert sulle variazioni di prezzo.
> Mobile-first, installabile, offline. Non hardcodare chiavi segrete dello
> sviluppatore; la config Firebase è un segnaposto da compilare."
```
