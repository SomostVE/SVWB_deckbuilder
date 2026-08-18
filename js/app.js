import { state, resetFilters } from "./state.js";
import { loadData } from "./data-loader.js";
import { CLASSES, filteredCards, pruneUnavailableFilters } from "./filters.js";
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
import { setupQol } from "./qol.js";
import { setupCollectionUI } from "./collection.js";

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
  showUnavailable: document.getElementById("show-unavailable"),
  archetypes: document.getElementById("archetype-browser"),
  packages: document.getElementById("package-browser"),
  grid: document.getElementById("card-grid"),
  resultsCount: document.getElementById("results-count"),
  costFilter: document.getElementById("cost-filter"),
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
  toolbar: document.querySelector(".content-toolbar"),
  cardSizeSlot: document.getElementById("card-size-control-slot")
};

let pendingPackage = null;
let pendingPackageTrigger = null;
let qol = null;
let collectionUi = null;

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
    qol = setupQol({ state, renderEverything, renderCards, undoDeck, redoDeck });
    pruneUnavailableFilters();
    qol?.saveCurrentClassFilters();
    collectionUi = setupCollectionUI({ state, renderEverything });
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
    qol?.renderActiveFilters?.();
  });

  els.favoritesOnly.addEventListener("change", () => {
    state.favoritesOnly = els.favoritesOnly.checked;
    persist();
    refreshFilterView();
  });

  els.showGenerated.addEventListener("change", () => {
    state.showGenerated = els.showGenerated.checked;
    persist();
    refreshFilterView();
  });

  els.showExcluded.addEventListener("change", () => {
    state.showExcluded = els.showExcluded.checked;
    persist();
    refreshFilterView();
  });

  els.showUnavailable.addEventListener("change", () => {
    state.showUnavailableFilters = els.showUnavailable.checked;
    persist();
    renderEverything();
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
    qol?.saveCurrentClassFilters();
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

  if (els.cardSizeSlot) els.cardSizeSlot.appendChild(control);
  else els.toolbar.insertBefore(control, els.resetFilters);

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
  renderCostFilter();
  renderCards();
  renderDeck();
  renderAnalysis();
  collectionUi?.render();
  renderSavedDecks();
  updateHistoryButtons();
  qol?.render();
}

function refreshFilterView() {
  renderFilterGroups();
  renderArchetypes();
  renderCostFilter();
  renderCards();
  qol?.render();
}

function syncControls() {
  els.search.value = state.search;
  els.favoritesOnly.checked = state.favoritesOnly;
  els.showGenerated.checked = state.showGenerated;
  els.showExcluded.checked = state.showExcluded;
  els.showUnavailable.checked = state.showUnavailableFilters;
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

    const icon = document.createElement("img");
    icon.src = CLASS_ICON_URLS[className];
    icon.alt = "";
    icon.draggable = false;
    button.appendChild(icon);

    button.addEventListener("click", () => {
      state.selectedClass = className;
      state.discoverCardId = null;
      pruneUnavailableFilters();
      qol?.saveCurrentClassFilters();
      persist();
      renderEverything();
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
    state.discoverCardId = null;
    pruneUnavailableFilters();
    qol?.saveCurrentClassFilters();
    persist();
    renderEverything();
  });

  const icon = document.createElement("img");
  icon.src = CLASS_ICON_URLS.Neutral;
  icon.alt = "";
  icon.draggable = false;

  neutral.append(checkbox, icon);
  els.classFilter.appendChild(neutral);
}

function renderFilterGroups() {
  const available = state.cards.filter(card =>
    card.class === state.selectedClass ||
    (state.includeNeutral && card.class === "Neutral")
  );

  renderCheckboxGroup(els.setFilter, "Set", unique(available.map(card => card.set)), state.filters.sets);
  renderCheckboxGroup(els.typeFilter, "Type", unique(available.map(card => card.type)), state.filters.types);
  renderCheckboxGroup(els.rarityFilter, "Rarity", ["Bronze", "Silver", "Gold", "Legendary"].filter(value => available.some(card => card.rarity === value)), state.filters.rarities);
  renderCheckboxGroup(els.traitFilter, "Trait", unique(available.flatMap(card => card.traits ?? [])), state.filters.traits);
  renderCheckboxGroup(els.keywordFilter, "Keyword", unique(available.flatMap(card => card.keywords ?? [])), state.filters.keywords);
}

function renderCheckboxGroup(root, title, values, targetSet) {
  root.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "filter-group";

  const titleRow = document.createElement("div");
  titleRow.className = "filter-group-title";
  titleRow.innerHTML = `<strong>${title}</strong><span>${values.length}</span>`;
  if (targetSet.size) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "filter-group-clear";
    clear.textContent = "Clear ×";
    clear.addEventListener("click", () => {
      targetSet.clear();
      qol?.saveCurrentClassFilters();
      renderEverything();
    });
    titleRow.appendChild(clear);
  }
  wrapper.appendChild(titleRow);

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
      qol?.saveCurrentClassFilters();
      refreshFilterView();
    });

    const count = getFilterOptionResultCount(title, value, targetSet);
    if (!state.showUnavailableFilters && count === 0 && !targetSet.has(value)) continue;

    label.append(input, document.createTextNode(value));
    const countSpan = document.createElement("span");
    countSpan.className = "filter-option-count";
    countSpan.textContent = String(count);
    label.appendChild(countSpan);
    options.appendChild(label);
  }

  wrapper.appendChild(options);
  root.appendChild(wrapper);
}

