import { state, resetFilters } from "./state.js";
import { loadData } from "./data-loader.js";
import { CLASSES, filteredCards } from "./filters.js";
import { renderCardGrid } from "./card-grid.js";
import {
  addCard,
  addCards,
  removeCard,
  clearDeck,
  getDeckSize,
  setDeckMark,
  undoDeck,
  redoDeck,
  saveVariant,
  loadVariant,
  deleteVariant,
  getVariant
} from "./deck.js";
import {
  loadWorkspace,
  applyWorkspace,
  saveWorkspace,
  exportCurrentDeck,
  importDeckPayload,
  encodeSharePayload,
  decodeSharePayload
} from "./storage.js";
import { analyzeDeck, compareDecks } from "./analysis.js";

const els = {
  classFilter: document.getElementById("class-filter"),
  search: document.getElementById("search-input"),
  setFilter: document.getElementById("set-filter"),
  typeFilter: document.getElementById("type-filter"),
  rarityFilter: document.getElementById("rarity-filter"),
  traitFilter: document.getElementById("trait-filter"),
  keywordFilter: document.getElementById("keyword-filter"),
  favoritesOnly: document.getElementById("favorites-only"),
  showGenerated: document.getElementById("show-generated"),
  showExcluded: document.getElementById("show-excluded"),
  archetypes: document.getElementById("archetype-browser"),
  packages: document.getElementById("package-browser"),
  grid: document.getElementById("card-grid"),
  resultsCount: document.getElementById("results-count"),
  discoverStatus: document.getElementById("discover-status"),
  discoverLabel: document.getElementById("discover-label"),
  clearDiscover: document.getElementById("clear-discover"),
  deckList: document.getElementById("deck-list"),
  deckCount: document.getElementById("deck-count"),
  deckAnalysis: document.getElementById("deck-analysis"),
  savedDecks: document.getElementById("saved-decks"),
  variantName: document.getElementById("variant-name"),
  saveVariant: document.getElementById("save-variant"),
  openCompare: document.getElementById("open-compare"),
  clearDeck: document.getElementById("clear-deck"),
  undoDeck: document.getElementById("undo-deck"),
  redoDeck: document.getElementById("redo-deck"),
  resetFilters: document.getElementById("reset-filters"),
  openIo: document.getElementById("open-io"),
  ioDialog: document.getElementById("io-dialog"),
  ioText: document.getElementById("io-text"),
  exportDeck: document.getElementById("export-deck"),
  importDeck: document.getElementById("import-deck"),
  copyShareLink: document.getElementById("copy-share-link"),
  compareDialog: document.getElementById("compare-dialog"),
  compareLeft: document.getElementById("compare-left"),
  compareRight: document.getElementById("compare-right"),
  compareResults: document.getElementById("compare-results"),
  packageDialog: document.getElementById("package-dialog"),
  packageDialogTitle: document.getElementById("package-dialog-title"),
  packageDialogDescription: document.getElementById("package-dialog-description"),
  packageDialogCards: document.getElementById("package-dialog-cards"),
  confirmPackage: document.getElementById("confirm-package"),
  toolbar: document.querySelector(".content-toolbar")
};

let pendingPackage = null;
let pendingPackageTrigger = null;

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
    loadSharedDeckFromHash();
    sanitizeDeck();

    setupCardSizeControl();
    bindEvents();
    renderEverything();
  } catch (error) {
    console.error(error);
    els.grid.innerHTML = `
      <div>
        <h2>Unable to load the card database</h2>
        <p class="muted">Check the browser console for details.</p>
      </div>
    `;
  }
}

