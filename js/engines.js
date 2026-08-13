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
const ENGINE_VIEW_KEY = "svwb-engines-view";
const ENGINE_SORT_KEY = "svwb-engines-sort";
const ENGINE_DECK_ONLY_KEY = "svwb-engines-deck-only";

const els = {
  classFilter: document.getElementById("engine-class-filter"),
  search: document.getElementById("engine-search"),
  summary: document.getElementById("engine-summary"),
  kindTabs: document.getElementById("engine-kind-tabs"),
  deckOnly: document.getElementById("engine-deck-only"),
  sort: document.getElementById("engine-sort"),
  archetypeSection: document.getElementById("archetype-section"),
  detectedSection: document.getElementById("detected-section"),
  curatedSection: document.getElementById("curated-section"),
  archetypes: document.getElementById("archetype-list"),
  detected: document.getElementById("detected-package-list"),
  curated: document.getElementById("curated-package-list"),
  dialog: document.getElementById("engine-dialog"),
  dialogTitle: document.getElementById("engine-dialog-title"),
  dialogMeta: document.getElementById("engine-dialog-meta"),
  dialogStats: document.getElementById("engine-dialog-stats"),
  dialogContent: document.getElementById("engine-dialog-content"),
  dialogActions: document.getElementById("engine-dialog-actions"),
  dialogClose: document.getElementById("engine-dialog-close")
};

let query = "";
let activeKind = localStorage.getItem(ENGINE_VIEW_KEY) || "all";
let sortMode = localStorage.getItem(ENGINE_SORT_KEY) || "size";
let deckOnly = localStorage.getItem(ENGINE_DECK_ONLY_KEY) === "1";
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

    if (!["all", "archetype", "detected", "curated"].includes(activeKind)) activeKind = "all";
    if (!["size", "coverage", "name", "cost"].includes(sortMode)) sortMode = "size";
    els.sort.value = sortMode;
    els.deckOnly.checked = deckOnly;

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

  els.kindTabs.addEventListener("click", event => {
    const button = event.target.closest("[data-kind]");
    if (!button) return;
    activeKind = button.dataset.kind;
    localStorage.setItem(ENGINE_VIEW_KEY, activeKind);
    renderLists();
  });

  els.deckOnly.addEventListener("change", () => {
    deckOnly = els.deckOnly.checked;
    localStorage.setItem(ENGINE_DECK_ONLY_KEY, deckOnly ? "1" : "0");
    renderLists();
  });

  els.sort.addEventListener("change", () => {
    sortMode = els.sort.value;
    localStorage.setItem(ENGINE_SORT_KEY, sortMode);
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
    image.draggable = false;
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
  neutral.setAttribute("aria-label", "Include Neutral cards");

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
  image.draggable = false;
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
    .map(([name, cards]) => withMetrics({
      kind: "archetype",
      name,
      cards: sortCards(cards),
      support: cards.filter(isSupport).length,
      finishers: cards.filter(card => card.roles?.includes("Finisher")).length,
      generators: cards.filter(card => card.roles?.includes("Generate")).length,
      signal: "Shared trait",
      confidence: "Strong",
      description: `${cards.length} deck cards share the ${name} trait.`
    }));
}

function buildDetectedPackages() {
  const pool = deckPool();
  const poolIds = new Set(pool.map(card => card.id));
  const result = [];
  const bySignature = new Map();

  for (const token of state.cards.filter(card => !card.deckSelectable)) {
    const generators = pool.filter(card =>
      (card.relations ?? []).some(relation => Number(relation.id) === token.id && relation.type === "Generates") ||
      (token.generatedBy ?? []).includes(card.id)
    );
    const references = pool.filter(card =>
      (card.relations ?? []).some(relation => Number(relation.id) === token.id)
    );
    const parents = uniqueCards([...generators, ...references]);
    if (parents.length < 2) continue;

    const signature = parents.map(card => card.id).sort((a, b) => a - b).join(",");
    const existing = bySignature.get(signature);
    if (existing) {
      if (!existing.generated.some(card => card.id === token.id)) existing.generated.push(token);
      if (generators.length) {
        existing.signal = "Generated-card links";
        existing.confidence = "Strong";
      }
      continue;
    }

    const item = {
      kind: "detected",
      name: `${token.name} engine`,
      cards: sortCards(parents),
      generated: [token],
      signal: generators.length ? "Generated-card links" : "Token references",
      confidence: generators.length ? "Strong" : "Medium",
      description: generators.length
        ? `${parents.length} deck cards create or interact directly with ${token.name}.`
        : `${parents.length} deck cards reference ${token.name}.`
    };
    bySignature.set(signature, item);
    result.push(item);
  }

  for (const item of result) {
    if (item.generated.length > 1) {
      const names = item.generated.map(card => card.name);
      item.name = names.length === 2
        ? `${names[0]} / ${names[1]} engine`
        : `${names[0]} +${names.length - 1} generated engine`;
      item.description = `${item.cards.length} deck cards connect to ${item.generated.length} generated cards.`;
    }
  }

  const knownSignatures = new Set(result.map(item => item.cards.map(card => card.id).sort((a, b) => a - b).join(",")));
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

    if (componentIds.length < 2 || componentIds.length > 12) continue;
    const component = sortCards(componentIds.map(id => state.cardMap.get(id)).filter(Boolean));
    const signature = component.map(item => item.id).sort((a, b) => a - b).join(",");
    if (knownSignatures.has(signature)) continue;

    const commonTrait = findCommonTrait(component);
    if (commonTrait && archetypes.some(archetype => archetype.name === commonTrait)) continue;

    knownSignatures.add(signature);
    result.push({
      kind: "detected",
      name: commonTrait ? `${commonTrait} linked package` : `${component[0].name} linked package`,
      cards: component,
      generated: [],
      signal: "Official relations",
      confidence: "Medium",
      description: `${component.length} deck cards form a connected component through official card relationships.`
    });
  }

  return result.map(withMetrics);
}

