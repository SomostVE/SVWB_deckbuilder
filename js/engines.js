import { loadData } from "./data-loader.js";
import { state } from "./state.js";
import { CLASSES } from "./filters.js";
import { loadWorkspace, applyWorkspace, saveWorkspace } from "./storage.js";
import { addCards } from "./deck.js";

const CLASS_ICON_URLS = {
  Forestcraft: "https://shadowverse-wb.com/assets/images/common/common/class/class_elf.svg",
  Swordcraft: "https://shadowverse-wb.com/assets/images/common/common/class/class_royal.svg",
  Runecraft: "https://shadowverse-wb.com/assets/images/common/common/class/class_witch.svg",
  Dragoncraft: "https://shadowverse-wb.com/assets/images/common/common/class/class_dragon.svg",
  Abysscraft: "https://shadowverse-wb.com/assets/images/common/common/class/class_nightmare.svg",
  Havencraft: "https://shadowverse-wb.com/assets/images/common/common/class/class_bishop.svg",
  Portalcraft: "https://shadowverse-wb.com/assets/images/common/common/class/class_nemesis.svg",
  Neutral: "https://shadowverse-wb.com/assets/images/common/common/class/class_neutral.svg"
};

const SUPPORT_ROLES = new Set(["Draw", "Removal", "Board Clear", "Heal", "Ramp", "Early Game"]);
const CORE_ROLES = new Set(["Combo Piece", "Generate"]);
const els = {
  classFilter: document.getElementById("engine-class-filter"),
  search: document.getElementById("engine-search"),
  summary: document.getElementById("engine-summary"),
  archetypes: document.getElementById("archetype-list"),
  detected: document.getElementById("detected-package-list"),
  curated: document.getElementById("curated-package-list"),
  dialog: document.getElementById("engine-dialog"),
  dialogTitle: document.getElementById("engine-dialog-title"),
  dialogMeta: document.getElementById("engine-dialog-meta"),
  dialogContent: document.getElementById("engine-dialog-content"),
  dialogActions: document.getElementById("engine-dialog-actions"),
  dialogClose: document.getElementById("engine-dialog-close")
};

let query = "";
let archetypes = [];
let detectedPackages = [];
let curatedPackages = [];

init();

async function init() {
  try {
    const { cards, metadata, packages, customTags, globalExclusions } = await loadData();
    state.cards = cards;
    state.cardMap = new Map(cards.map(card => [Number(card.id), card]));
    state.metadata = metadata;
    state.packages = packages;
    state.customTags = customTags;
    state.globalExclusions = globalExclusions;
    applyWorkspace(state, loadWorkspace());

    bindEvents();
    render();
  } catch (error) {
    console.error(error);
    els.archetypes.innerHTML = `<p class="muted">Unable to load the card database.</p>`;
  }
}

function bindEvents() {
  els.search.addEventListener("input", event => {
    query = String(event.target.value ?? "").trim().toLowerCase();
    renderLists();
  });

  els.dialogClose.addEventListener("click", () => els.dialog.close());
  els.dialog.addEventListener("click", event => {
    if (event.target === els.dialog) els.dialog.close();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && els.dialog.open) els.dialog.close();
  });
}

function render() {
  renderClassFilter();
  archetypes = buildArchetypes();
  detectedPackages = buildDetectedPackages();
  curatedPackages = buildCuratedPackages();
  renderLists();
}

function renderClassFilter() {
  els.classFilter.innerHTML = "";

  for (const className of CLASSES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "class-button class-icon-button";
    button.title = className;
    button.setAttribute("aria-label", className);
    button.classList.toggle("active", className === state.selectedClass);

    const image = document.createElement("img");
    image.src = CLASS_ICON_URLS[className];
    image.alt = "";
    button.appendChild(image);

    button.addEventListener("click", () => {
      state.selectedClass = className;
      saveWorkspace(state);
      render();
    });
    els.classFilter.appendChild(button);
  }

  const neutral = document.createElement("label");
  neutral.className = "neutral-toggle neutral-icon-toggle";
  neutral.title = "Neutral";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.includeNeutral;
  checkbox.addEventListener("change", () => {
    state.includeNeutral = checkbox.checked;
    saveWorkspace(state);
    render();
  });

  const image = document.createElement("img");
  image.src = CLASS_ICON_URLS.Neutral;
  image.alt = "";
  neutral.append(checkbox, image);
  els.classFilter.appendChild(neutral);
}

function buildArchetypes() {
  const byTrait = new Map();
  for (const card of deckPool()) {
    for (const trait of card.traits ?? []) {
      if (!trait || trait === "-") continue;
      if (!byTrait.has(trait)) byTrait.set(trait, []);
      byTrait.get(trait).push(card);
    }
  }

  return [...byTrait.entries()]
    .filter(([, cards]) => cards.length >= 2)
    .map(([name, cards]) => ({
      kind: "archetype",
      name,
      cards: sortCards(cards),
      support: cards.filter(isSupport).length,
      finishers: cards.filter(card => card.roles?.includes("Finisher")).length,
      generators: cards.filter(card => card.roles?.includes("Generate")).length
    }))
    .sort((a, b) => b.cards.length - a.cards.length || a.name.localeCompare(b.name));
}