function bindEvents() {
  els.search.addEventListener("input", event => {
    state.search = event.target.value;
    state.discoverCardId = null;
    renderCards();
  });

  els.favoritesOnly.addEventListener("change", () => {
    state.favoritesOnly = els.favoritesOnly.checked;
    persist();
    renderCards();
  });

  els.showGenerated.addEventListener("change", () => {
    state.showGenerated = els.showGenerated.checked;
    persist();
    renderCards();
  });

  els.showExcluded.addEventListener("change", () => {
    state.showExcluded = els.showExcluded.checked;
    persist();
    renderCards();
  });

  els.clearDeck.addEventListener("click", () => {
    clearDeck();
    renderEverything();
  });

  els.undoDeck.addEventListener("click", () => {
    if (undoDeck()) renderEverything();
  });

  els.redoDeck.addEventListener("click", () => {
    if (redoDeck()) renderEverything();
  });

  els.resetFilters.addEventListener("click", () => {
    resetFilters();
    els.search.value = "";
    renderEverything();
  });

  els.clearDiscover.addEventListener("click", () => {
    state.discoverCardId = null;
    renderCards();
  });

  document.querySelectorAll(".deck-tab-button").forEach(button => {
    button.addEventListener("click", () => activateDeckTab(button.dataset.tab));
  });

  els.saveVariant.addEventListener("click", () => {
    if (saveVariant(els.variantName.value)) {
      els.variantName.value = "";
      renderSavedDecks();
    }
  });

  els.openCompare.addEventListener("click", () => {
    populateCompareSelects();
    renderComparison();
    els.compareDialog.showModal();
  });

  els.compareLeft.addEventListener("change", renderComparison);
  els.compareRight.addEventListener("change", renderComparison);

  els.openIo.addEventListener("click", () => {
    els.ioText.value = JSON.stringify(exportCurrentDeck(state), null, 2);
    els.ioDialog.showModal();
  });

  els.exportDeck.addEventListener("click", () => {
    els.ioText.value = JSON.stringify(exportCurrentDeck(state), null, 2);
  });

  els.importDeck.addEventListener("click", () => {
    try {
      const payload = JSON.parse(els.ioText.value);
      importDeckPayload(state, payload);
      sanitizeDeck();
      state.history.length = 0;
      state.future.length = 0;
      persist();
      renderEverything();
      els.ioDialog.close();
    } catch (error) {
      els.ioText.value = `Invalid JSON: ${error.message}`;
    }
  });

  els.copyShareLink.addEventListener("click", async () => {
    const base = `${location.origin}${location.pathname}`;
    const url = `${base}#deck=${encodeSharePayload(state)}`;
    await navigator.clipboard.writeText(url);
    els.copyShareLink.textContent = "Copied";
    setTimeout(() => { els.copyShareLink.textContent = "Copy share link"; }, 1200);
  });

  document.querySelectorAll("[data-close-dialog]").forEach(button => {
    button.addEventListener("click", () => document.getElementById(button.dataset.closeDialog)?.close());
  });

  els.confirmPackage.addEventListener("click", confirmPendingPackage);
}

function setupCardSizeControl() {
  if (!els.toolbar || document.getElementById("card-size")) return;

  const saved = Number(localStorage.getItem("svwb-card-size")) || 118;
  document.documentElement.style.setProperty("--card-width", `${saved}px`);

  const control = document.createElement("label");
  control.className = "card-size-control";
  control.innerHTML = `
    <span>Card size</span>
    <input id="card-size" type="range" min="74" max="190" step="4" value="${saved}">
  `;

  els.toolbar.insertBefore(control, els.resetFilters);
  control.querySelector("input").addEventListener("input", event => {
    const value = Number(event.target.value);
    document.documentElement.style.setProperty("--card-width", `${value}px`);
    localStorage.setItem("svwb-card-size", String(value));
  });
}

function renderEverything() {
  syncControls();
  renderClassFilter();
  renderFilterGroups();
  renderArchetypes();
  renderPackageBrowser();
  renderCards();
  renderDeck();
  renderAnalysis();
  renderSavedDecks();
  updateHistoryButtons();
}

function syncControls() {
  els.search.value = state.search;
  els.favoritesOnly.checked = state.favoritesOnly;
  els.showGenerated.checked = state.showGenerated;
  els.showExcluded.checked = state.showExcluded;
}

