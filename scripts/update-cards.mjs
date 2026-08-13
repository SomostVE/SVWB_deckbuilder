import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "data", "official");
const CARDS_PATH = path.join(OUT_DIR, "cards.json");
const META_PATH = path.join(OUT_DIR, "metadata.json");
const CHANGELOG_PATH = path.join(OUT_DIR, "changelog.json");

const API = "https://shadowverse-wb.com/web/CardList/cardList";
const IMAGE_BASE = "https://shadowverse-wb.com/uploads/card_image/eng/card/";

const CLASS_NAMES = {
  0: "Neutral",
  1: "Forestcraft",
  2: "Swordcraft",
  3: "Runecraft",
  4: "Dragoncraft",
  5: "Abysscraft",
  6: "Havencraft",
  7: "Portalcraft"
};

const TYPE_NAMES = { 1: "Follower", 2: "Amulet", 3: "Amulet", 4: "Spell" };
const RARITY_NAMES = { 1: "Bronze", 2: "Silver", 3: "Gold", 4: "Legendary" };
const TRACKED_FIELDS = ["name", "class", "setId", "set", "type", "rarity", "cost", "attack", "defense", "traits", "keywords", "text", "rotation", "maxCopies", "relatedCards", "imageHash"];

async function fetchPage(offset) {
  const url = new URL(API);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("class", "0,1,2,3,4,5,6,7");
  url.searchParams.set("cost", "0,1,2,3,4,5,6,7,8,9,10");
  url.searchParams.set("include_token", "1");

  const response = await fetch(url, {
    headers: {
      lang: "en",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0"
    }
  });
  if (!response.ok) throw new Error(`API returned ${response.status} for offset ${offset}`);
  return response.json();
}

