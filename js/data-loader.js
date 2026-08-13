export async function loadData() {
  const [cardsResponse, metadataResponse, packagesResponse, tagsResponse, exclusionsResponse] = await Promise.all([
    fetch("./data/official/cards.json"),
    fetch("./data/official/metadata.json"),
    fetch("./data/custom/packages.json"),
    fetch("./data/custom/tags.json"),
    fetch("./data/custom/exclusions.json")
  ]);

  if (!cardsResponse.ok) {
    throw new Error("Unable to load data/official/cards.json");
  }

  const cards = await cardsResponse.json();
  const metadata = metadataResponse.ok ? await metadataResponse.json() : {};
  const packageData = packagesResponse.ok ? await packagesResponse.json() : { packages: [] };
  const tagData = tagsResponse.ok ? await tagsResponse.json() : { cards: {} };
  const exclusionData = exclusionsResponse.ok ? await exclusionsResponse.json() : { global: [] };

  const packages = Array.isArray(packageData?.packages) ? packageData.packages : [];
  const customTags = tagData?.cards && typeof tagData.cards === "object" ? tagData.cards : {};
  const globalExclusions = new Set((exclusionData?.global ?? []).map(Number));

  enrichCards(cards, packages, customTags);

  return { cards, metadata, packages, customTags, globalExclusions };
}

function enrichCards(cards, packages, customTags) {
  const cardMap = new Map(cards.map(card => [Number(card.id), card]));

  for (const card of cards) {
    card.id = Number(card.id);
    card.setId = Number(card.setId ?? 0);
    if (card.setId === 90000 || card.set === "90000") card.set = "Token";

    card.keywords = extractOfficialKeywords(card.rawSkillText);
    card.deckSelectable = !Boolean(card.token) && card.setId !== 90000 && card.set !== "Token" && Number(card.maxCopies ?? 3) > 0;
    card.generatedBy = [];
    card.relations = [];
    card.packages = [];

    const custom = customTags[String(card.id)] ?? customTags[card.id] ?? {};
    const customRoleList = Array.isArray(custom) ? custom : (custom.roles ?? []);
    const extraTags = Array.isArray(custom?.tags) ? custom.tags : [];
    card.customTags = [...new Set(extraTags.map(String))];
    card.roles = [...new Set([...inferRoles(card), ...customRoleList.map(String)])];
  }

  for (const card of cards) {
    for (const relatedId of card.relatedCards ?? []) {
      const target = cardMap.get(Number(relatedId));
      if (!target) continue;

      if (target.deckSelectable) {
        addRelation(card, target.id, "Direct relation");
      } else {
        addRelation(card, target.id, "Generates");
        if (!target.generatedBy.includes(card.id)) target.generatedBy.push(card.id);
      }
    }
  }

  // Some generated cards are named directly in rules text even when the portal's
  // related_card_ids list is incomplete. Only generated/token cards are scanned here
  // to avoid false relations between ordinary cards with common words in their names.
  const generatedCards = cards.filter(card => !card.deckSelectable && card.name?.length >= 3);
  for (const source of cards) {
    const text = normalizeText(source.text);
    if (!text) continue;

    for (const target of generatedCards) {
      if (source.id === target.id || hasRelation(source, target.id)) continue;
      if (mentionsCardName(text, target.name)) {
        addRelation(source, target.id, "Generates");
        if (!target.generatedBy.includes(source.id)) target.generatedBy.push(source.id);
      }
    }
  }

  for (const packageDef of packages) {
    const packageId = String(packageDef.id ?? packageDef.name ?? "").trim();
    if (!packageId) continue;

    for (const entry of normalizePackageCards(packageDef.cards)) {
      const card = cardMap.get(entry.id);
      if (card && !card.packages.includes(packageId)) card.packages.push(packageId);
    }
  }

  for (const card of cards) {
    if (card.relations.some(relation => relation.type === "Generates") && !card.roles.includes("Generate")) {
      card.roles.push("Generate");
    }
    card.roles.sort();
  }
}

function extractOfficialKeywords(rawSkillText) {
  const raw = String(rawSkillText ?? "");
  const found = new Set();

  for (const match of raw.matchAll(/<color=Keyword>(.*?)<\/color>/gi)) {
    const value = String(match[1] ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/_\d+$/g, "")
      .trim();

    if (value && value.length > 1) found.add(value);
  }

  return [...found].sort((a, b) => a.localeCompare(b));
}

function inferRoles(card) {
  const text = normalizeText(card.text);
  const keywords = new Set((card.keywords ?? []).map(value => String(value).toLowerCase()));
  const roles = new Set();

  if (Number(card.cost) <= 2 && card.deckSelectable) roles.add("Early Game");
  if (/\bdraw (?:a|an|one|two|three|\d+) cards?\b/.test(text) || /\bdraw cards?\b/.test(text)) roles.add("Draw");
  if (/\b(?:destroy|banish|return) (?:an?|the|all|each|random) enemy/.test(text) || /deal \d+ damage to (?:an?|the|a random) enemy follower/.test(text)) roles.add("Removal");
  if (/all enemy followers|each enemy follower|all other followers/.test(text)) roles.add("Board Clear");
  if (/restore \d+ defense to your leader|restore .* defense to your leader|recover .* defense/.test(text)) roles.add("Heal");
  if (/maximum play points|play point orb|empty play point/.test(text)) roles.add("Ramp");
  if (keywords.has("storm") || (/enemy leader/.test(text) && Number(card.cost) >= 5)) roles.add("Finisher");
  if (keywords.has("combo") || keywords.has("mode") || /select a mode|if .* cards? (?:have|has) been/.test(text)) roles.add("Combo Piece");

  return [...roles];
}

function addRelation(card, targetId, type) {
  const id = Number(targetId);
  if (hasRelation(card, id, type)) return;
  card.relations.push({ id, type });
}

function hasRelation(card, targetId, type = null) {
  return (card.relations ?? []).some(relation =>
    Number(relation.id) === Number(targetId) && (!type || relation.type === type)
  );
}

function normalizePackageCards(cards) {
  return (cards ?? []).map(entry => {
    if (typeof entry === "number" || typeof entry === "string") {
      return { id: Number(entry), count: 1 };
    }
    return { id: Number(entry.id), count: Number(entry.count ?? entry.quantity ?? 1) };
  }).filter(entry => Number.isFinite(entry.id));
}

function mentionsCardName(normalizedText, name) {
  const normalizedName = normalizeText(name);
  if (!normalizedName) return false;
  const escaped = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(normalizedText);
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
