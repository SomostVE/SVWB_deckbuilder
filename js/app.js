import { state, resetFilters } from "./state.js";
import { loadData } from "./data-loader.js";
import { CLASSES, filteredCards } from "./filters.js";
import { renderCardGrid } from "./card-grid.js";
import { showCardDetails } from "./card-details.js";
import { addCard, removeCard, clearDeck, getDeckSize } from "./deck.js";
import { loadDeck } from "./storage.js";

const els = {
  classFilter: document.getElementById("class-filter"),
  search: document.getElementById("search-input"),
  setFilter: document.getElementById("set-filter"),
  typeFilter: document.getElementById("type-filter"),
  rarityFilter: document.getElementById("rarity-filter"),
  traitFilter: document.getElementById("trait-filter"),
  keywordFilter: document.getElementById("keyword-filter"),
  grid: document.getElementById("card-grid"),
  resultsCount: document.getElementById("results-count"),
  deckList: document.getElementById("deck-list"),
  deckCount: document.getElementById("deck-count"),
  clearDeck: document.getElementById("clear-deck"),
  resetFilters: document.getElementById("reset-filters"),
  dialog: document.getElementById("card-dialog"),
  dialogContent: document.getElementById("card-dialog-content"),
  dialogClose: document.getElementById("card-dialog-close")
};

init();

async function init() {
  try {
    const { cards, metadata } = await loadData();
    state.cards = cards;
    state.metadata = metadata;
    state.deck = loadDeck();

    renderClassFilter();
    renderFilterGroups();
    bindEvents();
    render();
  } catch (error) {
    console.error(error);
    els.grid.innerHTML = `
      <div>
        <h2>No card data loaded yet</h2>
        <p class="muted">Run <code>node scripts/update-cards.mjs</code>, then reload the site.</p>
      </div>
    `;
  }
}

function bindEvents() {
  els.search.addEventListener("input", event => {
    state.search = event.target.value;
    renderCards();
  });

  els.clearDeck.addEventListener("click", () => {
    clearDeck();
    renderDeck();
  });

  els.resetFilters.addEventListener("click", () => {
    resetFilters();
    els.search.value = "";
    renderFilterGroups();
    renderCards();
  });

  els.dialogClose.addEventListener("click", () => els.dialog.close());
}

function render() {
  renderCards();
  renderDeck();
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
      renderClassFilter();
      renderFilterGroups();
      renderCards();
    });
    els.classFilter.appendChild(button);
  }
}

function renderFilterGroups() {
  const available = state.cards.filter(card =>
    card.class === state.selectedClass || card.class === "Neutral"
  );

  renderCheckboxGroup(els.setFilter, "Set", unique(available.map(x => x.set)), state.filters.sets);
  renderCheckboxGroup(els.typeFilter, "Type", unique(available.map(x => x.type)), state.filters.types);
  renderCheckboxGroup(els.rarityFilter, "Rarity", unique(available.map(x => x.rarity)), state.filters.rarities);
  renderCheckboxGroup(els.traitFilter, "Trait", unique(available.flatMap(x => x.traits ?? [])), state.filters.traits);
  renderCheckboxGroup(els.keywordFilter, "Keyword", unique(available.flatMap(x => x.keywords ?? [])), state.filters.keywords);
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
    });

    label.append(input, document.createTextNode(value));
    options.appendChild(label);
  }

  wrapper.appendChild(options);
  root.appendChild(wrapper);
}

function renderCards() {
  const cards = filteredCards();
  els.resultsCount.textContent = `${cards.length} card${cards.length === 1 ? "" : "s"}`;

  renderCardGrid(els.grid, cards, {
    onAdd(card) {
      addCard(card);
      renderDeck();
    },
    onDetails(card) {
      showCardDetails(els.dialog, els.dialogContent, card, selected => {
        addCard(selected);
        renderDeck();
      });
    }
  });
}

function renderDeck() {
  els.deckCount.textContent = `${getDeckSize()} / 40`;
  els.deckList.innerHTML = "";

  const rows = Array.from(state.deck.entries())
    .map(([id, qty]) => ({ card: state.cards.find(c => c.id === id), qty }))
    .filter(x => x.card)
    .sort((a, b) => a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name));

  for (const { card, qty } of rows) {
    const row = document.createElement("div");
    row.className = "deck-row";
    row.innerHTML = `
      <img src="${card.image}" alt="">
      <div class="deck-row-title">
        <strong>${card.name}</strong>
        <span class="muted">Cost ${card.cost}</span>
      </div>
      <div class="deck-controls">
        <button data-action="minus" type="button">−</button>
        <span>${qty}x</span>
        <button data-action="plus" type="button">+</button>
      </div>
    `;

    row.querySelector('[data-action="minus"]').addEventListener("click", () => {
      removeCard(card);
      renderDeck();
    });

    row.querySelector('[data-action="plus"]').addEventListener("click", () => {
      addCard(card);
      renderDeck();
    });

    els.deckList.appendChild(row);
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}