function getFilterOptionResultCount(title, value, targetSet) {
  const original = [...targetSet];
  const andGroup = title === "Trait" || title === "Keyword";
  targetSet.clear();

  if (andGroup) {
    for (const selected of original) targetSet.add(selected);
    targetSet.add(value);
  } else {
    targetSet.add(value);
  }

  const count = filteredCards().length;
  targetSet.clear();
  for (const selected of original) targetSet.add(selected);
  return count;
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
      qol?.saveCurrentClassFilters();
      refreshFilterView();
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

function renderCostFilter() {
  if (!els.costFilter) return;
  const buckets = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"];
  els.costFilter.innerHTML = "";

  for (const bucket of buckets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cost-button";
    const count = getCostResultCount(bucket);
    button.innerHTML = `<span>${bucket}</span><small>${count}</small>`;
    button.classList.toggle("active", state.filters.costs.has(bucket));
    button.disabled = count === 0 && !state.filters.costs.has(bucket) && !state.showUnavailableFilters;
    if (button.disabled) button.hidden = true;
    button.addEventListener("click", () => {
      if (state.filters.costs.has(bucket)) state.filters.costs.delete(bucket);
      else state.filters.costs.add(bucket);
      qol?.saveCurrentClassFilters();
      renderEverything();
    });
    els.costFilter.appendChild(button);
  }

  if (state.filters.costs.size) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "cost-clear";
    clear.textContent = "Clear ×";
    clear.addEventListener("click", () => {
      state.filters.costs.clear();
      qol?.saveCurrentClassFilters();
      renderEverything();
    });
    els.costFilter.appendChild(clear);
  }
}

function getCostResultCount(bucket) {
  const original = [...state.filters.costs];
  state.filters.costs.clear();
  state.filters.costs.add(bucket);
  const count = filteredCards().length;
  state.filters.costs.clear();
  for (const selected of original) state.filters.costs.add(selected);
  return count;
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
    getDeckMark: card => state.deckMarks.get(card.id) ?? "",
    isFavorite: card => state.favorites.has(card.id),
    isExcluded: card => state.excluded.has(card.id) || state.globalExclusions.has(card.id),
    getCardById: id => state.cardMap.get(Number(id)) ?? null,
    getRelatedGroups,
    getPackagesForCard,
    onAdd: handleCardAdd,
    onRemove(card, quantity = 1) {
      if (removeCard(card, quantity)) renderEverything();
    },
    onPreviewOpen(card) {
      qol?.recordRecent(card);
    },
    onFilterTrait(value) {
      state.filters.traits.add(value);
      qol?.saveCurrentClassFilters();
      renderEverything();
    },
    onFilterKeyword(value) {
      state.filters.keywords.add(value);
      qol?.saveCurrentClassFilters();
      renderEverything();
    },
    onFilterSet(value) {
      state.filters.sets.add(value);
      qol?.saveCurrentClassFilters();
      renderEverything();
    },
    onSetMark(card, mark) {
      setDeckMark(card.id, mark);
      persist();
      renderEverything();
    },
    onOpenPackage: openPackageDialog
  });
}

function renderDeck() {
  const rows = [...state.deck.entries()]
    .map(([id, quantity]) => ({ card: state.cardMap.get(Number(id)), quantity }))
    .filter(row => row.card)
    .sort((a, b) => a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name));

  els.deckCount.textContent = `${getDeckSize()} / 40`;
  els.deckList.innerHTML = rows.map(({ card, quantity }) => `
    <div class="deck-row">
      <img src="${escapeHtml(card.image)}" alt="">
      <div>
        <div class="deck-row-title">${escapeHtml(card.name)}</div>
        <div class="deck-row-meta">${card.cost} PP · ${escapeHtml(card.type)} · ${escapeHtml(card.rarity)}</div>
      </div>
      <div class="deck-controls">
        <button type="button" data-remove-card="${card.id}">−</button>
        <span>${quantity}</span>
        <button type="button" data-add-card="${card.id}">+</button>
      </div>
    </div>
  `).join("");

  els.deckList.querySelectorAll("[data-add-card]").forEach(button => {
    button.addEventListener("click", () => {
      const card = state.cardMap.get(Number(button.dataset.addCard));
      if (card && addCard(card)) renderEverything();
    });
  });

  els.deckList.querySelectorAll("[data-remove-card]").forEach(button => {
    button.addEventListener("click", () => {
      const card = state.cardMap.get(Number(button.dataset.removeCard));
      if (card && removeCard(card)) renderEverything();
    });
  });
}