function buildCuratedPackages() {
  return state.packages.map(packageDef => {
    const entries = normalizePackageCards(packageDef.cards);
    const cards = entries
      .map(entry => ({ ...entry, card: state.cardMap.get(entry.id) }))
      .filter(entry => entry.card)
      .filter(entry => entry.card.class === state.selectedClass || (state.includeNeutral && entry.card.class === "Neutral"));

    return withMetrics({
      kind: "curated",
      id: packageDef.id,
      name: packageDef.name ?? packageDef.id ?? "Package",
      description: packageDef.description ?? "Curated card package.",
      entries: cards,
      cards: cards.map(entry => entry.card),
      signal: "Curated",
      confidence: "Curated"
    });
  }).filter(packageDef => packageDef.cards.length);
}

function withMetrics(item) {
  const deckCards = item.cards ?? [];
  const inDeck = deckCards.filter(card => Number(state.deck.get(card.id) ?? 0) > 0);
  const deckCopies = deckCards.reduce((sum, card) => sum + Number(state.deck.get(card.id) ?? 0), 0);
  const averageCost = deckCards.length
    ? deckCards.reduce((sum, card) => sum + Number(card.cost || 0), 0) / deckCards.length
    : 0;

  item.inDeckCards = inDeck.length;
  item.deckCopies = deckCopies;
  item.coverage = deckCards.length ? inDeck.length / deckCards.length : 0;
  item.averageCost = averageCost;
  item.typeCounts = countValues(deckCards.map(card => card.type));
  item.roleCounts = countValues(deckCards.flatMap(card => card.roles ?? []));
  item.keywordCounts = countValues(deckCards.flatMap(card => card.keywords ?? []));
  return item;
}

function refreshMetrics(item) {
  withMetrics(item);
  renderDialogStats(item);
  renderLists();
}