function renderClassFilter() {
  els.classFilter.innerHTML = "";

  for (const className of CLASSES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "class-button";
    button.textContent = className;
    button.classList.toggle("active", className === state.selectedClass);
    button.addEventListener("click", () => {
      state.selectedClass = className;
      state.discoverCardId = null;
      persist();
      renderEverything();
    });
    els.classFilter.appendChild(button);
  }

  const neutral = document.createElement("label");
  neutral.className = "neutral-toggle";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.includeNeutral;
  checkbox.addEventListener("change", () => {
    state.includeNeutral = checkbox.checked;
    state.discoverCardId = null;
    persist();
    renderEverything();
  });
  neutral.append(checkbox, document.createTextNode(" Include Neutral"));
  els.classFilter.appendChild(neutral);
}

function renderFilterGroups() {
  const available = state.cards.filter(card =>
    card.class === state.selectedClass ||
    (state.includeNeutral && card.class === "Neutral")
  );

  renderCheckboxGroup(els.setFilter, "Set", unique(available.map(card => card.set)), state.filters.sets);
  renderCheckboxGroup(els.typeFilter, "Type", unique(available.map(card => card.type)), state.filters.types);
  renderCheckboxGroup(els.rarityFilter, "Rarity", unique(available.map(card => card.rarity)), state.filters.rarities);
  renderCheckboxGroup(els.traitFilter, "Trait", unique(available.flatMap(card => card.traits ?? [])), state.filters.traits);
  renderCheckboxGroup(els.keywordFilter, "Keyword", unique(available.flatMap(card => card.keywords ?? [])), state.filters.keywords);
}

function renderCheckboxGroup(root, title, values, targetSet) {
  root.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "filter-group";
  wrapper.innerHTML = `<div class="filter-group-title"><strong>${title}</strong><span>${values.length}</span></div>`;

  const options = document.createElement("div");
  options.className = "filter-options";

  for (const value of values) {
    if (!value || value === "-") continue;
    const label = document.createElement("label");
    label.className = "filter-option";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = targetSet.has(value);
    input.addEventListener("change", () => {
      if (input.checked) targetSet.add(value);
      else targetSet.delete(value);
      renderCards();
      renderArchetypes();
    });

    label.append(input, document.createTextNode(value));
    options.appendChild(label);
  }

  wrapper.appendChild(options);
  root.appendChild(wrapper);
}

function renderArchetypes() {
  const counts = new Map();
  for (const card of state.cards) {
    if (card.class !== state.selectedClass && !(state.includeNeutral && card.class === "Neutral")) continue;
    if (!card.deckSelectable) continue;
    for (const trait of card.traits ?? []) {
      if (!trait || trait === "-") continue;
      counts.set(trait, (counts.get(trait) ?? 0) + 1);
    }
  }

  const traits = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 16);
  els.archetypes.innerHTML = traits.length ? "" : `<span class="muted">No traits for this class.</span>`;

  for (const [trait, count] of traits) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "compact-button";
    button.classList.toggle("active", state.filters.traits.has(trait));
    button.innerHTML = `${escapeHtml(trait)} <small>${count} cards</small>`;
    button.addEventListener("click", () => {
      if (state.filters.traits.has(trait)) state.filters.traits.delete(trait);
      else state.filters.traits.add(trait);
      renderFilterGroups();
      renderArchetypes();
      renderCards();
    });
    els.archetypes.appendChild(button);
  }
}

function renderPackageBrowser() {
  const relevant = state.packages.filter(packageDef => {
    const cards = normalizePackageCards(packageDef.cards).map(entry => state.cardMap.get(entry.id)).filter(Boolean);
    return cards.some(card => card.class === state.selectedClass || (state.includeNeutral && card.class === "Neutral"));
  });

  els.packages.innerHTML = relevant.length ? "" : `<span class="muted">No curated packages yet.</span>`;
  for (const packageDef of relevant) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "compact-button";
    const count = normalizePackageCards(packageDef.cards).length;
    button.innerHTML = `${escapeHtml(packageDef.name ?? packageDef.id)} <small>${count} cards</small>`;
    button.addEventListener("click", () => openPackageDialog(packageDef, null));
    els.packages.appendChild(button);
  }
}

