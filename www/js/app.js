// ============================================================================
//  APP  –  controller principale dell'interfaccia
// ============================================================================

import * as store from "./store.js";
import { readReceipt } from "./ocr.js";
import { colorFor, fmtPrice, STORES, parsePrice, CATEGORIES } from "./parser.js";
import * as analytics from "./compare.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let receipts = [];          // cache locale degli scontrini
let draft = null;           // scontrino in revisione
let detailId = null;        // scontrino aperto nel dettaglio

// ---------------------------------------------------------------------------
//  Categorie (predefinite + personalizzate dall'utente)
// ---------------------------------------------------------------------------
function customCats() {
  return store.getSettings().customCategories || [];
}
function allCats() {
  return [...CATEGORIES, ...customCats()];
}
function emojiFor(type) {
  const c = allCats().find((c) => c.label === type);
  return c ? c.emoji : "🏬";
}

// ---------------------------------------------------------------------------
//  Avvio
// ---------------------------------------------------------------------------
init();

async function init() {
  registerSW();
  bindUI();

  await store.initStore();

  store.onChange(refresh);
  await refresh();

  // promemoria backup: registra la prima installazione e imposta la frequenza
  if (!store.getSettings().installAt) store.saveSettings({ installAt: Date.now() });
  const sel = $("#backupReminder");
  sel.value = store.getSettings().backupReminder || "monthly";
  sel.onchange = () => {
    store.saveSettings({ backupReminder: sel.value });
    updateBackupInfo();
    checkBackupReminder();
  };
  updateBackupInfo();
  checkBackupReminder();
  renderCustomCats();
}

// ---------------------------------------------------------------------------
//  Caricamento dati + render viste
// ---------------------------------------------------------------------------
async function refresh() {
  receipts = await store.getReceipts();
  renderHome();
  renderAnalytics();
  populateStoreLists();
  checkBackupReminder();
}

// ============================ PROMEMORIA BACKUP ============================
const DAY_MS = 86400000;

function reminderIntervalMs() {
  const f = store.getSettings().backupReminder || "monthly";
  if (f === "weekly") return 7 * DAY_MS;
  if (f === "monthly") return 30 * DAY_MS;
  return 0; // "never"
}

function hasChangesSinceBackup() {
  const last = store.getSettings().lastBackupAt || 0;
  return receipts.some((r) => (r.updatedAt || 0) > last);
}

function checkBackupReminder() {
  const banner = $("#backupBanner");
  if (!banner) return;
  const s = store.getSettings();
  const interval = reminderIntervalMs();
  const now = Date.now();
  const base = s.lastBackupAt || s.installAt || now;
  const snoozed = s.snoozeUntil && now < s.snoozeUntil;
  const due = interval > 0 && receipts.length > 0 && hasChangesSinceBackup()
    && (now - base) >= interval && !snoozed;
  if (due) {
    $("#backupBannerText").textContent = s.lastBackupAt
      ? "⏰ È passato un po' dall'ultimo backup. Esporta i tuoi dati."
      : "⏰ Non hai mai fatto un backup: salva i tuoi dati!";
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

function markBackupDone() {
  store.saveSettings({ lastBackupAt: Date.now(), snoozeUntil: 0 });
  updateBackupInfo();
  checkBackupReminder();
}

function updateBackupInfo() {
  const el = $("#lastBackupInfo");
  if (!el) return;
  const last = store.getSettings().lastBackupAt;
  el.textContent = last
    ? "Ultimo backup: " + new Date(last).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })
    : "Nessun backup ancora effettuato.";
}

// ============================ CATEGORIE PERSONALIZZATE =====================
function renderCustomCats() {
  const box = $("#customCatList");
  if (!box) return;
  const custom = customCats();
  const builtin = CATEGORIES.map((c) =>
    `<span class="cat-chip builtin" title="Categoria predefinita">${c.emoji} ${esc(c.label)}</span>`).join("");
  const mine = custom.map((c, i) =>
    `<span class="cat-chip">${c.emoji} ${esc(c.label)}<button class="del" data-i="${i}" title="Rimuovi">✕</button></span>`).join("");
  box.innerHTML = builtin + mine;
  box.querySelectorAll(".del").forEach((b) => {
    b.onclick = () => removeCustomCat(+b.dataset.i);
  });
}