function renderLists() {
  const visibleArchetypes = prepareVisible(archetypes);
  const visibleDetected = prepareVisible(detectedPackages);
  const visibleCurated = prepareVisible(curatedPackages);

  els.archetypeSection.hidden = activeKind !== "all" && activeKind !== "archetype";
  els.detectedSection.hidden = activeKind !== "all" && activeKind !== "detected";
  els.curatedSection.hidden = activeKind !== "all" && activeKind !== "curated";

  renderEngineGrid(els.archetypes, visibleArchetypes, "No archetypes match this class or search.");
  renderEngineGrid(els.detected, visibleDetected, "No multi-card packages were detected for this class yet.");
  renderEngineGrid(els.curated, visibleCurated, "No curated packages for this class yet.");
  renderKindTabs();

  const allVisible = [
    ...(activeKind === "all" || activeKind === "archetype" ? visibleArchetypes : []),
    ...(activeKind === "all" || activeKind === "detected" ? visibleDetected : []),
    ...(activeKind === "all" || activeKind === "curated" ? visibleCurated : [])
  ];
  const covered = allVisible.filter(item => item.inDeckCards > 0).length;
  els.summary.textContent = `${allVisible.length} shown · ${covered} represented in deck`;
}

function renderKindTabs() {
  const counts = {
    all: archetypes.length + detectedPackages.length + curatedPackages.length,
    archetype: archetypes.length,
    detected: detectedPackages.length,
    curated: curatedPackages.length
  };

  els.kindTabs.querySelectorAll("[data-kind]").forEach(button => {
    button.classList.toggle("active", button.dataset.kind === activeKind);
    const label = button.dataset.kind === "all"
      ? "All"
      : button.dataset.kind === "archetype"
        ? "Archetypes"
        : button.dataset.kind === "detected"
          ? "Detected"
          : "Curated";
    button.innerHTML = `${label} <small>${counts[button.dataset.kind] ?? 0}</small>`;
  });
}

function prepareVisible(items) {
  return sortItems(items.filter(item => matchesQuery(item) && (!deckOnly || item.inDeckCards > 0)));
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    if (sortMode === "coverage") {
      return b.coverage - a.coverage || b.deckCopies - a.deckCopies || b.cards.length - a.cards.length || a.name.localeCompare(b.name);
    }
    if (sortMode === "name") return a.name.localeCompare(b.name);
    if (sortMode === "cost") return a.averageCost - b.averageCost || a.name.localeCompare(b.name);
    return b.cards.length - a.cards.length || a.name.localeCompare(b.name);
  });
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

    const confidenceClass = String(item.confidence ?? "").toLowerCase() === "strong" ? "strong" : "medium";
    const coveragePercent = Math.round(item.coverage * 100);
    button.innerHTML = `
      <div class="engine-card-thumbs">${thumbnails}</div>
      <div class="engine-card-copy">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(stats)}</span>
        <div class="engine-card-badges">
          <span class="engine-badge">${escapeHtml(item.signal ?? item.kind)}</span>
          ${item.kind === "detected" ? `<span class="engine-badge ${confidenceClass}">${escapeHtml(item.confidence)} signal</span>` : ""}
        </div>
        <div class="engine-coverage">
          <div class="engine-coverage-row"><span>Deck coverage</span><span>${item.inDeckCards}/${item.cards.length} cards · ${item.deckCopies} copies</span></div>
          <div class="engine-coverage-track"><div class="engine-coverage-fill" style="width:${coveragePercent}%"></div></div>
        </div>
      </div>
    `;
    button.addEventListener("click", () => openDetails(item));
    root.appendChild(button);
  }
}

