# ☁️ Creare l'APK nel cloud (senza installare nulla sul PC)

Il progetto è già pronto: c'è una procedura automatica (GitHub Actions) che compila
l'APK su un computer di GitHub. Tu devi solo metterlo online e scaricare il risultato.

> Hai bisogno di un **account GitHub** (gratuito): <https://github.com/signup>
> Git è già installato sul tuo PC.

---

## Passo 1 — Crea un repository vuoto su GitHub
1. Vai su <https://github.com/new>
2. **Repository name:** `spesa-smart` (o quello che vuoi)
3. Lascia **vuoto** il resto (NON aggiungere README, .gitignore o licenza)
4. Clicca **Create repository**
5. Copia l'indirizzo che ti mostra, tipo:
   `https://github.com/TUO-NOME/spesa-smart.git`

## Passo 2 — Carica il progetto (dal tuo PC)
Apri **PowerShell** nella cartella `app scontrini` ed esegui (sostituendo l'URL col tuo):

```powershell
git remote add origin https://github.com/TUO-NOME/spesa-smart.git
git push -u origin main
```

Al primo `push` si apre il **browser** per accedere a GitHub: fai il login e autorizza.
(È il modo normale: non serve creare password o token a mano.)

## Passo 3 — Aspetta la compilazione
1. Sul sito del tuo repository apri la scheda **Actions**.
2. Vedrai il job **"Build APK"** in corso (pallino giallo). Dura ~5–10 minuti.
3. Quando diventa **verde** ✅, clicca sul job.

## Passo 4 — Scarica l'APK
1. In fondo alla pagina del job, sezione **Artifacts**, trovi **`SpesaSmart-APK`**.
2. Cliccaci: scarichi un file **.zip**.
3. Aprilo: dentro c'è **`app-debug.apk`**.

## Passo 5 — Installa sul telefono
1. Manda `app-debug.apk` al telefono (email, Google Drive, WhatsApp a te stesso, cavo USB…).
2. Sul telefono aprilo e conferma **"Installa app da origine sconosciuta"**
   (Android lo chiede per le app fuori dal Play Store: è normale per i test).
3. Apri **Spesa Smart** e provala. 🎉

---

## Aggiornare l'app in futuro
Ogni volta che cambi qualcosa, dal PC:
```powershell
git add -A
git commit -m "modifiche"
git push
```
Parte una nuova build automatica → scarichi il nuovo APK dalla scheda **Actions**.

## Note
- Questa prima build usa l'OCR **Tesseract incluso** (funziona offline). Dopo che
  confermi che l'APK gira bene, si aggiunge **ML Kit** per una lettura più precisa.
- L'APK è "di debug": perfetto per i test e per installarlo a mano. Per pubblicarlo
  sul Play Store servirà più avanti una versione "firmata di release".
- Se la build fallisse (job rosso), aprila e copiami il messaggio d'errore: la sistemo.