function renderCards() {
  const cards = filteredCards();
  els.resultsCount.textContent = `${cards.length} card${cards.length === 1 ? "" : "s"}`;

  const discoverCard = state.discoverCardId ? state.cardMap.get(Number(state.discoverCardId)) : null;
  els.discoverStatus.hidden = !discoverCard;
  if (discoverCard) els.discoverLabel.textContent = `Discover: ${discoverCard.name}`;

  renderCardGrid(els.grid, cards, {
    getQuantity: card => state.deck.get(card.id) ?? 0,
    getOwned: card => state.owned.get(card.id) ?? 0,
    isFavorite: card => state.favorites.has(card.id),
    isExcluded: card => state.excluded.has(card.id) || state.globalExclusions.has(card.id),
    getCardById: id => state.cardMap.get(Number(id)) ?? null,
    getRelatedGroups,
    getPackagesForCard,
    onAdd: handleCardAdd,
    onRemove(card) {
      if (removeCard(card)) renderEverything();
    },
    onToggleFavorite(card) {
      if (state.favorites.has(card.id)) state.favorites.delete(card.id);
      else state.favorites.add(card.id);
      persist();
      renderCards();
    },
    onToggleExclude(card) {
      if (state.excluded.has(card.id)) state.excluded.delete(card.id);
      else state.excluded.add(card.id);
      persist();
      renderCards();
    },
    onOwnedChange(card, delta) {
      const next = Math.max(0, (state.owned.get(card.id) ?? 0) + Number(delta));
      if (next === 0) state.owned.delete(card.id);
      else state.owned.set(card.id, next);
      persist();
      renderCards();
      renderDeck();
    },
    onDiscover(card) {
      state.discoverCardId = card.id;
      renderCards();
    },
    onFindLinked(card) {
      state.discoverCardId = null;
      state.search = `related:"${card.name}"`;
      els.search.value = state.search;
      renderCards();
    },
    onAddPackage: openPackageDialog
  });
}

function handleCardAdd(card) {
  const packages = getPackagesForCard(card).filter(packageDef => packageDef.promptOnAdd !== false);
  if (packages.length) {
    openPackageDialog(packages[0], card);
    return;
  }

  if (addCard(card)) renderEverything();
}

function getRelatedGroups(card) {
  const groups = [];
  const seen = new Set([card.id]);

  const generated = relationCards(card, "Generates", seen);
  if (generated.length) groups.push({ title: "Generated cards", cards: generated });

  const generatedBy = (card.generatedBy ?? []).map(id => state.cardMap.get(Number(id))).filter(Boolean).filter(uniqueCard(seen));
  if (generatedBy.length) groups.push({ title: "Generated by", cards: generatedBy });

  const direct = relationCards(card, "Direct relation", seen);
  if (direct.length) groups.push({ title: "Direct relations", cards: direct });

  const packageCards = [];
  for (const packageDef of getPackagesForCard(card)) {
    for (const entry of normalizePackageCards(packageDef.cards)) {
      const candidate = state.cardMap.get(entry.id);
      if (candidate && candidate.id !== card.id && !seen.has(candidate.id)) {
        seen.add(candidate.id);
        packageCards.push(candidate);
      }
    }
  }
  if (packageCards.length) groups.push({ title: "Common package", cards: packageCards.slice(0, 10) });

  const traits = new Set((card.traits ?? []).filter(trait => trait && trait !== "-"));
  if (traits.size) {
    const sameArchetype = state.cards
      .filter(candidate => candidate.id !== card.id && candidate.deckSelectable)
      .map(candidate => ({
        card: candidate,
        score: (candidate.traits ?? []).filter(trait => traits.has(trait)).length
      }))
      .filter(item => item.score > 0 && !seen.has(item.card.id))
      .sort((a, b) => b.score - a.score || a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name))
      .slice(0, 8)
      .map(item => item.card);
    if (sameArchetype.length) groups.push({ title: "Same archetype", cards: sameArchetype });
  }

  return groups;
}

