import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE_PATH = path.join(ROOT, "data", "custom", "reference-decks.source.json");
const OUTPUT_PATH = path.join(ROOT, "data", "custom", "reference-decks.json");
const API = "https://shadowverse-wb.com/web/CardList/cardList";

const TYPE_NAMES = { 1: "Follower", 2: "Amulet", 3: "Amulet", 4: "Spell" };
const RARITY_NAMES = { 1: "Bronze", 2: "Silver", 3: "Gold", 4: "Legendary" };

async function fetchPage(offset) {
  const url = new URL(API);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("class", "0,1,2,3,4,5,6,7");
  url.searchParams.set("cost", "0,1,2,3,4,5,6,7,8,9,10");
  url.searchParams.set("include_token", "1");
  const response = await fetch(url, { headers: { lang: "en", "X-Requested-With": "XMLHttpRequest", "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`Card API returned ${response.status} for offset ${offset}`);
  return response.json();
}

function decodePortalToken(token) {
  const normalized = String(token).replaceAll("-", "+").replaceAll("_", "/");
  const buffer = Buffer.from(normalized, "base64");
  if (buffer.length !== 3) throw new Error(`Unexpected portal token length for ${token}`);
  return buffer.readUIntBE(0, 3);
}

function parseHash(hash) {
  const parts = String(hash ?? "").split(".");
  if (parts.length < 3) throw new Error(`Invalid Deck Portal hash: ${hash}`);
  const [portalFormat, classId, ...tokens] = parts;
  if (tokens.length !== 40) throw new Error(`Deck hash must contain 40 cards, got ${tokens.length}`);
  return { portalFormat: Number(portalFormat), classId: Number(classId), tokens };
}

async function loadOfficialCards() {
  const maps = { resource: new Map(), card: new Map(), base: new Map(), imageHash: new Map() };
  let offset = 0;
  let emptyPages = 0;
  while (emptyPages < 2) {
    const json = await fetchPage(offset);
    const values = Object.values(json?.data?.card_details ?? {});
    if (!values.length) emptyPages += 1;
    else emptyPages = 0;
    for (const detail of values) {
      const common = detail?.common ?? {};
      const resourceId = Number(common.card_resource_id ?? 0);
      const cardId = Number(common.card_id ?? 0);
      const baseCardId = Number(common.base_card_id ?? common.card_id ?? 0);
      const imageHash = String(common.card_image_hash ?? "").trim();
      if (resourceId) maps.resource.set(resourceId, common);
      if (cardId) maps.card.set(cardId, common);
      if (baseCardId) maps.base.set(baseCardId, common);
      if (imageHash) maps.imageHash.set(imageHash, common);
    }
    offset += 30;
    if (offset > 3000) break;
  }
  if (maps.card.size < 100) throw new Error(`Suspiciously small official card map: ${maps.card.size}`);
  return maps;
}

async function inspectDeckShare(deck) {
  const url = new URL("https://shadowverse-wb.com/web/Deck/share");
  url.searchParams.set("hash", deck.portalHash);
  url.searchParams.set("lang", "en");
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
  const html = await response.text();
  console.log(`Deck share ${deck.name}: status=${response.status} final=${response.url} html=${html.length}`);
  console.log(`Deck share raw HTML: ${html.replace(/\s+/g, " ")}`);
  const imageRefs = [...html.matchAll(/uploads\/card_image\/[^\"'<>\s]+/gi)].map(match => match[0]);
  console.log(`Deck share image refs (${imageRefs.length}): ${JSON.stringify(imageRefs.slice(0, 8))}`);
  const cardSnippets = [...html.matchAll(/.{0,140}(?:card[_-]id|card_image|deck[_-]card|data-card).{0,260}/gi)].map(match => match[0].replace(/\s+/g, " "));
  console.log(`Deck share card snippets (${cardSnippets.length}): ${JSON.stringify(cardSnippets.slice(0, 8))}`);
  const numericIds = [...new Set(html.match(/\b\d{8,9}\b/g) ?? [])];
  console.log(`Deck share numeric IDs (${numericIds.length}): ${JSON.stringify(numericIds.slice(0, 40))}`);
  return html;
}

function countInOrder(values) {
  const map = new Map();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return map;
}

function resolveCommon(identifier, maps) {
  return maps.resource.get(identifier) ?? maps.card.get(identifier) ?? maps.base.get(identifier) ?? null;
}

async function main() {
  const source = JSON.parse(await fs.readFile(SOURCE_PATH, "utf8"));
  const maps = await loadOfficialCards();
  const decks = [];
  let inspected = false;

  for (const deck of source.decks ?? []) {
    const parsed = parseHash(deck.portalHash);
    const counts = countInOrder(parsed.tokens);
    const cards = [];
    for (const [token, qty] of counts) {
      const portalIdentifier = decodePortalToken(token);
      const common = resolveCommon(portalIdentifier, maps);
      if (!common) {
        if (!inspected) {
          inspected = true;
          await inspectDeckShare(deck);
        }
        throw new Error(`${deck.name}: portal token ${token} decoded to ${portalIdentifier}; no match in resource/card/base identifiers`);
      }
      cards.push({
        cardId: Number(common.card_id),
        baseCardId: Number(common.base_card_id ?? common.card_id),
        resourceId: Number(common.card_resource_id ?? 0),
        portalIdentifier,
        portalToken: token,
        qty,
        name: common.name ?? "",
        cost: Number(common.cost ?? 0),
        type: TYPE_NAMES[Number(common.type)] ?? `Type ${common.type}`,
        rarity: RARITY_NAMES[Number(common.rarity)] ?? `Rarity ${common.rarity}`
      });
    }
    if (cards.reduce((sum, card) => sum + card.qty, 0) !== 40) throw new Error(`${deck.name}: resolved deck is not 40 cards`);
    decks.push({ id: deck.id, name: deck.name, class: deck.class, format: deck.format, strategy: deck.strategy, sourceUrl: deck.sourceUrl, portalHash: deck.portalHash, portalFormat: parsed.portalFormat, classId: parsed.classId, cards });
  }

  const output = { format: "svwb-reference-decks", version: 1, generatedAt: new Date().toISOString(), source: "Official Shadowverse: Worlds Beyond CardList API + stored Deck Portal hashes", runtimeNetworkCalls: false, decks };
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`Resolved ${decks.length} reference decks.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
