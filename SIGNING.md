# 🔑 Firma fissa dell'APK (aggiornamenti senza disinstallare)

Di default ogni build in cloud firmava l'APK con una chiave diversa → Android non
permetteva di aggiornare "sopra" il vecchio (serviva disinstallare). Con una **chiave
di firma stabile**, tutti gli APK hanno la stessa firma → gli aggiornamenti si
installano sopra e **non perdi i dati**.

## Si fa una volta sola (3 passi, ~3 minuti)

1. **Genera la chiave**: sul repository GitHub → scheda **Actions** →
   a sinistra **"Genera chiave di firma (una volta sola)"** → pulsante **Run workflow** → **Run**.
   Attendi il ✅ (poche decine di secondi).

2. **Scarica e copia**: apri quel job → in fondo **Artifacts** → scarica **`keystore-b64`**
   (è uno .zip) → aprilo → apri il file `keystore.b64` con Blocco note → **seleziona tutto e copia**.

3. **Salva il segreto**: sul repository → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**:
   - **Name:** `KEYSTORE_B64`
   - **Secret:** incolla il contenuto copiato → **Add secret**

Fatto. Da ora ogni build (`git push`) produce un **APK release firmato** con la stessa
chiave.

## Importante: l'ultimo cambio di firma
Il passaggio dall'attuale APK (debug) al nuovo (release firmato) cambia la firma **una
volta**: quindi quella volta lì devi ancora **disinstallare e reinstallare**. Da lì in
poi, gli aggiornamenti si installano sopra senza disinstallare.

> Prima di reinstallare, se hai dati di prova importanti, esporta il backup
> (Impostazioni → 📤). Dopo l'aggiornamento li reimporti.

## Note
- La password della chiave è `spesasmart` (impostata nei workflow). Per il futuro
  Play Store si userà una chiave/password più protette (tramite secrets dedicati).
- Se NON imposti il secret `KEYSTORE_B64`, la build continua a fare l'APK debug come prima.
