# 📦 Creare l'APK (app installabile su Android)

L'app è già pronta come progetto **Capacitor**: i file web stanno in `www/` e
vengono impacchettati **dentro** l'APK. Risultato: app **offline**, con i
**dati salvati solo sul telefono** (nessun cloud, nessun account).

Devi installare due cose **una volta sola**, poi bastano pochi comandi.

---

## 1. Cosa installare (una volta)

1. **Node.js LTS** → <https://nodejs.org> (scarica "LTS", installa con le opzioni di default).
2. **Android Studio** → <https://developer.android.com/studio>
   - All'avvio lascia che scarichi l'**Android SDK** proposto.
   - Android Studio include già **JDK** e **Gradle**: non serve installarli a parte.

> Verifica veloce (apri **PowerShell**):
> ```powershell
> node -v
> ```
> Deve stampare un numero di versione (es. v20.x).

---

## 2. Comandi per creare l'APK

Apri **PowerShell** nella cartella del progetto (`app scontrini`) ed esegui in ordine:

```powershell
npm install            # scarica Capacitor
npm run setup          # (facoltativo) bundla Tesseract per il ripiego web/offline
npx cap init "Spesa Smart" com.spesasmart.scontrini --web-dir=www   # solo la 1ª volta

# OCR on-device ML Kit (gratis, offline, nessuna chiave): installa UN plugin
npm install @capacitor-community/image-to-text
# (alternative equivalenti: @pantrist/capacitor-plugin-ml-kit-text-recognition
#  oppure @jcesarmobile/capacitor-ocr — l'app rileva il plugin in automatico)

npm run add:android    # crea la cartella android/ (solo la 1ª volta)
npm run sync           # copia i file web + plugin dentro il progetto Android
npm run apk            # compila l'APK
```

> **OCR:** dentro l'APK l'app usa **ML Kit on-device** (preciso, offline, senza
> configurazione). Nel browser/PWA usa Tesseract come ripiego. L'utente non deve
> impostare nulla. Se il plugin esponesse un nome/metodo diverso, si regola in un
> solo punto: l'elenco `candidates` in [`www/js/ocr.js`](www/js/ocr.js).

L'APK finito sarà qui:

```
android\app\build\outputs\apk\debug\app-debug.apk
```

> Dopo ogni modifica ai file in `www/`, ti basta ripetere:
> `npm run sync` e poi `npm run apk`.

---

## 3. Installare l'APK sul telefono

**Opzione A – via cavo USB (consigliata)**
1. Sul telefono: *Impostazioni → Info → tocca 7 volte "Numero build"* per attivare le *Opzioni sviluppatore*, poi abilita **Debug USB**.
2. Collega il telefono al PC e, nella cartella del progetto:
   ```powershell
   npm run sync
   cd android
   .\gradlew.bat installDebug
   ```
   L'app comparirà tra le app del telefono.

**Opzione B – copiando il file**
1. Copia `app-debug.apk` sul telefono (cavo, email, Google Drive…).
2. Sul telefono aprilo e conferma **"Installa app da origine sconosciuta"**.

---

## 4. Note utili

- **Funziona offline?** Sì. L'OCR ML Kit è on-device (il modello si scarica una volta
  all'installazione), quindi la lettura non richiede internet. I dati restano sempre
  solo sul telefono.
- **Fotocamera**: l'app usa la fotocamera di sistema tramite il pulsante ＋.
  Al primo utilizzo Android chiede il permesso: conferma.
- **Backup / cambio telefono**: in *Impostazioni → Esporta / trasferisci dati* puoi
  **Copiare**, **Condividere** o **Scaricare** tutti i dati. Sull'altro telefono usa
  *Impostazioni → Importa dati* (incolla il testo o scegli il file) per riavere tutto.
- **APK firmato per distribuzione** (Play Store o installazione "pulita"): serve un
  *keystore* e `assembleRelease`. Per uso personale l'APK di **debug** sopra è sufficiente.
- **Errori di build**: quasi sempre dipendono da Android Studio/SDK non completi.
  Apri il progetto una volta con `npm run open:android`, lascia che Android Studio
  finisca i download, poi riprova `npm run apk`.

---

## 5. Provare l'app sul PC prima di impacchettarla

```powershell
npx serve www
```
Apri l'indirizzo mostrato (es. `http://localhost:3000`). In questa modalità l'OCR,
se non hai ancora fatto `npm run setup`, viene scaricato dalla CDN al primo utilizzo;
nell'APK invece è tutto incluso.