function openDetails(item) {
  els.dialogTitle.textContent = item.name;
  els.dialogMeta.textContent = detailMeta(item);
  els.dialogContent.innerHTML = "";
  els.dialogActions.innerHTML = "";
  renderDialogStats(item);

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
    browse.textContent = "Show trait in Cards";
    browse.addEventListener("click", () => openArchetypeInCards(item.name));
    els.dialogActions.appendChild(browse);
  }

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "button";
  copy.textContent = "Copy card list";
  copy.addEventListener("click", async () => {
    const text = buildCopyList(item);
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = "Copied";
    } catch {
      copy.textContent = "Copy failed";
    }
    setTimeout(() => { copy.textContent = "Copy card list"; }, 1200);
  });
  els.dialogActions.appendChild(copy);

  const add = document.createElement("button");
  add.type = "button";
  add.className = "button";
  add.textContent = item.kind === "curated" ? "Add curated package" : "Add 1 each to workbench";
  add.addEventListener("click", () => {
    const entries = item.kind === "curated"
      ? item.entries.map(entry => ({ id: entry.id, count: entry.count }))
      : item.cards.map(card => ({ id: card.id, count: 1 }));
    const changed = addCards(entries, state.cardMap);
    add.textContent = changed ? "Added" : "Nothing to add";
    refreshMetrics(item);
    setTimeout(() => {
      add.textContent = item.kind === "curated" ? "Add curated package" : "Add 1 each to workbench";
    }, 1200);
  });
  els.dialogActions.appendChild(add);

  els.dialog.showModal();

  function appendCardGroup(title, cards, options = {}) {
    const section = document.createElement("section");
    section.className = "engine-detail-group";
    section.innerHTML = `<h3>${escapeHtml(title)}</h3>`;
    const grid = document.createElement("div");
    grid.className = "engine-detail-cards";

    for (const card of sortCards(cards)) {
      const roles = options.generated ? ["Generated"] : (card.roles ?? []);
      const qty = Number(state.deck.get(card.id) ?? 0);
      const article = document.createElement("article");
      article.className = "engine-detail-card";
      article.tabIndex = 0;
      article.setAttribute("role", "button");
      article.setAttribute("aria-expanded", "false");

      const curatedCount = item.kind === "curated" ? getCuratedCount(item, card.id) : 0;
      const reason = relationReason(item, card, options);
      article.innerHTML = `
        <img src="${escapeAttr(card.image)}" alt="${escapeAttr(card.name)}" loading="lazy">
        <div>
          <strong>${escapeHtml(card.name)}</strong>
          <span>Cost ${card.cost} · ${escapeHtml(card.type)} · ${escapeHtml(card.rarity)}</span>
          ${roles.length ? `<small>${escapeHtml(roles.join(" · "))}</small>` : ""}
          ${curatedCount ? `<small>Curated quantity: ×${curatedCount}</small>` : ""}
          ${reason ? `<div class="engine-reason">${escapeHtml(reason)}</div>` : ""}
        </div>
        ${qty ? `<span class="engine-card-qty">×${qty}</span>` : ""}
        <div class="engine-card-profile">
          <div class="engine-profile-meta">
            <span class="engine-badge">${escapeHtml(card.set)}</span>
            ${(card.traits ?? []).filter(value => value && value !== "-").map(value => `<span class="engine-badge">Trait: ${escapeHtml(value)}</span>`).join("")}
            ${(card.keywords ?? []).map(value => `<span class="engine-badge">${escapeHtml(value)}</span>`).join("")}
          </div>
          <p>${escapeHtml(card.text || "No effect text.")}</p>
        </div>
      `;

      const toggle = () => {
        article.classList.toggle("expanded");
        article.setAttribute("aria-expanded", article.classList.contains("expanded") ? "true" : "false");
      };
      article.addEventListener("click", toggle);
      article.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggle();
      });
      grid.appendChild(article);
    }

    section.appendChild(grid);
    els.dialogContent.appendChild(section);
  }
}

