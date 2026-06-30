// ============================================================================
//  MINI-SERVER per la lettura AI degli scontrini (Cloudflare Worker)
//  - Riceve dall'app una foto (base64), la manda a Google Gemini con un prompt
//    che estrae negozio/tipo/data/prodotti/prezzi, e rimanda indietro il JSON.
//  - La chiave Gemini sta SOLO qui (lato server), mai nell'app. Una chiave per
//    tutti gli utenti. La foto NON viene salvata.
//
//  Deploy: vedi DEPLOY-SERVER.md
//  Variabili d'ambiente (Settings → Variables del Worker):
//    GEMINI_API_KEY  (obbligatoria)  -> la tua chiave da aistudio.google.com
//    APP_TOKEN       (consigliata)   -> stringa segreta; se impostata, l'app deve
//                                       inviarla nell'header x-app-key (anti-abuso)
//    MODEL           (opzionale)     -> default "gemini-2.5-flash"
// ============================================================================

const CATEGORIES = [
  "Supermercato", "Discount", "Panetteria", "Macelleria", "Pescheria",
  "Ortofrutta", "Gastronomia", "Farmacia", "Bar/Ristorante", "Mercato", "Altro",
];

const PROMPT = `Sei un estrattore di dati da scontrini italiani. Guarda l'immagine dello scontrino e restituisci SOLO un JSON valido con questa struttura:
{
  "store": "nome del negozio (es. Esselunga, Conad, Coop, Lidl, oppure il nome scritto in alto)",
  "type": "una tra: ${CATEGORIES.join(", ")}",
  "date": "data in formato YYYY-MM-DD",
  "items": [ { "name": "nome prodotto leggibile", "qty": numero, "price": prezzo_totale_riga_in_euro } ],
  "total": totale_in_euro
}
Regole IMPORTANTI:
- Lo scontrino ha la descrizione a sinistra e il prezzo a destra: abbina ogni prodotto al SUO prezzo sulla stessa riga, anche se sono distanti.
- QUANTITÀ: una riga del tipo "N x prezzo" (es. "2 x 3,70" oppure "2 X 0,15") indica che il PRODOTTO nella riga SUCCESSIVA è stato acquistato in N unità a quel prezzo unitario. In quel caso imposta qty = N e price = prezzo TOTALE di quella riga prodotto. Esempio: "2 x 3,70" seguito da "STRACCIATELLA COOP ... 7,40" -> {"name":"STRACCIATELLA COOP","qty":2,"price":7.40}. NON creare una riga separata per la riga "N x prezzo".
- Se NON c'è una riga quantità prima del prodotto, qty = 1.
- Usa il PUNTO come separatore decimale nei numeri JSON (es. 3.06).
- Correggi errori ovvi di lettura nei nomi prodotto, ma non inventare prodotti.
- Includi gli sconti come righe con prezzo negativo se presenti.
- Ignora righe non-prodotto: IVA, subtotale, totale, resto, contante, pagamento, punti fedeltà, intestazione/partita IVA.
- Se un dato non è leggibile, usa "" per le stringhe e 0 per i numeri.
- Rispondi SOLO con il JSON, senza testo prima o dopo.`;

function cors(resp) {
  const h = new Headers(resp.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, x-app-key");
  return new Response(resp.body, { status: resp.status, headers: h });
}
function json(obj, status = 200) {
  return cors(new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }));
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (request.method !== "POST") return json({ error: "Usa POST" }, 405);

    // anti-abuso: se APP_TOKEN è impostato, l'app deve inviarlo
    if (env.APP_TOKEN && request.headers.get("x-app-key") !== env.APP_TOKEN) {
      return json({ error: "non autorizzato" }, 403);
    }
    if (!env.GEMINI_API_KEY) return json({ error: "server non configurato (manca GEMINI_API_KEY)" }, 500);

    let image;
    try { ({ image } = await request.json()); } catch { return json({ error: "richiesta non valida" }, 400); }
    if (!image || typeof image !== "string") return json({ error: "immagine mancante" }, 400);
    if (image.length > 8_000_000) return json({ error: "immagine troppo grande" }, 413); // ~6MB

    const model = env.MODEL || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
    const body = {
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: image } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    };

    let g;
    try {
      g = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) {
      return json({ error: "Gemini irraggiungibile" }, 502);
    }
    if (!g.ok) {
      const t = await g.text();
      return json({ error: "Gemini " + g.status, detail: t.slice(0, 200) }, 502);
    }
    const data = await g.json();
    const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    let parsed;
    try { parsed = JSON.parse(txt); }
    catch { try { parsed = JSON.parse(txt.replace(/```json|```/g, "")); } catch { return json({ error: "risposta AI non valida" }, 502); } }

    return json(parsed);
  },
};
