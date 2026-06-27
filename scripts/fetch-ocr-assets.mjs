// ============================================================================
//  Prepara l'OCR per funzionare OFFLINE dentro l'app.
//  Copia i file di Tesseract.js (libreria, worker, core wasm) e scarica il
//  modello lingua italiana in  www/vendor/  così l'APK NON ha bisogno di
//  internet per leggere gli scontrini.
//
//  Uso:  npm install   &&   npm run setup
//  (richiede Node 18+, che ha fetch integrato)
// ============================================================================

import { mkdir, copyFile, readdir, writeFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendor = join(root, "www", "vendor");
const langDir = join(vendor, "lang");
const nm = join(root, "node_modules");

async function main() {
  await mkdir(vendor, { recursive: true });
  await mkdir(langDir, { recursive: true });

  // 1) libreria + worker di tesseract.js
  const dist = join(nm, "tesseract.js", "dist");
  await must(copyOne(join(dist, "tesseract.min.js"), join(vendor, "tesseract.min.js")), "tesseract.min.js");
  await must(copyOne(join(dist, "worker.min.js"), join(vendor, "worker.min.js")), "worker.min.js");

  // 2) core WebAssembly (tutti i .wasm e .wasm.js)
  const core = join(nm, "tesseract.js-core");
  if (existsSync(core)) {
    const files = await readdir(core);
    let n = 0;
    for (const f of files) {
      if (f.endsWith(".wasm") || f.endsWith(".wasm.js")) {
        await copyFile(join(core, f), join(vendor, f));
        n++;
      }
    }
    console.log(`✔ core wasm copiati: ${n} file`);
  } else {
    console.warn("⚠ pacchetto tesseract.js-core non trovato: esegui prima 'npm install'");
  }

  // 3) modello lingua italiana (gz già pronto per tesseract.js)
  const langUrl = "https://tessdata.projectnaptha.com/4.0.0_fast/ita.traineddata.gz";
  const langOut = join(langDir, "ita.traineddata.gz");
  if (existsSync(langOut)) {
    console.log("✔ ita.traineddata.gz già presente");
  } else {
    process.stdout.write("↓ scarico modello lingua italiana… ");
    const res = await fetch(langUrl);
    if (!res.ok) throw new Error("download lingua fallito: HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(langOut, buf);
    console.log(`fatto (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
  }

  console.log("\n✅ OCR offline pronto in www/vendor/. Ora puoi sincronizzare e creare l'APK.");
}

async function copyOne(src, dst) {
  await access(src);
  await copyFile(src, dst);
  return true;
}
async function must(p, name) {
  try { await p; console.log("✔ " + name); }
  catch { console.warn(`⚠ ${name} non trovato in node_modules (esegui 'npm install').`); }
}

main().catch((e) => { console.error("\n❌ Errore:", e.message); process.exit(1); });