function buildDetectedPackages() {
  const pool = deckPool();
  const poolIds = new Set(pool.map(card => card.id));
  const result = [];
  const signatures = new Set();

  for (const token of state.cards.filter(card => !card.deckSelectable)) {
    const parents = pool.filter(card =>
      (card.relations ?? []).some(relation => Number(relation.id) === token.id) ||
      (token.generatedBy ?? []).includes(card.id)
    );

    const uniqueParents = uniqueCards(parents);
    if (uniqueParents.length < 2) continue;

    const signature = uniqueParents.map(card => card.id).sort((a, b) => a - b).join(",");
    if (signatures.has(signature)) continue;
    signatures.add(signature);

    result.push({
      kind: "detected",
      name: `${token.name} engine`,
      cards: sortCards(uniqueParents),
      generated: [token],
      description: `${uniqueParents.length} deck cards connect to ${token.name}.`
    });
  }

  const adjacency = new Map(pool.map(card => [card.id, new Set()]));
  for (const card of pool) {
    for (const relation of card.relations ?? []) {
      const targetId = Number(relation.id);
      if (!poolIds.has(targetId)) continue;
      adjacency.get(card.id)?.add(targetId);
      adjacency.get(targetId)?.add(card.id);
    }
  }

  const visited = new Set();
  for (const card of pool) {
    if (visited.has(card.id)) continue;
    const componentIds = [];
    const stack = [card.id];
    visited.add(card.id);

    while (stack.length) {
      const id = stack.pop();
      componentIds.push(id);
      for (const next of adjacency.get(id) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }

    if (componentIds.length < 2) continue;
    const component = sortCards(componentIds.map(id => state.cardMap.get(id)).filter(Boolean));
    const signature = component.map(item => item.id).sort((a, b) => a - b).join(",");
    if (signatures.has(signature)) continue;

    const commonTrait = findCommonTrait(component);
    if (commonTrait && archetypes.some(archetype => archetype.name === commonTrait)) continue;

    signatures.add(signature);
    result.push({
      kind: "detected",
      name: commonTrait ? `${commonTrait} linked package` : `${component[0].name} package`,
      cards: component,
      generated: [],
      description: `${component.length} cards are directly linked by official card relations.`
    });
  }

  return result.sort((a, b) => b.cards.length - a.cards.length || a.name.localeCompare(b.name));
}

function buildCuratedPackages() {
  return state.packages.map(packageDef => {
    const entries = normalizePackageCards(packageDef.cards);
    const cards = entries
      .map(entry => ({ ...entry, card: state.cardMap.get(entry.id) }))
      .filter(entry => entry.card)
      .filter(entry => entry.card.class === state.selectedClass || (state.includeNeutral && entry.card.class === "Neutral"));

    return {
      kind: "curated",
      id: packageDef.id,
      name: packageDef.name ?? packageDef.id ?? "Package",
      description: packageDef.description ?? "Curated card package.",
      entries: cards,
      cards: cards.map(entry => entry.card)
    };
  }).filter(packageDef => packageDef.cards.length);
}

function renderLists() {
  const visibleArchetypes = archetypes.filter(matchesQuery);
  const visibleDetected = detectedPackages.filter(matchesQuery);
  const visibleCurated = curatedPackages.filter(matchesQuery);

  renderEngineGrid(els.archetypes, visibleArchetypes, "No archetypes match this class or search.");
  renderEngineGrid(els.detected, visibleDetected, "No multi-card packages were detected for this class yet.");
  renderEngineGrid(els.curated, visibleCurated, "No curated packages for this class yet.");

  els.summary.textContent = `${archetypes.length} archetypes · ${detectedPackages.length} detected · ${curatedPackages.length} curated`;
}

function renderEngineGrid(root, items, emptyText) {
  root.innerHTML = "";
  if (!items.length) {
    root.innerHTML = `<div class="engine-empty">${escapeHtml(emptyText)}</div>`;
    return;
  }

  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "engine-card";

    const thumbnails = item.cards.slice(0, 4).map(card =>
      `<img src="${escapeAttr(card.image)}" alt="" loading="lazy">`
    ).join("");

    let stats = `${item.cards.length} cards`;
    if (item.kind === "archetype") {
      const parts = [];
      if (item.support) parts.push(`${item.support} support`);
      if (item.finishers) parts.push(`${item.finishers} finisher${item.finishers === 1 ? "" : "s"}`);
      if (item.generators) parts.push(`${item.generators} generator${item.generators === 1 ? "" : "s"}`);
      if (parts.length) stats += ` · ${parts.join(" · ")}`;
    }
    if (item.generated?.length) stats += ` · ${item.generated.length} generated`;

    button.innerHTML = `
      <div class="engine-card-thumbs">${thumbnails}</div>
      <div class="engine-card-copy">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(stats)}</span>
        ${item.description ? `<small>${escapeHtml(item.description)}</small>` : ""}
      </div>
    `;
    button.addEventListener("click", () => openDetails(item));
    root.appendChild(button);
  }
}