function addCustomCat() {
  const label = $("#newCatLabel").value.trim();
  let emoji = $("#newCatEmoji").value.trim();
  if (!label) { toast("Scrivi il nome della categoria"); return; }
  if (allCats().some((c) => c.label.toLowerCase() === label.toLowerCase())) {
    toast("Categoria già esistente"); return;
  }
  if (!emoji) emoji = "🏪";
  const custom = [...customCats(), { label, emoji }];
  store.saveSettings({ customCategories: custom });
  $("#newCatLabel").value = "";
  $("#newCatEmoji").value = "";
  renderCustomCats();
  toast("Categoria aggiunta ✓");
}

function removeCustomCat(i) {
  const custom = customCats().slice();
  const removed = custom.splice(i, 1)[0];
  store.saveSettings({ customCategories: custom });
  renderCustomCats();
  if (removed) toast(`Rimossa "${removed.label}"`);
}

// ============================ HOME =========================================
function renderHome() {
  // summary
  const sum = analytics.summary(receipts);
  $("#summaryCards").innerHTML = `
    <div class="scard"><div class="big">${sum.count}</div><div class="lbl">scontrini</div></div>
    <div class="scard"><div class="big">€${fmtPrice(sum.thisMonth)}</div><div class="lbl">questo mese</div></div>
    <div class="scard"><div class="big">€${fmtPrice(sum.total)}</div><div class="lbl">totale</div></div>`;

  // filtri (tipo + negozio)
  const fStore = $("#filterStore").value;
  const fType = $("#filterType").value;
  const list = receipts.filter((r) =>
    (!fStore || r.store === fStore) && (!fType || (r.type || "Altro") === fType));

  const ul = $("#receiptList");
  ul.innerHTML = "";
  $("#emptyState").classList.toggle("hidden", receipts.length > 0);

  for (const r of list) {
    const li = document.createElement("li");
    li.className = "receipt-item";
    const initials = (r.store || "?").slice(0, 2).toUpperCase();
    const type = r.type || "Altro";
    li.innerHTML = `
      <div class="receipt-item__icon" style="background:${colorFor(r.store)}">${initials}</div>
      <div class="receipt-item__main">
        <div class="receipt-item__store">${esc(r.store || "Sconosciuto")}</div>
        <div class="receipt-item__meta">${emojiFor(type)} ${esc(type)} · ${fmtDate(r.date)} · ${(r.items || []).length} art.</div>
      </div>
      <div class="receipt-item__total">€${fmtPrice(r.total)}</div>`;
    li.onclick = () => openDetail(r.id);
    ul.appendChild(li);
  }
}

function populateStoreLists() {
  const stores = [...new Set(receipts.map((r) => r.store).filter(Boolean))].sort();
  const sel = $("#filterStore");
  const cur = sel.value;
  sel.innerHTML = '<option value="">Tutti i negozi</option>' +
    stores.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  sel.value = cur;

  // filtro per tipo (solo i tipi effettivamente presenti)
  const types = [...new Set(receipts.map((r) => r.type || "Altro"))]
    .sort((a, b) => CATEGORIES.findIndex((c) => c.label === a) - CATEGORIES.findIndex((c) => c.label === b));
  const tSel = $("#filterType");
  const tCur = tSel.value;
  tSel.innerHTML = '<option value="">Tutti i tipi</option>' +
    types.map((t) => `<option value="${esc(t)}">${emojiFor(t)} ${esc(t)}</option>`).join("");
  tSel.value = tCur;

  // datalist per la revisione (catene note + già usate)
  const all = [...new Set([...STORES.map((s) => s.name), ...stores])].sort();
  $("#storeList").innerHTML = all.map((s) => `<option value="${esc(s)}">`).join("");
}

