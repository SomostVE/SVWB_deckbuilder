import { loadData } from "./data-loader.js";
import { state } from "./state.js";
import { loadWorkspace, applyWorkspace, saveWorkspace } from "./storage.js";
import { exportCollection, importCollection } from "./collection.js";
import { VIAL_COSTS, getCraftCost } from "./tools-common.js";

const els = {
  stats: document.getElementById("collection-stats"),
  setProgress: document.getElementById("set-progress"),
  cards: document.getElementById("collection-cards"),
  search: document.getElementById("collection-search"),
  classFilter: document.getElementById("collection-class"),
  setFilter: document.getElementById("collection-set"),
  rarityFilter: document.getElementById("collection-rarity"),
  missingOnly: document.getElementById("collection-missing-only"),
  ownedOnly: document.getElementById("collection-owned-only"),
  plannerDecks: document.getElementById("planner-decks"),
  plannerSummary: document.getElementById("planner-summary"),
  plannerMissing: document.getElementById("planner-missing"),
  io: document.getElementById("collection-io"),
  ioText: document.getElementById("collection-io-text"),
  ioStatus: document.getElementById("collection-io-status")
};

const selectedDecks = new Set();
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
}

function bindEvents() {
  [els.search, els.classFilter, els.setFilter, els.rarityFilter, els.missingOnly, els.ownedOnly].forEach(el => {
    el?.addEventListener("input", renderCards);
    el?.addEventListener("change", renderCards);
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
    const group = groups.get(card.set) ?? { set: card.set, total: 0, owned: 0, full: 0, missingVials: 0 };
    group.total++;
    if (owned(card) > 0) group.owned++;
    if (owned(card) >= Number(card.maxCopies ?? 3)) group.full++;
    group.missingVials += Math.max(0, Number(card.maxCopies ?? 3) - owned(card)) * getCraftCost(card);
    groups.set(card.set, group);
  }

  els.setProgress.innerHTML = [...groups.values()]
    .sort((a, b) => setSortKey(b.set) - setSortKey(a.set) || a.set.localeCompare(b.set))
    .map(group => {
      const pct = group.total ? Math.round(group.owned / group.total * 100) : 0;
      return `<div class="tools-set-card">
        <strong>${escapeHtml(group.set)}</strong>
        <div class="tools-muted">${group.owned}/${group.total} cards · ${group.full} full playsets</div>
        <div class="tools-muted">${formatNumber(group.missingVials)} vials to 3×</div>
        <div class="tools-progress"><span style="width:${pct}%"></span></div>
      </div>`;
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
    .filter(card => !els.missingOnly.checked || owned(card) < Number(card.maxCopies ?? 3))
    .filter(card => !els.ownedOnly.checked || owned(card) > 0)
    .filter(card => !q || [card.name, card.set, card.class, card.rarity, ...(card.traits ?? []), ...(card.keywords ?? [])].join(" ").toLowerCase().includes(q))
    .sort((a, b) => a.class.localeCompare(b.class) || a.cost - b.cost || a.name.localeCompare(b.name));

  els.cards.innerHTML = cards.map(card => {
    const have = owned(card);
    const max = Number(card.maxCopies ?? 3);
    const missingCost = Math.max(0, max - have) * getCraftCost(card);
    return `<div class="collection-card-row" data-card-id="${card.id}">
      <img src="${escapeAttr(card.image)}" alt="">
      <div>
        <strong>${escapeHtml(card.name)}</strong>
        <small>${escapeHtml(card.class)} · ${escapeHtml(card.rarity)} · ${escapeHtml(card.set)} · Cost ${card.cost}</small>
        <small>${have < max ? `${formatNumber(missingCost)} vials to ${max}×` : "Playset complete"}</small>
      </div>
      <div class="owned-stepper">
        <button type="button" data-step="-1">−</button><strong>${have}</strong><button type="button" data-step="1">+</button>
      </div>
    </div>`;
  }).join("") || `<div class="tools-muted">No cards match these filters.</div>`;

  els.cards.querySelectorAll("[data-card-id]").forEach(row => {
    row.querySelectorAll("[data-step]").forEach(button => button.addEventListener("click", () => {
      const card = state.cardMap.get(Number(row.dataset.cardId));
      const next = Math.max(0, Math.min(Number(card.maxCopies ?? 3), owned(card) + Number(button.dataset.step)));
      if (next > 0) state.owned.set(card.id, next); else state.owned.delete(card.id);
      saveWorkspace(state);
      renderAll();
    }));
  });
}

function renderPlanner() {
  const entries = Object.entries(state.savedDecks ?? {}).sort((a, b) => a[0].localeCompare(b[0]));
  els.plannerDecks.innerHTML = entries.length ? entries.map(([name]) => `
    <label><input type="checkbox" data-planner-deck="${escapeAttr(name)}" ${selectedDecks.has(name) ? "checked" : ""}> ${escapeHtml(name)}</label>
  `).join("") : `<span class="tools-muted">No saved decks yet.</span>`;

  els.plannerDecks.querySelectorAll("[data-planner-deck]").forEach(input => input.addEventListener("change", () => {
    if (input.checked) selectedDecks.add(input.dataset.plannerDeck); else selectedDecks.delete(input.dataset.plannerDeck);
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
    stat(totalRequired, "Unique requirements by copies"),
    stat(missingCopies, "Missing copies"),
    stat(formatNumber(missingVials), "Vials needed")
  ].join("");
  els.plannerMissing.innerHTML = missing.length ? missing.map(item => `<div class="planner-card">
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
function setSortKey(name) { const card = state.cards.find(item => item.set === name); return Number(card?.setId ?? 0); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function escapeAttr(value) { return escapeHtml(value); }