function relationCards(card, type, seen) {
  return (card.relations ?? [])
    .filter(relation => relation.type === type)
    .map(relation => state.cardMap.get(Number(relation.id)))
    .filter(Boolean)
    .filter(uniqueCard(seen));
}

function uniqueCard(seen) {
  return card => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  };
}

function getPackagesForCard(card) {
  const packageIds = new Set(card.packages ?? []);
  return state.packages.filter(packageDef => packageIds.has(String(packageDef.id ?? packageDef.name)));
}

function renderDeck() {
  els.deckCount.textContent = `${getDeckSize()} / 40`;
  els.deckList.innerHTML = "";

  const rows = Array.from(state.deck.entries())
    .map(([id, qty]) => ({ card: state.cardMap.get(Number(id)), qty: Number(qty) }))
    .filter(item => item.card)
    .sort((a, b) => a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name));

  for (const { card, qty } of rows) {
    const row = document.createElement("div");
    row.className = "deck-row";
    const owned = state.owned.get(card.id) ?? 0;
    const mark = state.deckMarks.get(card.id) ?? "";

    row.innerHTML = `
      <img src="${escapeAttr(card.image)}" alt="">
      <div class="deck-row-title">
        <strong>${escapeHtml(card.name)}</strong>
        <div class="deck-row-meta">
          <span class="muted">Cost ${card.cost}</span>
          <span class="deck-owned">Owned ${owned}/${qty}</span>
        </div>
        <select class="deck-mark-select" aria-label="Deck role">
          <option value="" ${mark === "" ? "selected" : ""}>Unmarked</option>
          <option value="Core" ${mark === "Core" ? "selected" : ""}>Core</option>
          <option value="Optional" ${mark === "Optional" ? "selected" : ""}>Optional</option>
          <option value="Tech" ${mark === "Tech" ? "selected" : ""}>Tech</option>
        </select>
      </div>
      <div class="deck-controls">
        <button data-action="minus" type="button">−</button>
        <span>${qty}x</span>
        <button data-action="plus" type="button">+</button>
      </div>
    `;

    row.querySelector('[data-action="minus"]').addEventListener("click", () => {
      removeCard(card);
      renderEverything();
    });

    row.querySelector('[data-action="plus"]').addEventListener("click", () => {
      addCard(card);
      renderEverything();
    });

    row.querySelector(".deck-mark-select").addEventListener("change", event => {
      setDeckMark(card.id, event.target.value);
      renderSavedDecks();
    });

    els.deckList.appendChild(row);
  }
}