function cleanSkillText(value) {
  return String(value ?? "")
    .replace(/<hr\s*\/?\s*>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function extractKeywords(skillText) {
  const raw = String(skillText ?? "");
  const found = new Set();
  for (const match of raw.matchAll(/<color=Keyword>(.*?)<\/color>/g)) {
    const value = match[1].replace(/<[^>]+>/g, "").replace(/_\d+$/g, "").trim();
    if (value && !value.startsWith("Quest:") && !value.includes("Deck")) found.add(value);
  }
  return [...found].sort();
}

function normalizeCard(id, detail, relations, dictionaries) {
  const common = detail.common ?? {};
  const evo = detail.evo && !Array.isArray(detail.evo) ? detail.evo : null;
  const traits = (common.tribes ?? []).map(traitId => dictionaries.tribeNames[String(traitId)]).filter(name => name && name !== "-");
  const related = relations?.related_card_ids ?? [];

  return {
    id: Number(common.card_id ?? id),
    baseCardId: Number(common.base_card_id ?? common.card_id ?? id),
    name: common.name ?? "",
    class: CLASS_NAMES[Number(common.class)] ?? `Class ${common.class}`,
    setId: Number(common.card_set_id ?? 0),
    set: dictionaries.setNames[String(common.card_set_id)] ?? String(common.card_set_id ?? ""),
    type: TYPE_NAMES[Number(common.type)] ?? `Type ${common.type}`,
    rarity: RARITY_NAMES[Number(common.rarity)] ?? `Rarity ${common.rarity}`,
    cost: Number(common.cost ?? 0),
    attack: Number(common.atk ?? 0),
    defense: Number(common.life ?? 0),
    traits,
    keywords: extractKeywords(common.skill_text),
    text: cleanSkillText(common.skill_text),
    rawSkillText: common.skill_text ?? "",
    flavourText: common.flavour_text ?? "",
    rotation: Boolean(common.is_include_rotation),
    token: Boolean(common.is_token),
    maxCopies: Number(common.deck_enabled_num ?? 3),
    relatedCards: related.map(Number),
    image: common.card_image_hash ? `${IMAGE_BASE}${common.card_image_hash}.png` : null,
    imageHash: common.card_image_hash ?? null,
    bannerImageHash: common.card_banner_image_hash ?? null,
    evolved: evo ? {
      text: cleanSkillText(evo.skill_text),
      rawSkillText: evo.skill_text ?? "",
      flavourText: evo.flavour_text ?? "",
      image: evo.card_image_hash ? `${IMAGE_BASE}${evo.card_image_hash}.png` : null,
      imageHash: evo.card_image_hash ?? null,
      bannerImageHash: evo.card_banner_image_hash ?? null
    } : null,
    styles: (detail.style_card_list ?? []).map(style => ({
      name: style.name ?? "",
      image: style.hash ? `${IMAGE_BASE}${style.hash}.png` : null,
      evolvedImage: style.evo_hash ? `${IMAGE_BASE}${style.evo_hash}.png` : null
    })),
    questions: common.questions ?? []
  };
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch { return fallback; }
}

function stable(value) {
  if (Array.isArray(value)) return JSON.stringify([...value].sort((a, b) => String(a).localeCompare(String(b))));
  return JSON.stringify(value);
}

function compareCard(previous, current) {
  const changes = [];
  for (const field of TRACKED_FIELDS) {
    if (stable(previous?.[field]) === stable(current?.[field])) continue;
    changes.push({ field, before: previous?.[field] ?? null, after: current?.[field] ?? null });
  }
  return changes;
}

async function main() {
  const previousCards = await readJson(CARDS_PATH, []);
  const previousMeta = await readJson(META_PATH, {});
  const previousMap = new Map(previousCards.map(card => [Number(card.id), card]));

  const allDetails = {};
  const allRelations = {};
  const dictionaries = { tribeNames: {}, setNames: {}, skillNames: {}, skillReplaceTextNames: {} };
  let offset = 0;
  let emptyPages = 0;

  while (emptyPages < 2) {
    console.log(`Fetching offset ${offset}...`);
    const json = await fetchPage(offset);
    const data = json?.data ?? {};
    const details = data.card_details ?? {};
    Object.assign(allDetails, details);
    Object.assign(allRelations, data.cards ?? {});
    Object.assign(dictionaries.tribeNames, data.tribe_names ?? {});
    Object.assign(dictionaries.setNames, data.card_set_names ?? {});
    Object.assign(dictionaries.skillNames, data.skill_names ?? {});
    Object.assign(dictionaries.skillReplaceTextNames, data.skill_replace_text_names ?? {});

    const count = Object.keys(details).length;
    if (count === 0) emptyPages++; else emptyPages = 0;
    offset += 30;
    if (offset > 3000) break;
  }

  const cards = Object.entries(allDetails)
    .map(([id, detail]) => normalizeCard(id, detail, allRelations[id], dictionaries))
    .filter(card => card.name)
    .sort((a, b) => a.class.localeCompare(b.class) || a.cost - b.cost || a.name.localeCompare(b.name));

  const currentMap = new Map(cards.map(card => [card.id, card]));
  const hasBaseline = previousMap.size > 0;
  const added = [];
  const modified = [];
  const removed = [];

  for (const card of cards) {
    const previous = previousMap.get(card.id);
    const changes = previous ? compareCard(previous, card) : [];
    card.newlyAdded = Boolean(hasBaseline && !previous);
    card.modifiedInLatestUpdate = Boolean(hasBaseline && previous && changes.length);
    if (card.newlyAdded) added.push(summary(card));
    if (card.modifiedInLatestUpdate) modified.push({ ...summary(card), changes });
  }

  if (hasBaseline) {
    for (const previous of previousCards) if (!currentMap.has(Number(previous.id))) removed.push(summary(previous));
  }

  const generatedAt = new Date().toISOString();
  const changelog = {
    generatedAt,
    previousGeneratedAt: previousMeta.generatedAt ?? null,
    baselineAvailable: hasBaseline,
    counts: { added: added.length, modified: modified.length, removed: removed.length },
    added,
    modified,
    removed
  };

  const metadata = {
    generatedAt,
    source: API,
    count: cards.length,
    classes: Object.values(CLASS_NAMES),
    sets: dictionaries.setNames,
    traits: dictionaries.tribeNames,
    keywords: dictionaries.skillNames,
    update: changelog.counts
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(CARDS_PATH, JSON.stringify(cards, null, 2));
  await fs.writeFile(META_PATH, JSON.stringify(metadata, null, 2));
  await fs.writeFile(CHANGELOG_PATH, JSON.stringify(changelog, null, 2));

  console.log(`Done: ${cards.length} cards · +${added.length} new · ${modified.length} modified · ${removed.length} removed`);
}

function summary(card) {
  return { id: Number(card.id), name: card.name ?? "", class: card.class ?? "", set: card.set ?? "", rarity: card.rarity ?? "" };
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