// ============================ ANALISI ======================================
function renderAnalytics() {
  // spesa per categoria/tipo
  const bt = analytics.byType(receipts);
  const maxT = Math.max(1, ...bt.map((b) => b.total));
  $("#typeCompare").innerHTML = bt.length
    ? bt.map((b) => `
      <div class="bar-row">
        <span class="bar-label">${emojiFor(b.type)} ${esc(b.type)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(b.total / maxT) * 100}%"></span></span>
        <span class="bar-val">€${fmtPrice(b.total)}</span>
      </div>
      <div class="muted" style="margin:-2px 0 8px 0;font-size:12px">${b.count} scontrini · media €${fmtPrice(b.avg)}</div>`).join("")
    : '<p class="muted">Aggiungi qualche scontrino per vedere la ripartizione.</p>';

  // confronto negozi
  const bs = analytics.byStore(receipts);
  const max = Math.max(1, ...bs.map((b) => b.total));
  $("#storeCompare").innerHTML = bs.length
    ? bs.map((b) => `
      <div class="bar-row">
        <span class="bar-label">${esc(b.store)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(b.total / max) * 100}%;background:${colorFor(b.store)}"></span></span>
        <span class="bar-val">€${fmtPrice(b.total)}</span>
      </div>
      <div class="muted" style="margin:-2px 0 8px 0;font-size:12px">${b.count} scontrini · media €${fmtPrice(b.avg)}</div>`).join("")
    : '<p class="muted">Aggiungi qualche scontrino per vedere il confronto.</p>';

  // alert variazioni
  const alerts = analytics.priceAlerts(receipts);
  $("#priceAlerts").innerHTML = alerts.length
    ? alerts.slice(0, 12).map((a) => {
        const up = a.diff > 0;
        return `<div class="alert-item">
          <div><b>${esc(a.name)}</b><div class="muted" style="font-size:12px">${esc(a.store)} · ${fmtDate(a.date)}</div></div>
          <div class="${up ? "delta-up" : "delta-down"}">${up ? "▲" : "▼"} ${a.pct > 0 ? "+" : ""}${a.pct}%<div class="muted" style="font-size:12px">€${fmtPrice(a.from)}→€${fmtPrice(a.to)}</div></div>
        </div>`;
      }).join("")
    : '<p class="muted">Servono almeno 2 acquisti dello stesso prodotto per rilevare variazioni.</p>';
}

// ricerca prodotto + andamento
function onProductSearch() {
  const q = $("#productSearch").value.trim();
  const sugg = $("#productSuggestions");
  if (q.length < 2) { sugg.innerHTML = ""; $("#priceHistory").innerHTML = ""; return; }
  const prods = analytics.allProducts(receipts)
    .filter((p) => p.label.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 6);
  sugg.innerHTML = prods.map((p) => `<li data-p="${esc(p.label)}">${esc(p.label)} <span class="muted">(${p.count})</span></li>`).join("");
  sugg.querySelectorAll("li").forEach((li) => {
    li.onclick = () => { $("#productSearch").value = li.dataset.p; sugg.innerHTML = ""; showHistory(li.dataset.p); };
  });
  showHistory(q);
}