function renderAnalysis() {
  const analysis = analyzeDeck(state.cards, state.deck, state.cardMap);
  const maxCurve = Math.max(1, ...analysis.curve);

  const types = Object.fromEntries(analysis.types);
  els.deckAnalysis.innerHTML = `
    <div class="analysis-section">
      <h3>Overview</h3>
      <div class="analysis-grid">
        <div class="analysis-card"><strong>${analysis.size}/40</strong>Cards</div>
        <div class="analysis-card"><strong>${types.Follower ?? 0}</strong>Followers</div>
        <div class="analysis-card"><strong>${types.Spell ?? 0}</strong>Spells</div>
        <div class="analysis-card"><strong>${types.Amulet ?? 0}</strong>Amulets</div>
      </div>
    </div>

    <div class="analysis-section">
      <h3>Mana curve</h3>
      ${analysis.curve.map((count, cost) => `
        <div class="curve-row">
          <span>${cost === 10 ? "10+" : cost}</span>
          <div class="curve-bar"><span style="width:${Math.round(count / maxCurve * 100)}%"></span></div>
          <strong>${count}</strong>
        </div>
      `).join("")}
    </div>

    <div class="analysis-section">
      <h3>Functional roles</h3>
      <div class="analysis-chip-list">
        ${analysis.roles.length ? analysis.roles.map(([name, count]) => `<span class="analysis-chip">${escapeHtml(name)} ${count}</span>`).join("") : `<span class="muted">No roles detected yet.</span>`}
      </div>
    </div>

    <div class="analysis-section">
      <h3>Keywords</h3>
      <div class="analysis-chip-list">
        ${analysis.keywords.slice(0, 18).map(([name, count]) => `<span class="analysis-chip">${escapeHtml(name)} ${count}</span>`).join("") || `<span class="muted">None</span>`}
      </div>
    </div>

    <div class="analysis-section">
      <h3>Checks</h3>
      ${analysis.warnings.length ? analysis.warnings.map(item => `<div class="analysis-warning ${item.level}">${escapeHtml(item.text)}</div>`).join("") : `<div class="analysis-warning info">No basic warnings detected.</div>`}
    </div>

    <div class="analysis-section">
      <h3>Generated-card dependencies</h3>
      ${analysis.dependencies.length ? analysis.dependencies.map(item => `
        <div class="dependency-item">
          <strong>${escapeHtml(item.card.name)}</strong>
          <div>${item.producerCopies} producer copies · ${item.consumers.reduce((sum, entry) => sum + entry.qty, 0)} other mentions</div>
          <div class="muted">Produced by: ${item.producers.map(entry => `${escapeHtml(entry.card.name)} ×${entry.qty}`).join(", ")}</div>
          ${item.consumers.length ? `<div class="muted">Also used by: ${item.consumers.map(entry => `${escapeHtml(entry.card.name)} ×${entry.qty}`).join(", ")}</div>` : ""}
        </div>
      `).join("") : `<span class="muted">No generated-card dependency detected in the current deck.</span>`}
    </div>
  `;
}

function renderSavedDecks() {
  const entries = Object.entries(state.savedDecks).sort((a, b) => a[0].localeCompare(b[0]));
  els.savedDecks.innerHTML = entries.length ? "" : `<span class="muted">No saved variants.</span>`;

  for (const [name, variant] of entries) {
    const size = (variant.deck ?? []).reduce((sum, [, qty]) => sum + Number(qty), 0);
    const item = document.createElement("div");
    item.className = "saved-deck-item";
    item.innerHTML = `
      <strong>${escapeHtml(name)}</strong>
      <div class="muted">${escapeHtml(variant.class ?? "Unknown")} · ${size}/40</div>
      <div class="saved-deck-actions">
        <button data-action="load" type="button">Load</button>
        <button data-action="delete" type="button">Delete</button>
      </div>
    `;

    item.querySelector('[data-action="load"]').addEventListener("click", () => {
      loadVariant(name);
      renderEverything();
    });

    item.querySelector('[data-action="delete"]').addEventListener("click", () => {
      deleteVariant(name);
      renderSavedDecks();
    });

    els.savedDecks.appendChild(item);
  }
}

function populateCompareSelects() {
  const names = ["__current__", ...Object.keys(state.savedDecks).sort()];
  const options = names.map(name => `<option value="${escapeAttr(name)}">${name === "__current__" ? "Current" : escapeHtml(name)}</option>`).join("");
  els.compareLeft.innerHTML = options;
  els.compareRight.innerHTML = options;
  if (names.length > 1) els.compareRight.value = names[1];
}

function renderComparison() {
  const left = getVariant(els.compareLeft.value);
  const right = getVariant(els.compareRight.value);
  const changes = compareDecks(left, right, state.cardMap);

  els.compareResults.innerHTML = changes.length ? `
    <div class="compare-row"><strong>Card</strong><strong>${escapeHtml(left?.name ?? "Left")}</strong><strong>${escapeHtml(right?.name ?? "Right")}</strong></div>
    ${changes.map(change => `
      <div class="compare-row">
        <span>${escapeHtml(change.card.name)}</span>
        <span>${change.left}</span>
        <span>${change.right}</span>
      </div>
    `).join("")}
  ` : `<p class="muted">No differences.</p>`;
}