function openDetails(item) {
  els.dialogTitle.textContent = item.name;
  els.dialogMeta.textContent = item.description || `${item.cards.length} cards`;
  els.dialogContent.innerHTML = "";
  els.dialogActions.innerHTML = "";

  const groups = groupCards(item.cards);
  if (item.generated?.length) appendCardGroup("Generated cards", item.generated, { generated: true });
  if (groups.core.length) appendCardGroup("Core / engine", groups.core);
  if (groups.support.length) appendCardGroup("Support", groups.support);
  if (groups.payoff.length) appendCardGroup("Payoff / finishers", groups.payoff);
  if (!groups.core.length && !groups.support.length && !groups.payoff.length) appendCardGroup("Cards", item.cards);

  if (item.kind === "archetype") {
    const browse = document.createElement("button");
    browse.type = "button";
    browse.className = "button";
    browse.textContent = "Show in Cards";
    browse.addEventListener("click", () => openArchetypeInCards(item.name));
    els.dialogActions.appendChild(browse);
  }

  if (item.kind === "curated") {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "button";
    add.textContent = "Add package to deck";
    add.addEventListener("click", () => {
      const entries = item.entries.map(entry => ({ id: entry.id, count: entry.count }));
      const changed = addCards(entries, state.cardMap);
      add.textContent = changed ? "Added to deck" : "Nothing to add";
      add.disabled = true;
    });
    els.dialogActions.appendChild(add);
  }

  els.dialog.showModal();

  function appendCardGroup(title, cards, options = {}) {
    const section = document.createElement("section");
    section.className = "engine-detail-group";
    section.innerHTML = `<h3>${escapeHtml(title)}</h3>`;
    const grid = document.createElement("div");
    grid.className = "engine-detail-cards";

    for (const card of sortCards(cards)) {
      const roles = options.generated ? ["Generated"] : (card.roles ?? []);
      const article = document.createElement("article");
      article.className = "engine-detail-card";
      article.title = card.text || card.name;
      article.innerHTML = `
        <img src="${escapeAttr(card.image)}" alt="${escapeAttr(card.name)}" loading="lazy">
        <div>
          <strong>${escapeHtml(card.name)}</strong>
          <span>Cost ${card.cost} · ${escapeHtml(card.type)} · ${escapeHtml(card.rarity)}</span>
          ${roles.length ? `<small>${escapeHtml(roles.join(" · "))}</small>` : ""}
        </div>
      `;
      grid.appendChild(article);
    }

    section.appendChild(grid);
    els.dialogContent.appendChild(section);
  }
}

function openArchetypeInCards(trait) {
  const key = `svwb-class-filters:${state.selectedClass}`;
  const payload = {
    costs: [],
    sets: [],
    types: [],
    rarities: [],
    traits: [trait],
    keywords: []
  };
  localStorage.setItem(key, JSON.stringify(payload));
  saveWorkspace(state);
  location.href = "./index.html";
}

function deckPool() {
  return state.cards.filter(card =>
    card.deckSelectable &&
    (card.class === state.selectedClass || (state.includeNeutral && card.class === "Neutral"))
  );
}

function groupCards(cards) {
  const groups = { core: [], support: [], payoff: [] };
  for (const card of cards) {
    if (card.roles?.includes("Finisher")) {
      groups.payoff.push(card);
      continue;
    }
    if ((card.roles ?? []).some(role => CORE_ROLES.has(role))) {
      groups.core.push(card);
      continue;
    }
    if (isSupport(card)) {
      groups.support.push(card);
      continue;
    }
    groups.core.push(card);
  }
  return groups;
}

function isSupport(card) {
  return (card.roles ?? []).some(role => SUPPORT_ROLES.has(role));
}

function findCommonTrait(cards) {
  if (!cards.length) return null;
  const first = (cards[0].traits ?? []).filter(value => value && value !== "-");
  return first.find(trait => cards.every(card => (card.traits ?? []).includes(trait))) ?? null;
}

function matchesQuery(item) {
  if (!query) return true;
  const haystack = [
    item.name,
    item.description,
    ...item.cards.flatMap(card => [card.name, card.text, card.set, ...(card.traits ?? []), ...(card.roles ?? [])]),
    ...(item.generated ?? []).map(card => card.name)
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function sortCards(cards) {
  return [...cards].sort((a, b) => Number(a.cost) - Number(b.cost) || a.name.localeCompare(b.name));
}

function uniqueCards(cards) {
  return [...new Map(cards.map(card => [card.id, card])).values()];
}

function normalizePackageCards(cards) {
  return (cards ?? []).map(entry => {
    if (typeof entry === "number" || typeof entry === "string") return { id: Number(entry), count: 1 };
    return { id: Number(entry.id), count: Number(entry.count ?? entry.quantity ?? 1) };
  }).filter(entry => Number.isFinite(entry.id));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
