import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "data", "official");

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

const TYPE_NAMES = {
  1: "Follower",
  2: "Amulet",
  3: "Amulet",
  4: "Spell"
};

const RARITY_NAMES = {
  1: "Bronze",
  2: "Silver",
  3: "Gold",
  4: "Legendary"
};

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

  if (!response.ok) {
    throw new Error(`API returned ${response.status} for offset ${offset}`);
  }

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

  // The Deck Portal explicitly marks real mechanics with <color=Keyword>.
  // Do not infer keywords by substring matching skill_names: that produced
  // false positives such as single letters like "d" and "s".
  for (const match of raw.matchAll(/<color=Keyword>(.*?)<\/color>/g)) {
    const value = match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/_\d+$/g, "")
      .trim();

    if (value && !value.startsWith("Quest:") && !value.includes("Deck")) {
      found.add(value);
    }
  }

  return [...found].sort();
}

function normalizeCard(id, detail, relations, dictionaries) {
  const common = detail.common ?? {};
  const evo = detail.evo && !Array.isArray(detail.evo) ? detail.evo : null;

  const traits = (common.tribes ?? [])
    .map(traitId => dictionaries.tribeNames[String(traitId)])
    .filter(name => name && name !== "-");

  const related = relations?.related_card_ids ?? [];

  return {
    id: Number(common.card_id ?? id),
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

async function main() {
  const allDetails = {};
  const allRelations = {};
  const dictionaries = {
    tribeNames: {},
    setNames: {},
    skillNames: {},
    skillReplaceTextNames: {}
  };

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
    if (count === 0) emptyPages++;
    else emptyPages = 0;

    offset += 30;
    if (offset > 3000) break;
  }

  const cards = Object.entries(allDetails)
    .map(([id, detail]) => normalizeCard(id, detail, allRelations[id], dictionaries))
    .filter(card => card.name)
    .sort((a, b) =>
      a.class.localeCompare(b.class) ||
      a.cost - b.cost ||
      a.name.localeCompare(b.name)
    );

  const metadata = {
    generatedAt: new Date().toISOString(),
    source: API,
    count: cards.length,
    classes: Object.values(CLASS_NAMES),
    sets: dictionaries.setNames,
    traits: dictionaries.tribeNames,
    keywords: dictionaries.skillNames
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, "cards.json"), JSON.stringify(cards, null, 2));
  await fs.writeFile(path.join(OUT_DIR, "metadata.json"), JSON.stringify(metadata, null, 2));

  console.log(`Done: ${cards.length} cards written to data/official/cards.json`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