function renderDialogStats(item) {
  const types = Object.entries(item.typeCounts ?? {}).sort((a, b) => b[1] - a[1]).map(([name, count]) => `${count} ${name}`).join(" · ") || "—";
  const topRoles = topCounts(item.roleCounts, 6);
  const topKeywords = topCounts(item.keywordCounts, 6);

  els.dialogStats.innerHTML = `
    <div class="engine-stat"><strong>${item.cards.length}</strong><span>Deck cards</span></div>
    <div class="engine-stat"><strong>${item.inDeckCards}/${item.cards.length}</strong><span>Present in deck</span></div>
    <div class="engine-stat"><strong>${item.deckCopies}</strong><span>Copies in deck</span></div>
    <div class="engine-stat"><strong>${item.averageCost.toFixed(1)}</strong><span>Average cost</span></div>
    <div class="engine-stat wide"><strong>${escapeHtml(types)}</strong><span>Card types</span></div>
    ${topRoles.length ? `<div class="engine-stat wide"><span>Roles</span><div class="engine-stat-chips">${topRoles.map(([name, count]) => `<span class="engine-badge">${escapeHtml(name)} ${count}</span>`).join("")}</div></div>` : ""}
    ${topKeywords.length ? `<div class="engine-stat wide"><span>Keywords</span><div class="engine-stat-chips">${topKeywords.map(([name, count]) => `<span class="engine-badge">${escapeHtml(name)} ${count}</span>`).join("")}</div></div>` : ""}
  `;
}

function detailMeta(item) {
  if (item.kind === "archetype") return `Shared trait · ${item.description}`;
  if (item.kind === "curated") return `Curated package · ${item.description}`;
  return `${item.confidence} detection · ${item.signal} · ${item.description}`;
}

function relationReason(item, card, options = {}) {
  if (options.generated) {
    const parents = card.generatedBy?.filter(id => item.cards.some(candidate => candidate.id === Number(id))) ?? [];
    return parents.length ? `Generated by ${parents.length} card${parents.length === 1 ? "" : "s"} in this engine.` : "Generated / token card.";
  }
  if (item.kind === "archetype") return `Included because it has the ${item.name} trait.`;
  if (item.kind === "curated") return "Included by the curated package definition.";

  const linkedTokens = (item.generated ?? []).filter(token =>
    (card.relations ?? []).some(relation => Number(relation.id) === token.id) ||
    (token.generatedBy ?? []).includes(card.id)
  );
  if (linkedTokens.length) {
    const generatedNames = linkedTokens.filter(token =>
      (card.relations ?? []).some(relation => Number(relation.id) === token.id && relation.type === "Generates") ||
      (token.generatedBy ?? []).includes(card.id)
    ).map(token => token.name);
    if (generatedNames.length) return `Generates: ${generatedNames.join(", ")}.`;
    return `References: ${linkedTokens.map(token => token.name).join(", ")}.`;
  }
  return "Connected through an official card relation.";
}

function getCuratedCount(item, cardId) {
  return Number(item.entries?.find(entry => Number(entry.id) === Number(cardId))?.count ?? 0);
}

function buildCopyList(item) {
  const lines = [];
  for (const card of sortCards(item.cards)) {
    const count = item.kind === "curated" ? Math.max(1, getCuratedCount(item, card.id)) : 1;
    lines.push(`${count}x ${card.name}`);
  }
  if (item.generated?.length) {
    lines.push("", "Generated cards:");
    for (const card of sortCards(item.generated)) lines.push(`- ${card.name}`);
  }
  return lines.join("\n");
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
    item.signal,
    item.confidence,
    ...item.cards.flatMap(card => [card.name, card.text, card.set, ...(card.traits ?? []), ...(card.keywords ?? []), ...(card.roles ?? [])]),
    ...(item.generated ?? []).flatMap(card => [card.name, card.text, ...(card.keywords ?? [])])
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function countValues(values) {
  const result = {};
  for (const value of values) {
    if (!value || value === "-") continue;
    result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}

function topCounts(counts, limit) {
  return Object.entries(counts ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
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
