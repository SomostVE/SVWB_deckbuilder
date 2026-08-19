import { loadData } from "./data-loader.js";
import { state } from "./state.js";
import { loadWorkspace, applyWorkspace, saveWorkspace } from "./storage.js";
import { exportCollection, importCollection } from "./collection.js";
import { getCraftCost } from "./tools-common.js";
import { compareGameCardOrderAllClasses } from "./card-sort.js";

const PAGE_SIZE = 100;
const RARITY_ORDER = new Map([["Bronze", 0], ["Silver", 1], ["Gold", 2], ["Legendary", 3]]);

const els = {
  stats: document.getElementById("collection-stats"),
  setProgress: document.getElementById("set-progress"),
  cards: document.getElementById("collection-cards"),
  search: document.getElementById("collection-search"),
  classFilter: document.getElementById("collection-class"),
  setFilter: document.getElementById("collection-set"),
  rarityFilter: document.getElementById("collection-rarity"),
  sort: document.getElementById("collection-sort"),
  statusFilter: document.getElementById("collection-status-filter"),
  resultsCount: document.getElementById("collection-results-count"),
  missingTools: document.getElementById("collection-missing-tools"),
  missingSummary: document.getElementById("collection-missing-summary"),
  missingGroup: document.getElementById("collection-missing-group"),
  loadMore: document.getElementById("collection-load-more"),
  loadStatus: document.getElementById("collection-load-status"),
  setSort: document.getElementById("collection-set-sort"),
  plannerDecks: document.getElementById("planner-decks"),
  plannerSummary: document.getElementById("planner-summary"),
  plannerMissing: document.getElementById("planner-missing"),
  io: document.getElementById("collection-io"),
  ioText: document.getElementById("collection-io-text"),
  ioStatus: document.getElementById("collection-io-status")
};

const selectedDecks = new Set();
let activeTab = "cards";
let cardStatus = "all";
let visibleCardCount = PAGE_SIZE;

init();

async function init() {
  const { cards, metadata, packages, customTags, globalExclusions } = await loadData();
  state.cards = cards;
  state.cardMap = new Map(cards.map(card => [Number(card.id), card]));
  state.metadata = metadata;
  state.packages = packages;
  state.customTags = customTags;
  state.globalExclusions = globalExclusions;
  applyWorkspace(state, loadWorkspace());

  populateFilters();
  bindEvents();
  renderAll();
  switchTab("cards", { focus: false });
}

function bindEvents() {
  els.search?.addEventListener("input", () => {
    resetCardLimit();
    renderCards();
  });

  [els.classFilter, els.setFilter, els.rarityFilter, els.sort].forEach(el => {
    el?.addEventListener("change", () => {
      resetCardLimit();
      renderCards();
    });
  });

  els.statusFilter?.addEventListener("click", event => {
    const button = event.target.closest("[data-collection-status]");
    if (!button) return;
    cardStatus = button.dataset.collectionStatus || "all";
    els.statusFilter.querySelectorAll("[data-collection-status]").forEach(item => {
      item.classList.toggle("active", item === button);
    });
    resetCardLimit();
    renderCards();
  });

  els.loadMore?.addEventListener("click", () => {
    visibleCardCount += PAGE_SIZE;
    renderCards();
  });

  els.setSort?.addEventListener("change", renderSetProgress);
  els.missingGroup?.addEventListener("change", () => {
    resetCardLimit();
    renderCards();
  });

  document.querySelectorAll("[data-collection-tab]").forEach(button => {
    button.addEventListener("click", () => switchTab(button.dataset.collectionTab));
  });

  els.setProgress?.addEventListener("click", event => {
    const card = event.target.closest("[data-set-name]");
    if (!card) return;
    openSetInBrowser(card.dataset.setName);
  });

  els.cards?.addEventListener("click", event => {
    const button = event.target.closest("[data-step]");
    if (!button) return;
    const row = button.closest("[data-card-id]");
    const card = state.cardMap.get(Number(row?.dataset.cardId));
    if (!card) return;

    const next = Math.max(0, Math.min(Number(card.maxCopies ?? 3), owned(card) + Number(button.dataset.step)));
    if (next > 0) state.owned.set(card.id, next);
    else state.owned.delete(card.id);

    saveWorkspace(state);
    renderStats();
    renderSetProgress();
    renderCards();
    if (activeTab === "planner") renderPlannerResults();
  });

  els.plannerMissing?.addEventListener("click", event => {
    const item = event.target.closest("[data-card-id]");
    if (!item) return;
    openCardInBrowser(Number(item.dataset.cardId));
  });
  els.plannerMissing?.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const item = event.target.closest("[data-card-id]");
    if (!item) return;
    event.preventDefault();
    openCardInBrowser(Number(item.dataset.cardId));
  });

  document.getElementById("collection-export")?.addEventListener("click", () => openIo(true));
  document.getElementById("collection-import")?.addEventListener("click", () => openIo(false));
  document.getElementById("collection-io-close")?.addEventListener("click", () => els.io.close());
  document.getElementById("collection-io-refresh")?.addEventListener("click", () => {
    els.ioText.value = JSON.stringify(exportCollection(state), null, 2);
    setIoStatus("Export refreshed.");
  });
  document.getElementById("collection-io-merge")?.addEventListener("click", () => importIo("merge"));
  document.getElementById("collection-io-replace")?.addEventListener("click", () => importIo("replace"));
}

