import { state, resetFilters } from "./state.js";
import { loadData } from "./data-loader.js";
import { CLASSES, filteredCards } from "./filters.js";
import { renderCardGrid } from "./card-grid.js";
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
  toolbar: document.querySelector(".content-toolbar")
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
    setupCardSizeControl();
    bindEvents();
    render();
  } catch (error) {
    console.error(error);
    els.grid.innerHTML = `
      <div>
        <h2>No card data loaded yet</h2>
        <p class="muted">The generated card database could not be loaded.</p>
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
    render();
  });

  els.resetFilters.addEventListener("click", () => {
    resetFilters();
    els.search.value = "";
    renderFilterGroups();
    renderCards();
  });
}

function setupCardSizeControl() {
  if (!els.toolbar || document.getElementById("card-size")) return;

  const saved = Number(localStorage.getItem("svwb-card-size")) || 118;
  document.documentElement.style.setProperty("--card-width", `${saved}px`);

  const control = document.createElement("label");
  control.className = "card-size-control";
  control.innerHTML = `
    <span>Card size</span>
    <input id="card-size" type="range" min="78" max="190" step="4" value="${saved}">
  `;

  const resetButton = els.resetFilters;
  els.toolbar.insertBefore(control, resetButton);

  control.querySelector("input").addEventListener("input", event => {
    const value = Number(event.target.value);
    document.documentElement.style.setProperty("--card-width", `${value}px`);
    localStorage.setItem("svwb-card-size", String(value));
  });
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

  const neutral = document.createElement("label");
  neutral.className = "neutral-toggle";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.includeNeutral;
  checkbox.addEventListener("change", () => {
    state.includeNeutral = checkbox.checked;
    renderFilterGroups();
    renderCards();
  });
  neutral.append(checkbox, document.createTextNode(" Include Neutral"));
  els.classFilter.appendChild(neutral);
}

function renderFilterGroups() {
  const available = state.cards.filter(card =>
    card.class === state.selectedClass ||
    (state.includeNeutral && card.class === "Neutral")
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
    getQuantity(card) {
      return state.deck.get(card.id) ?? 0;
    },
    onAdd(card) {
      addCard(card);
      render();
    },
    onRemove(card) {
      removeCard(card);
      render();
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
      render();
    });

    row.querySelector('[data-action="plus"]').addEventListener("click", () => {
      addCard(card);
      render();
    });

    els.deckList.appendChild(row);
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}