function showHistory(product) {
  const hist = analytics.priceHistory(receipts, product);
  const box = $("#priceHistory");
  if (!hist.length) { box.innerHTML = '<p class="muted">Nessun dato per questo prodotto.</p>'; return; }
  const prices = hist.map((h) => h.unit);
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = max - min || 1;
  const first = hist[0].unit, last = hist[hist.length - 1].unit;
  const trend = last - first;

  // confronto dello stesso prodotto tra supermercati diversi
  const stores = analytics.productByStore(receipts, product);
  let storeCard = "";
  if (stores.length >= 2) {
    storeCard = `
      <div class="card">
        <div class="row-between">
          <b>Dove conviene</b>
          <span class="delta-down">risparmi fino a €${fmtPrice(stores.maxSaving)}</span>
        </div>
        ${stores.map((s) => `
          <div class="detail-line">
            <span class="name">
              <span class="store-dot" style="background:${colorFor(s.store)}"></span>${esc(s.store)}
              ${s.isCheapest ? '<span class="best-badge">più conveniente</span>' : ""}
              <span class="muted" style="font-size:11px"> · ${s.count} acq. · media €${fmtPrice(s.avg)}</span>
            </span>
            <span class="price">€${fmtPrice(s.last)}
              ${s.isCheapest ? "" : `<span class="delta-up" style="font-size:12px"> +${s.pctVsCheapest}%</span>`}
            </span>
          </div>`).join("")}
        <p class="muted" style="font-size:12px;margin-top:8px">Confronto sull'ultimo prezzo unitario rilevato in ogni negozio.</p>
      </div>`;
  } else if (stores.length === 1) {
    storeCard = `<div class="card"><b>Dove conviene</b><p class="muted">Hai comprato questo prodotto solo da <b>${esc(stores[0].store)}</b>. Comparalo acquistandolo anche altrove.</p></div>`;
  }

  box.innerHTML = `
    <div class="card">
      <div class="row-between">
        <b>${esc(product)}</b>
        <span class="${trend > 0 ? "delta-up" : trend < 0 ? "delta-down" : "delta-flat"}">
          ${trend > 0 ? "▲" : trend < 0 ? "▼" : "▬"} €${fmtPrice(Math.abs(trend))}
        </span>
      </div>
      <div class="spark">
        ${hist.map((h) => `<div title="${fmtDate(h.date)} · €${fmtPrice(h.unit)} (${esc(h.store)})" style="height:${((h.unit - min) / range) * 100}%"></div>`).join("")}
      </div>
      <div class="muted" style="font-size:12px">min €${fmtPrice(min)} · max €${fmtPrice(max)} · ${hist.length} acquisti</div>
      ${hist.slice(-5).reverse().map((h) => `<div class="detail-line"><span class="name">${fmtDate(h.date)} · ${esc(h.store)}</span><span class="price">€${fmtPrice(h.unit)}</span></div>`).join("")}
    </div>
    ${storeCard}`;
}

// ============================ SCANSIONE ====================================
async function handleScan(file) {
  if (!file) return;
  showLoader("Lettura scontrino…");
  try {
    const parsed = await readReceipt(file, {}, (p) => {
      $("#progressBar").style.width = Math.round(p * 100) + "%";
      $("#loaderText").textContent = p < 1 ? "Lettura scontrino… " + Math.round(p * 100) + "%" : "Analisi…";
    });
    hideLoader();
    draft = { ...parsed };
    openReview(draft);
  } catch (e) {
    hideLoader();
    // Diagnostica visibile + inserimento manuale (l'app non resta mai bloccata)
    const d = e.diag
      ? `\n\n— Diagnostica —\nNativo: ${e.diag.native}\nPlugin: ${e.diag.plugins}\n${(e.diag.steps || []).join("\n")}`
      : "\n" + (e && e.message);
    alert("Lettura automatica non riuscita: inserisci i dati a mano." + d);
    draft = { store: "", type: "Altro", date: new Date().toISOString().slice(0, 10), items: [], total: 0 };
    openReview(draft);
  }
}

// ============================ REVISIONE ====================================
function ensureTypeOptions() {
  // ricostruisce ogni volta: le categorie personalizzate possono essere cambiate
  $("#rType").innerHTML = allCats()
    .map((c) => `<option value="${esc(c.label)}">${c.emoji} ${esc(c.label)}</option>`).join("");
}

function openReview(rec) {
  ensureTypeOptions();
  $("#rStore").value = rec.store || "";
  $("#rType").value = rec.type || "Altro";
  $("#rDate").value = rec.date || new Date().toISOString().slice(0, 10);
  $("#rTotal").value = fmtPrice(rec.total);
  renderItemsEditor(rec.items || []);
  updateSumHint();
  $("#reviewModal").classList.remove("hidden");
}

function renderItemsEditor(items) {
  const box = $("#itemsEditor");
  box.innerHTML = "";
  items.forEach((it, i) => box.appendChild(itemRow(it, i)));
}

function itemRow(it = { name: "", qty: 1, price: 0 }) {
  const div = document.createElement("div");
  div.className = "item-edit";
  div.innerHTML = `
    <input class="ie-name" type="text" placeholder="Prodotto" value="${esc(it.name)}" />
    <input class="ie-price" type="text" inputmode="decimal" placeholder="0,00" value="${it.price ? fmtPrice(it.price) : ""}" />
    <button class="del" title="Rimuovi">✕</button>`;
  div.querySelector(".del").onclick = () => { div.remove(); updateSumHint(); };
  div.querySelector(".ie-price").oninput = updateSumHint;
  return div;
}