function renderAnalysis() {
  els.deckAnalysis.innerHTML = analyzeDeck().html ?? "";
}

function renderSavedDecks() {
  const variants = Object.keys(state.savedDecks ?? {}).sort((a, b) => a.localeCompare(b));
  els.savedDecks.innerHTML = variants.map(name => `
    <div class="saved-deck-row">
      <button type="button" data-load-variant="${escapeHtml(name)}">${escapeHtml(name)}</button>
      <button type="button" data-delete-variant="${escapeHtml(name)}">×</button>
    </div>
  `).join("");

  els.savedDecks.querySelectorAll("[data-load-variant]").forEach(button => {
    button.addEventListener("click", () => {
      if (loadVariant(button.dataset.loadVariant)) renderEverything();
    });
  });

  els.savedDecks.querySelectorAll("[data-delete-variant]").forEach(button => {
    button.addEventListener("click", () => {
      if (deleteVariant(button.dataset.deleteVariant)) renderSavedDecks();
    });
  });
}

function updateHistoryButtons() {
  els.undoDeck.disabled = !state.history.length;
  els.redoDeck.disabled = !state.future.length;
}

function handleCardAdd(card, quantity = 1, event = null) {
  if (!card?.deckSelectable) return false;
  if (event?.shiftKey) quantity = Math.max(1, 3 - (state.deck.get(card.id) ?? 0));
  const result = quantity > 1 ? addCards(card, quantity) : addCard(card);
  if (result) renderEverything();
  return result;
}

function persist() {
  saveWorkspace(state);
}

function sanitizeDeck() {
  for (const [id] of [...state.deck.entries()]) {
    if (!state.cardMap.has(Number(id))) state.deck.delete(id);
  }
}

function loadSharedDeckFromHash() {
  const match = location.hash.match(/(?:^#|&)deck=([^&]+)/);
  if (!match) return;
  const payload = decodeSharePayload(match[1]);
  if (!payload) return;
  importDeckPayload(state, payload);
}

function activateDeckTab(name) {
  document.querySelectorAll(".deck-tab-button").forEach(button => button.classList.toggle("active", button.dataset.tab === name));
  document.querySelectorAll(".deck-tab-content").forEach(section => section.classList.toggle("active", section.id === `${name}-tab`));
}

function populateCompareSelects() {
  const names = Object.keys(state.savedDecks ?? {}).sort((a, b) => a.localeCompare(b));
  const options = ['<option value="__current__">Current deck</option>', ...names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)].join("");
  els.compareLeft.innerHTML = options;
  els.compareRight.innerHTML = options;
  if (names[0]) els.compareRight.value = names[0];
}

function renderComparison() {
  const left = els.compareLeft.value === "__current__" ? { deck: [...state.deck.entries()] } : getVariant(els.compareLeft.value);
  const right = els.compareRight.value === "__current__" ? { deck: [...state.deck.entries()] } : getVariant(els.compareRight.value);
  els.compareResults.innerHTML = compareDecks(left?.deck ?? [], right?.deck ?? []).html ?? "";
}

function normalizePackageCards(cards) {
  return (cards ?? []).map(entry => typeof entry === "number" ? { id: Number(entry), quantity: 1 } : { id: Number(entry.id), quantity: Number(entry.quantity ?? 1) });
}

function openPackageDialog(packageDef, trigger) {
  pendingPackage = packageDef;
  pendingPackageTrigger = trigger;
  els.packageDialogTitle.textContent = packageDef.name ?? packageDef.id ?? "Add package";
  els.packageDialogDescription.textContent = packageDef.description ?? "";
  const rows = normalizePackageCards(packageDef.cards)
    .map(entry => ({ ...entry, card: state.cardMap.get(entry.id) }))
    .filter(row => row.card);
  els.packageDialogCards.innerHTML = rows.map(({ card, quantity }) => `
    <label class="package-card-row">
      <input type="checkbox" data-package-card="${card.id}" data-quantity="${quantity}" checked>
      <img src="${escapeHtml(card.image)}" alt="">
      <span>${escapeHtml(card.name)} ×${quantity}</span>
    </label>
  `).join("");
  els.packageDialog.showModal();
}

function confirmPendingPackage() {
  if (!pendingPackage) return;
  for (const checkbox of els.packageDialogCards.querySelectorAll("[data-package-card]:checked")) {
    const card = state.cardMap.get(Number(checkbox.dataset.packageCard));
    if (!card) continue;
    addCards(card, Number(checkbox.dataset.quantity) || 1);
  }
  els.packageDialog.close();
  pendingPackage = null;
  pendingPackageTrigger = null;
  renderEverything();
}

function getRelatedGroups(card) {
  return card?.relations ?? [];
}

function getPackagesForCard(card) {
  return (state.packages ?? []).filter(packageDef => normalizePackageCards(packageDef.cards).some(entry => entry.id === Number(card.id)));
}

function unique(values) {
  return [...new Set(values.filter(value => value && value !== "-"))].sort((a, b) => String(a).localeCompare(String(b)));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
