import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE_PATH = path.join(ROOT, "data", "custom", "reference-decks.source.json");
const OUTPUT_PATH = path.join(ROOT, "data", "custom", "reference-decks.json");
const DECK_API = "https://shadowverse-wb.com/web/DeckBuilder/deckHashDetail";

const TYPE_NAMES = { 1: "Follower", 2: "Amulet", 3: "Amulet", 4: "Spell" };
const RARITY_NAMES = { 1: "Bronze", 2: "Silver", 3: "Gold", 4: "Legendary" };

async function fetchDeckByHash(hash) {
  const url = new URL(DECK_API);
  url.searchParams.set("hash", hash);
  const response = await fetch(url, {
    headers: {
      lang: "en",
      "Accept-Language": "en",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0"
    }
  });
  if (!response.ok) throw new Error(`Deck hash API returned ${response.status}`);
  return response.json();
}

function findDeckData(value, depth = 0, seen = new Set()) {
  if (!value || typeof value !== "object" || depth > 6 || seen.has(value)) return null;
  seen.add(value);

  if (value.card_details && value.deck_card_num) return value;

  const priorityKeys = ["data", "result", "deck", "deck_info"];
  for (const key of priorityKeys) {
    const found = findDeckData(value[key], depth + 1, seen);
    if (found) return found;
  }

  for (const child of Object.values(value)) {
    const found = findDeckData(child, depth + 1, seen);
    if (found) return found;
  }
  return null;
}

function buildCardIndex(cardDetails) {
  const map = new Map();
  const values = Array.isArray(cardDetails) ? cardDetails : Object.values(cardDetails ?? {});
  for (const detail of values) {
    const common = detail?.common ?? detail;
    const cardId = Number(common?.card_id ?? detail?.card_id ?? 0);
    if (cardId) map.set(cardId, common);
  }
  return map;
}

function normalizeCounts(deckCardNum) {
  const counts = new Map();
  if (Array.isArray(deckCardNum)) {
    for (const entry of deckCardNum) {
      if (Array.isArray(entry)) {
        const id = Number(entry[0]);
        const qty = Number(entry[1]);
        if (id && qty > 0) counts.set(id, qty);
      } else if (entry && typeof entry === "object") {
        const id = Number(entry.card_id ?? entry.cardId ?? entry.id ?? 0);
        const qty = Number(entry.count ?? entry.qty ?? entry.num ?? entry.quantity ?? 0);
        if (id && qty > 0) counts.set(id, qty);
      }
    }
    return counts;
  }

  for (const [key, rawValue] of Object.entries(deckCardNum ?? {})) {
    const id = Number(key);
    const qty = Number(rawValue?.count ?? rawValue?.qty ?? rawValue?.num ?? rawValue);
    if (id && qty > 0) counts.set(id, qty);
  }
  return counts;
}

function normalizeOrder(sortCardIdList, counts) {
  const order = [];
  const seen = new Set();
  for (const rawId of Array.isArray(sortCardIdList) ? sortCardIdList : []) {
    const id = Number(rawId?.card_id ?? rawId?.cardId ?? rawId);
    if (!id || seen.has(id) || !counts.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  for (const id of counts.keys()) {
    if (!seen.has(id)) order.push(id);
  }
  return order;
}

function parsePortalMeta(hash) {
  const [portalFormat, classId] = String(hash ?? "").split(".");
  return { portalFormat: Number(portalFormat), classId: Number(classId) };
}

function normalizeCard(common, qty) {
  const cardId = Number(common.card_id);
  return {
    cardId,
    baseCardId: Number(common.base_card_id ?? cardId),
    resourceId: Number(common.card_resource_id ?? 0),
    qty,
    name: common.name ?? "",
    cost: Number(common.cost ?? 0),
    type: TYPE_NAMES[Number(common.type)] ?? `Type ${common.type}`,
    rarity: RARITY_NAMES[Number(common.rarity)] ?? `Rarity ${common.rarity}`,
    token: Boolean(common.is_token),
    maxCopies: Number(common.deck_enabled_num ?? 3)
  };
}

async function resolveDeck(sourceDeck) {
  const payload = await fetchDeckByHash(sourceDeck.portalHash);
  const data = findDeckData(payload);
  if (!data) {
    throw new Error(`${sourceDeck.name}: official deck response did not contain card_details/deck_card_num`);
  }

  const counts = normalizeCounts(data.deck_card_num);
  const cardIndex = buildCardIndex(data.card_details);
  const order = normalizeOrder(data.sort_card_id_list, counts);
  const cards = [];

  for (const id of order) {
    const qty = counts.get(id) ?? 0;
    const common = cardIndex.get(id);
    if (!common) throw new Error(`${sourceDeck.name}: card ${id} is in deck_card_num but missing from card_details`);
    cards.push(normalizeCard(common, qty));
  }

  const total = cards.reduce((sum, card) => sum + card.qty, 0);
  if (total !== 40) throw new Error(`${sourceDeck.name}: resolved ${total}/40 cards`);
  if (!cards.every(card => card.cardId > 0 && card.name)) throw new Error(`${sourceDeck.name}: unresolved card metadata`);

  const meta = parsePortalMeta(sourceDeck.portalHash);
  return {
    id: sourceDeck.id,
    name: sourceDeck.name,
    class: sourceDeck.class,
    format: sourceDeck.format,
    strategy: sourceDeck.strategy,
    sourceUrl: sourceDeck.sourceUrl,
    portalHash: sourceDeck.portalHash,
    portalFormat: Number(data.battle_format ?? meta.portalFormat),
    classId: Number(data.class_id ?? meta.classId),
    cards
  };
}

async function main() {
  const source = JSON.parse(await fs.readFile(SOURCE_PATH, "utf8"));
  const decks = [];

  for (const sourceDeck of source.decks ?? []) {
    process.stdout.write(`Resolving ${sourceDeck.name}... `);
    const deck = await resolveDeck(sourceDeck);
    decks.push(deck);
    console.log(`${deck.cards.length} unique · 40 cards`);
  }

  if (decks.length < 7) throw new Error(`Reference pool is incomplete: ${decks.length} decks`);

  const output = {
    format: "svwb-reference-decks",
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "Official Shadowverse: Worlds Beyond DeckBuilder/deckHashDetail API",
    runtimeNetworkCalls: false,
    decks
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`Resolved ${decks.length} local reference decks (${decks.length * 40} card slots).`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