function activateDeckTab(name) {
  document.querySelectorAll(".deck-tab-button").forEach(button => button.classList.toggle("active", button.dataset.tab === name));
  document.querySelectorAll(".deck-tab-content").forEach(panel => panel.classList.toggle("active", panel.id === `${name}-tab`));
}

function openPackageDialog(packageDef, triggerCard = null) {
  pendingPackage = packageDef;
  pendingPackageTrigger = triggerCard;
  const entries = normalizePackageCards(packageDef.cards);

  els.packageDialogTitle.textContent = packageDef.name ?? packageDef.id ?? "Add package";
  els.packageDialogDescription.textContent = packageDef.description ?? (triggerCard ? `Related package detected for ${triggerCard.name}.` : "Select the cards to add.");
  els.packageDialogCards.innerHTML = "";

  for (const entry of entries) {
    const card = state.cardMap.get(entry.id);
    if (!card?.deckSelectable) continue;
    const row = document.createElement("label");
    row.className = "package-dialog-card";
    row.innerHTML = `
      <input type="checkbox" data-package-card="${card.id}" checked>
      <img src="${escapeAttr(card.image)}" alt="">
      <span>${escapeHtml(card.name)}</span>
      <input type="number" min="1" max="${card.maxCopies ?? 3}" value="${entry.count}" data-package-count="${card.id}">
    `;
    els.packageDialogCards.appendChild(row);
  }

  els.packageDialog.showModal();
}

function confirmPendingPackage() {
  if (!pendingPackage) return;
  const entries = [];

  els.packageDialogCards.querySelectorAll("[data-package-card]").forEach(checkbox => {
    if (!checkbox.checked) return;
    const id = Number(checkbox.dataset.packageCard);
    const countInput = els.packageDialogCards.querySelector(`[data-package-count="${id}"]`);
    entries.push({ id, count: Number(countInput?.value ?? 1) });
  });

  if (entries.length) addCards(entries, state.cardMap);
  else if (pendingPackageTrigger?.deckSelectable) addCard(pendingPackageTrigger);

  pendingPackage = null;
  pendingPackageTrigger = null;
  els.packageDialog.close();
  renderEverything();
}

function normalizePackageCards(cards) {
  return (cards ?? []).map(entry => {
    if (typeof entry === "number" || typeof entry === "string") return { id: Number(entry), count: 1 };
    return { id: Number(entry.id), count: Number(entry.count ?? entry.quantity ?? 1) };
  }).filter(entry => Number.isFinite(entry.id));
}

function updateHistoryButtons() {
  els.undoDeck.disabled = state.history.length === 0;
  els.redoDeck.disabled = state.future.length === 0;
}

function sanitizeDeck() {
  const clean = new Map();
  let remaining = 40;

  for (const [idValue, qtyValue] of state.deck.entries()) {
    const id = Number(idValue);
    const card = state.cardMap.get(id);
    if (!card?.deckSelectable || remaining <= 0) continue;
    const qty = Math.max(0, Math.min(Number(qtyValue) || 0, Number(card.maxCopies ?? 3), remaining));
    if (qty > 0) {
      clean.set(id, qty);
      remaining -= qty;
    }
  }

  state.deck = clean;
  for (const id of [...state.deckMarks.keys()]) if (!state.deck.has(Number(id))) state.deckMarks.delete(id);
  persist();
}

function loadSharedDeckFromHash() {
  const match = location.hash.match(/^#deck=(.+)$/);
  if (!match) return;
  const payload = decodeSharePayload(match[1]);
  if (payload) importDeckPayload(state, payload);
}

function persist() {
  saveWorkspace(state);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
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
