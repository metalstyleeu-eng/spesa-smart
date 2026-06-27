// ============================================================================
//  Compila l'APK di debug richiamando Gradle nel progetto android/.
//  Uso:  npm run apk     (dopo: npm install, npm run setup, npm run add:android, npm run sync)
//  L'APK risultante:  android/app/build/outputs/apk/debug/app-debug.apk
// ============================================================================

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const android = join(root, "android");

if (!existsSync(android)) {
  console.error("❌ Cartella android/ assente. Esegui prima:  npm run add:android  &&  npm run sync");
  process.exit(1);
}

const isWin = process.platform === "win32";
const gradlew = join(android, isWin ? "gradlew.bat" : "gradlew");
const cmd = isWin ? gradlew : "./gradlew";

console.log("🔨 Compilo l'APK di debug…");
const r = spawnSync(cmd, ["assembleDebug"], { cwd: android, stdio: "inherit", shell: isWin });
if (r.status !== 0) {
  console.error("\n❌ Build fallita. Verifica di avere installato Android Studio (JDK + SDK).");
  process.exit(r.status || 1);
}
console.log("\n✅ APK creato: android/app/build/outputs/apk/debug/app-debug.apk");
console.log("   Copialo sul telefono e installalo (abilita 'Origini sconosciute').");