function collectItems() {
  return $$("#itemsEditor .item-edit").map((row) => ({
    name: row.querySelector(".ie-name").value.trim(),
    qty: 1,
    price: parsePrice(row.querySelector(".ie-price").value) || 0,
  })).filter((it) => it.name || it.price);
}

function updateSumHint() {
  const sum = collectItems().reduce((s, it) => s + it.price, 0);
  const total = parsePrice($("#rTotal").value) || 0;
  const diff = Math.abs(sum - total);
  $("#sumHint").textContent = diff > 0.05 && total > 0
    ? `⚠️ Somma articoli €${fmtPrice(sum)} ≠ totale €${fmtPrice(total)}`
    : `Somma articoli: €${fmtPrice(sum)}`;
}

async function doSaveReceipt() {
  const rec = {
    ...(draft && draft.id ? { id: draft.id } : {}),
    store: $("#rStore").value.trim() || "Sconosciuto",
    type: $("#rType").value || "Altro",
    date: $("#rDate").value || new Date().toISOString().slice(0, 10),
    items: collectItems(),
    total: parsePrice($("#rTotal").value) || 0,
    createdAt: (draft && draft.createdAt) || Date.now(),
  };
  showLoader("Salvataggio…");
  try {
    await store.saveReceipt(rec);
    hideLoader();
    $("#reviewModal").classList.add("hidden");
    draft = null;
    toast("Scontrino salvato ✓");
    switchView("home");
  } catch (e) {
    hideLoader();
    toast("Errore salvataggio: " + e.message);
  }
}

// ============================ DETTAGLIO ====================================
function openDetail(id) {
  const r = receipts.find((x) => x.id === id);
  if (!r) return;
  detailId = id;
  $("#dTitle").textContent = r.store || "Scontrino";
  const compared = analytics.compareReceipt(r, receipts);
  const type = r.type || "Altro";
  $("#detailBody").innerHTML = `
    <p class="muted">${emojiFor(type)} ${esc(type)} · ${fmtDate(r.date)}</p>
    ${compared.map((it) => `
      <div class="detail-line">
        <span class="name">${esc(it.name)}${it.qty > 1 ? ` <span class="muted">×${it.qty}</span>` : ""}</span>
        <span class="price">€${fmtPrice(it.price)}
          ${it.delta ? `<span class="${it.delta.abs > 0 ? "delta-up" : it.delta.abs < 0 ? "delta-down" : "delta-flat"}" style="font-size:12px"> ${it.delta.abs > 0 ? "+" : ""}${it.delta.pct}%</span>` : ""}
        </span>
      </div>`).join("")}
    <div class="detail-total"><span>Totale</span><span>€${fmtPrice(r.total)}</span></div>`;
  $("#detailModal").classList.remove("hidden");
}

function editFromDetail() {
  const r = receipts.find((x) => x.id === detailId);
  if (!r) return;
  $("#detailModal").classList.add("hidden");
  draft = { ...r };
  openReview(draft);
}

async function deleteFromDetail() {
  if (!detailId) return;
  if (!confirm("Eliminare questo scontrino?")) return;
  await store.deleteReceipt(detailId);
  $("#detailModal").classList.add("hidden");
  detailId = null;
  toast("Eliminato");
}

// ============================ UI binding ===================================
function bindUI() {
  // navigazione tab
  $$(".tab").forEach((t) => t.onclick = () => switchView(t.dataset.view));

  // scansione
  $("#fabScan").onclick = () => $("#cameraInput").click();
  $("#cameraInput").onchange = (e) => { handleScan(e.target.files[0]); e.target.value = ""; };

  // filtri
  $("#filterStore").onchange = renderHome;
  $("#filterType").onchange = renderHome;

  // revisione
  $("#closeReview").onclick = () => { $("#reviewModal").classList.add("hidden"); draft = null; };
  $("#addItem").onclick = () => { $("#itemsEditor").appendChild(itemRow()); };
  $("#rTotal").oninput = updateSumHint;
  $("#saveReceipt").onclick = doSaveReceipt;

  // dettaglio
  $("#closeDetail").onclick = () => $("#detailModal").classList.add("hidden");
  $("#editReceipt").onclick = editFromDetail;
  $("#deleteReceipt").onclick = deleteFromDetail;

  // analisi
  $("#productSearch").oninput = onProductSearch;

  // impostazioni
  $("#btnAddCat").onclick = addCustomCat;
  $("#newCatLabel").onkeydown = (e) => { if (e.key === "Enter") addCustomCat(); };
  bindTransfer();
}

