import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE_PATH = path.join(ROOT, "data", "custom", "reference-decks.source.json");
const API = "https://shadowverse-wb.com/web/CardList/cardList";

async function fetchPage(offset) {
  const url = new URL(API);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("class", "0,1,2,3,4,5,6,7");
  url.searchParams.set("cost", "0,1,2,3,4,5,6,7,8,9,10");
  url.searchParams.set("include_token", "1");
  const response = await fetch(url, { headers: { lang: "en", "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`Card API returned ${response.status}`);
  return response.json();
}

async function loadOfficialCards() {
  const maps = { resource: new Map(), card: new Map(), base: new Map() };
  let offset = 0;
  let emptyPages = 0;
  while (emptyPages < 2) {
    const json = await fetchPage(offset);
    const values = Object.values(json?.data?.card_details ?? {});
    emptyPages = values.length ? 0 : emptyPages + 1;
    for (const detail of values) {
      const common = detail?.common ?? {};
      const resourceId = Number(common.card_resource_id ?? 0);
      const cardId = Number(common.card_id ?? 0);
      const baseCardId = Number(common.base_card_id ?? common.card_id ?? 0);
      if (resourceId) maps.resource.set(resourceId, common);
      if (cardId) maps.card.set(cardId, common);
      if (baseCardId) maps.base.set(baseCardId, common);
    }
    offset += 30;
    if (offset > 3000) break;
  }
  return maps;
}

function decodePortalToken(token) {
  const normalized = String(token).replaceAll("-", "+").replaceAll("_", "/");
  return Buffer.from(normalized, "base64").readUIntBE(0, 3);
}

function snippets(text, pattern, radius = 220, limit = 30) {
  const out = [];
  const re = new RegExp(pattern, "gi");
  let match;
  while ((match = re.exec(text)) && out.length < limit) {
    const start = Math.max(0, match.index - radius);
    const end = Math.min(text.length, match.index + match[0].length + radius);
    out.push(text.slice(start, end).replace(/\s+/g, " "));
    if (re.lastIndex === match.index) re.lastIndex += 1;
  }
  return [...new Set(out)];
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

async function inspectOfficialClient(deck) {
  const html = await fetchText(deck.sourceUrl);
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(match => match[1]);
  const interesting = scripts.filter(src => /(?:detail|api|portal)\.[^/]+\.js$/i.test(src));
  console.log(`Interesting scripts: ${JSON.stringify(interesting)}`);

  for (const src of interesting) {
    const url = new URL(src, "https://shadowverse-wb.com").href;
    const js = await fetchText(url);
    console.log(`SCRIPT ${src} length=${js.length}`);

    const paths = [...new Set([
      ...(js.match(/\/web\/[A-Za-z0-9_./?=&${}:+-]+/g) ?? []),
      ...(js.match(/(?:CardList|Deck|deck|hash|cardList|card_id|cardId)[A-Za-z0-9_./?=&${}:+-]{0,100}/g) ?? [])
    ])].slice(0, 100);
    console.log(`PATHS ${src}: ${JSON.stringify(paths)}`);

    for (const term of ["hash", "Deck/", "deck/", "card_id", "cardId", "decode", "atob", "base64", "share", "detail"]) {
      const found = snippets(js, term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), 240, 12);
      if (found.length) console.log(`SNIPPETS ${src} ${term}: ${JSON.stringify(found)}`);
    }
  }
}

async function main() {
  const source = JSON.parse(await fs.readFile(SOURCE_PATH, "utf8"));
  const maps = await loadOfficialCards();
  const firstDeck = source.decks?.[0];
  const firstToken = String(firstDeck?.portalHash ?? "").split(".")[2];
  const decoded = decodePortalToken(firstToken);
  const direct = maps.resource.get(decoded) ?? maps.card.get(decoded) ?? maps.base.get(decoded);
  if (direct) {
    console.log(`Direct token mapping unexpectedly works: ${direct.name}`);
    return;
  }
  console.log(`Token ${firstToken} decodes to ${decoded}; direct card/resource/base mapping does not match.`);
  await inspectOfficialClient(firstDeck);
  throw new Error("Diagnostic complete: inspect logged Deck Portal endpoint strings.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