function populateFilters() {
  const deckCards = state.cards.filter(card => card.deckSelectable);
  fillSelect(els.classFilter, unique(deckCards.map(card => card.class)), "All classes");
  fillSelect(els.setFilter, unique(deckCards.map(card => card.set)), "All sets");
  fillSelect(els.rarityFilter, ["Bronze", "Silver", "Gold", "Legendary"], "All rarities");
}

function fillSelect(select, values, firstLabel) {
  select.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>` + values.map(value => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join("");
}

function renderAll() {
  renderStats();
  renderSetProgress();
  renderCards();
  renderPlanner();
}

function renderStats() {
  const cards = state.cards.filter(card => card.deckSelectable);
  const ownedCards = cards.filter(card => owned(card) > 0).length;
  const ownedCopies = cards.reduce((sum, card) => sum + owned(card), 0);
  const maxCopies = cards.reduce((sum, card) => sum + Number(card.maxCopies ?? 3), 0);
  const fullPlaysets = cards.filter(card => owned(card) >= Number(card.maxCopies ?? 3)).length;
  const completeCost = cards.reduce((sum, card) => sum + Math.max(0, Number(card.maxCopies ?? 3) - owned(card)) * getCraftCost(card), 0);

  els.stats.innerHTML = [
    stat(ownedCards, `Unique owned / ${cards.length}`),
    stat(ownedCopies, `Copies owned / ${maxCopies}`),
    stat(fullPlaysets, "Complete playsets"),
    stat(formatNumber(completeCost), "Vials to complete all playsets")
  ].join("");
}

function renderSetProgress() {
  const groups = new Map();
  for (const card of state.cards.filter(card => card.deckSelectable)) {
    const group = groups.get(card.set) ?? {
      set: card.set,
      setId: Number(card.setId ?? 0),
      total: 0,
      owned: 0,
      full: 0,
      missingVials: 0
    };
    group.total++;
    group.setId = Math.max(group.setId, Number(card.setId ?? 0));
    if (owned(card) > 0) group.owned++;
    if (owned(card) >= Number(card.maxCopies ?? 3)) group.full++;
    group.missingVials += Math.max(0, Number(card.maxCopies ?? 3) - owned(card)) * getCraftCost(card);
    groups.set(card.set, group);
  }

  const setSort = els.setSort?.value || "newest";
  const sorted = [...groups.values()].sort((a, b) => {
    const aUnique = a.total ? a.owned / a.total : 0;
    const bUnique = b.total ? b.owned / b.total : 0;
    const aFull = a.total ? a.full / a.total : 0;
    const bFull = b.total ? b.full / b.total : 0;

    if (setSort === "completion") {
      return bFull - aFull || bUnique - aUnique || b.setId - a.setId || a.set.localeCompare(b.set);
    }
    if (setSort === "missing") {
      return b.missingVials - a.missingVials || b.setId - a.setId || a.set.localeCompare(b.set);
    }
    return b.setId - a.setId || a.set.localeCompare(b.set);
  });

  els.setProgress.innerHTML = sorted.map(group => {
    const uniquePct = group.total ? Math.round(group.owned / group.total * 100) : 0;
    const fullPct = group.total ? Math.round(group.full / group.total * 100) : 0;
    return `<button type="button" class="tools-set-card collection-set-card" data-set-name="${escapeAttr(group.set)}">
      <strong>${escapeHtml(group.set)}</strong>
      <div class="collection-set-meta tools-muted">
        <span>${group.owned}/${group.total} unique</span><span>${uniquePct}%</span>
        <span>${group.full}/${group.total} playsets</span><span>${fullPct}%</span>
      </div>
      <div class="collection-set-progress-block">
        <div class="collection-set-progress-label"><span>Unique cards</span><span>${uniquePct}%</span></div>
        <div class="tools-progress"><span style="width:${uniquePct}%"></span></div>
      </div>
      <div class="collection-set-progress-block playsets">
        <div class="collection-set-progress-label"><span>Complete playsets</span><span>${fullPct}%</span></div>
        <div class="tools-progress"><span style="width:${fullPct}%"></span></div>
      </div>
      <div class="tools-muted" style="margin-top:.5rem">${formatNumber(group.missingVials)} vials to 3×</div>
    </button>`;
  }).join("");
}

function renderCards() {
  const q = String(els.search.value ?? "").trim().toLowerCase();
  const className = els.classFilter.value;
  const setName = els.setFilter.value;
  const rarity = els.rarityFilter.value;

  const cards = state.cards.filter(card => card.deckSelectable)
    .filter(card => !className || card.class === className)
    .filter(card => !setName || card.set === setName)
    .filter(card => !rarity || card.rarity === rarity)
    .filter(card => matchesOwnershipStatus(card))
    .filter(card => !q || [card.name, card.set, card.class, card.rarity, ...(card.traits ?? []), ...(card.keywords ?? [])].join(" ").toLowerCase().includes(q));

  sortCards(cards, els.sort?.value || "game");

  const missingView = cardStatus === "missing";
  if (els.missingTools) els.missingTools.hidden = !missingView;
  if (missingView && els.missingSummary) {
    const missingCopies = cards.reduce((sum, card) => sum + Math.max(0, Number(card.maxCopies ?? 3) - owned(card)), 0);
    const missingVials = cards.reduce((sum, card) => sum + Math.max(0, Number(card.maxCopies ?? 3) - owned(card)) * getCraftCost(card), 0);
    els.missingSummary.innerHTML = [
      stat(formatNumber(cards.length), "Missing cards"),
      stat(formatNumber(missingCopies), "Missing copies"),
      stat(formatNumber(missingVials), "Vials needed")
    ].join("");
  } else if (els.missingSummary) {
    els.missingSummary.innerHTML = "";
  }

  const ownedInResults = cards.filter(card => owned(card) > 0).length;
  const visible = cards.slice(0, visibleCardCount);
  els.resultsCount.textContent = `${formatNumber(cards.length)} cards · ${formatNumber(ownedInResults)} owned`;

  const groupMode = missingView ? String(els.missingGroup?.value ?? "") : "";
  if (groupMode) {
    const groups = new Map();
    for (const card of visible) {
      const label = missingGroupLabel(card, groupMode);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(card);
    }
    els.cards.innerHTML = [...groups.entries()].map(([label, groupCards]) => `
      <div class="collection-card-group-heading"><strong>${escapeHtml(label)}</strong><span>${formatNumber(groupCards.length)} cards</span></div>
      ${groupCards.map(renderCollectionCard).join("")}
    `).join("") || `<div class="tools-muted">No cards match these filters.</div>`;
  } else {
    els.cards.innerHTML = visible.map(renderCollectionCard).join("") || `<div class="tools-muted">No cards match these filters.</div>`;
  }

  const shown = visible.length;
  els.loadStatus.textContent = cards.length ? `Showing ${formatNumber(shown)} of ${formatNumber(cards.length)}` : "";
  els.loadMore.hidden = shown >= cards.length;
}

function renderCollectionCard(card) {
  const have = owned(card);
  const max = Number(card.maxCopies ?? 3);
  const missingCost = Math.max(0, max - have) * getCraftCost(card);
  const stateName = have >= max ? "complete" : have > 0 ? "partial" : "missing";
  const stateLabel = stateName === "complete" ? `${have}/${max} complete` : stateName === "partial" ? `${have}/${max} partial` : `${have}/${max} missing`;
  return `<div class="collection-card-row collection-state-${stateName}" data-card-id="${card.id}">
    <img src="${escapeAttr(card.image)}" alt="">
    <div class="collection-card-copy">
      <strong>${escapeHtml(card.name)}</strong>
      <small>${escapeHtml(card.class)} · ${escapeHtml(card.rarity)} · ${escapeHtml(card.set)} · Cost ${card.cost}</small>
      <small>${have < max ? `${formatNumber(missingCost)} vials to ${max}×` : "Playset complete"}</small>
      <span class="collection-card-state">${stateLabel}</span>
    </div>
    <div class="owned-stepper" aria-label="Owned copies">
      <button type="button" data-step="-1" aria-label="Remove one ${escapeAttr(card.name)}">−</button>
      <strong>${have}</strong>
      <button type="button" data-step="1" aria-label="Add one ${escapeAttr(card.name)}">+</button>
    </div>
  </div>`;
}

function missingGroupLabel(card, mode) {
  if (mode === "set") return card.set || "Unknown set";
  if (mode === "class") return card.class || "Unknown class";
  if (mode === "rarity") return card.rarity || "Unknown rarity";
  return "Missing cards";
}

function matchesOwnershipStatus(card) {
  const have = owned(card);
  const max = Number(card.maxCopies ?? 3);
  if (cardStatus === "owned") return have > 0;
  if (cardStatus === "missing") return have < max;
  if (cardStatus === "complete") return have >= max;
  return true;
}

function sortCards(cards, mode) {
  const fallback = (a, b) => compareGameCardOrderAllClasses(a, b);
  cards.sort((a, b) => {
    if (mode === "name") return a.name.localeCompare(b.name) || fallback(a, b);
    if (mode === "cost") return Number(a.cost ?? 0) - Number(b.cost ?? 0) || fallback(a, b);
    if (mode === "rarity") return (RARITY_ORDER.get(a.rarity) ?? 99) - (RARITY_ORDER.get(b.rarity) ?? 99) || fallback(a, b);
    if (mode === "set") return Number(b.setId ?? 0) - Number(a.setId ?? 0) || fallback(a, b);
    if (mode === "owned") return owned(b) - owned(a) || fallback(a, b);
    return fallback(a, b);
  });
}

function resetCardLimit() {
  visibleCardCount = PAGE_SIZE;
}

function switchTab(tab, { focus = true } = {}) {
  if (!new Set(["cards", "sets", "planner"]).has(tab)) tab = "cards";
  activeTab = tab;

  document.querySelectorAll("[data-collection-tab]").forEach(button => {
    const active = button.dataset.collectionTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  document.querySelectorAll("[data-collection-panel]").forEach(panel => {
    const active = panel.dataset.collectionPanel === tab;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });

  if (tab === "sets") renderSetProgress();
  if (tab === "planner") renderPlanner();

  if (focus) {
    document.querySelector(`[data-collection-panel="${tab}"]`)?.scrollIntoView({ block: "start" });
  }
}

function openSetInBrowser(setName) {
  els.search.value = "";
  els.classFilter.value = "";
  els.rarityFilter.value = "";
  els.setFilter.value = setName;
  setCardStatus("missing");
  resetCardLimit();
  switchTab("cards");
  renderCards();
}

function openCardInBrowser(cardId) {
  const card = state.cardMap.get(Number(cardId));
  if (!card) return;
  els.search.value = card.name;
  els.classFilter.value = "";
  els.setFilter.value = "";
  els.rarityFilter.value = "";
  setCardStatus("all");
  resetCardLimit();
  switchTab("cards");
  renderCards();
}

function setCardStatus(status) {
  cardStatus = status;
  els.statusFilter?.querySelectorAll("[data-collection-status]").forEach(button => {
    button.classList.toggle("active", button.dataset.collectionStatus === status);
  });
}

function renderPlanner() {
  const entries = Object.entries(state.savedDecks ?? {}).sort((a, b) => a[0].localeCompare(b[0]));
  els.plannerDecks.innerHTML = entries.length ? entries.map(([name]) => `
    <label><input type="checkbox" data-planner-deck="${escapeAttr(name)}" ${selectedDecks.has(name) ? "checked" : ""}> ${escapeHtml(name)}</label>
  `).join("") : `<span class="tools-muted">No saved decks yet.</span>`;

  els.plannerDecks.querySelectorAll("[data-planner-deck]").forEach(input => input.addEventListener("change", () => {
    if (input.checked) selectedDecks.add(input.dataset.plannerDeck);
    else selectedDecks.delete(input.dataset.plannerDeck);
    renderPlannerResults();
  }));
  renderPlannerResults();
}

function renderPlannerResults() {
  const required = new Map();
  for (const name of selectedDecks) {
    const variant = state.savedDecks?.[name];
    if (!variant) continue;
    for (const [idValue, qtyValue] of variant.deck ?? []) {
      const id = Number(idValue);
      const qty = Math.min(3, Number(qtyValue) || 0);
      required.set(id, Math.max(required.get(id) ?? 0, qty));
    }
  }

  const missing = [];
  let totalRequired = 0;
  let missingCopies = 0;
  let missingVials = 0;
  for (const [id, qty] of required) {
    const card = state.cardMap.get(id);
    if (!card || !card.deckSelectable) continue;
    totalRequired += qty;
    const need = Math.max(0, qty - (card.set === "Basic" ? qty : owned(card)));
    if (!need) continue;
    const cost = need * getCraftCost(card);
    missingCopies += need;
    missingVials += cost;
    missing.push({ card, qty, need, cost });
  }
  missing.sort((a, b) => b.cost - a.cost || a.card.name.localeCompare(b.card.name));

  els.plannerSummary.innerHTML = [
    stat(selectedDecks.size, "Selected decks"),
    stat(totalRequired, "Required copies"),
    stat(missingCopies, "Missing copies"),
    stat(formatNumber(missingVials), "Vials needed")
  ].join("");
  els.plannerMissing.innerHTML = missing.length ? missing.map(item => `<div class="planner-card" role="button" tabindex="0" data-card-id="${item.card.id}">
    <strong>${escapeHtml(item.card.name)}</strong>
    <span class="tools-muted">Need ${item.qty} · Owned ${owned(item.card)} · Missing ${item.need} · ${formatNumber(item.cost)} vials</span>
  </div>`).join("") : `<div class="tools-muted">${selectedDecks.size ? "You already own everything required by the selected decks." : "Select one or more saved decks."}</div>`;
}

function openIo(exportFirst) {
  if (exportFirst) els.ioText.value = JSON.stringify(exportCollection(state), null, 2);
  setIoStatus(exportFirst ? "Export ready." : "Paste a collection export, then merge or replace.");
  els.io.showModal();
}

function importIo(mode) {
  try {
    const result = importCollection(state, JSON.parse(els.ioText.value), mode);
    saveWorkspace(state);
    setIoStatus(`${mode === "merge" ? "Merged" : "Replaced"}: ${result.imported} entries · ${result.unresolved} unresolved IDs preserved.`);
    renderAll();
  } catch (error) {
    setIoStatus(`Import failed: ${error.message}`);
  }
}

function setIoStatus(text) { els.ioStatus.textContent = text; }
function owned(card) { return Math.max(0, Number(state.owned.get(card.id)) || 0); }
function unique(values) { return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
function stat(value, label) { return `<div class="tools-stat"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`; }
function formatNumber(value) { return new Intl.NumberFormat("en-US").format(Number(value) || 0); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function escapeAttr(value) { return escapeHtml(value); }