// ============================ TRASFERIMENTO DATI ===========================
function fileName() {
  return `scontrini-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

function bindTransfer() {
  // --- PROMEMORIA BACKUP (banner) ---
  $("#bannerExport").onclick = openExport;
  $("#bannerLater").onclick = () => {
    store.saveSettings({ snoozeUntil: Date.now() + 3 * DAY_MS });
    $("#backupBanner").classList.add("hidden");
  };

  // --- ESPORTA / TRASFERISCI ---
  $("#btnExport").onclick = openExport;
  $("#closeExport").onclick = () => $("#exportModal").classList.add("hidden");

  $("#btnShare").classList.toggle("hidden", !navigator.share); // mostra solo se supportato

  $("#btnCopy").onclick = async () => {
    const text = $("#exportText").value;
    try {
      await navigator.clipboard.writeText(text);
      toast("Copiato negli appunti ✓");
      markBackupDone();
    } catch {
      // fallback: seleziona il testo perché l'utente copi a mano
      const ta = $("#exportText");
      ta.focus(); ta.select();
      try { document.execCommand("copy"); toast("Copiato ✓"); markBackupDone(); }
      catch { toast("Seleziona il testo e copialo a mano"); }
    }
  };

  $("#btnShare").onclick = async () => {
    const text = $("#exportText").value;
    try {
      // prova a condividere come FILE (più comodo per il trasferimento)
      const file = new File([text], fileName(), { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Backup scontrini" });
      } else {
        await navigator.share({ title: "Backup scontrini", text });
      }
      markBackupDone();
    } catch (e) {
      if (e && e.name !== "AbortError") toast("Condivisione non disponibile");
    }
  };

  $("#btnDownload").onclick = () => {
    const blob = new Blob([$("#exportText").value], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    markBackupDone();
  };

  // --- IMPORTA ---
  $("#btnImport").onclick = openImport;
  $("#closeImport").onclick = () => $("#importModal").classList.add("hidden");
  $("#btnPickFile").onclick = () => $("#importFile").click();
  $("#importFile").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $("#importText").value = await file.text();
    e.target.value = "";
    toast("File caricato, premi Importa");
  };
  $("#btnDoImport").onclick = doImport;
}

async function openExport() {
  const text = await store.exportAll();
  const n = receipts.length;
  $("#exportInfo").innerHTML = `Hai <b>${n}</b> scontrin${n === 1 ? "o" : "i"} da trasferire.`;
  $("#exportText").value = text;
  $("#exportModal").classList.remove("hidden");
}

function openImport() {
  $("#importText").value = "";
  const repl = document.querySelector('input[name="impMode"][value="replace"]');
  if (repl) repl.checked = true;
  $("#importModal").classList.remove("hidden");
}

async function doImport() {
  const text = $("#importText").value.trim();
  if (!text) { toast("Incolla il testo o scegli un file"); return; }
  const mode = document.querySelector('input[name="impMode"]:checked')?.value || "replace";
  if (mode === "replace" && receipts.length &&
      !confirm("Sostituire TUTTI i dati attuali con quelli importati?")) return;
  try {
    const res = await store.importAll(text, { mode });
    $("#importModal").classList.add("hidden");
    toast(mode === "replace"
      ? `Importati ${res.total} scontrini ✓`
      : `Aggiunti ${res.added} scontrini (totale ${res.total}) ✓`);
    switchView("home");
  } catch (e) {
    toast("Dati non validi: " + e.message);
  }
}

function switchView(name) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  $("#view-" + name).classList.add("active");
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  window.scrollTo(0, 0);
}

// ============================ utility ======================================
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}
function showLoader(text) {
  $("#loaderText").textContent = text;
  $("#progressBar").style.width = "0%";
  $("#loader").classList.remove("hidden");
}
function hideLoader() { $("#loader").classList.add("hidden"); }
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2800);
}

function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
