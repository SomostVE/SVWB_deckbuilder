import { state } from "./state.js";

const KEY = "svwb-deck-only";
const grid = document.getElementById("card-grid");
const viewBody = document.querySelector('[data-collapse-key="view"] .sidebar-collapse-body');
const resultsCount = document.getElementById("results-count");

state.deckOnly = localStorage.getItem(KEY) === "1";

let checkbox = document.getElementById("deck-only");
if (!checkbox && viewBody) {
  const label = document.createElement("label");
  label.innerHTML = '<input id="deck-only" type="checkbox"> Deck cards only';
  viewBody.appendChild(label);
  checkbox = label.querySelector("input");
}

if (checkbox) {
  checkbox.checked = state.deckOnly;
  checkbox.addEventListener("change", () => {
    state.deckOnly = checkbox.checked;
    localStorage.setItem(KEY, state.deckOnly ? "1" : "0");
    applyDeckOnlyView();
  });
}

if (grid) {
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyDeckOnlyView();
    });
  }).observe(grid, { childList: true });
}

applyDeckOnlyView();

function applyDeckOnlyView() {
  if (!grid) return;

  const tiles = [...grid.querySelectorAll(".card-tile")];

  if (!state.deckOnly) {
    for (const tile of tiles) tile.hidden = false;
    updateResultsCount(tiles.length);
    return;
  }

  const selectedIds = new Set(
    [...state.deck.entries()]
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([id]) => Number(id))
  );
  const idByImage = buildImageIndex();
  let visible = 0;

  for (const tile of tiles) {
    const image = tile.querySelector("img");
    const cardId = image ? idByImage.get(image.src) : null;
    const show = cardId != null && selectedIds.has(cardId);
    tile.hidden = !show;
    if (show) visible += 1;
  }

  updateResultsCount(visible);
}

function updateResultsCount(count) {
  if (!resultsCount) return;
  resultsCount.textContent = `${count} card${count === 1 ? "" : "s"}`;
}

function buildImageIndex() {
  const map = new Map();
  for (const card of state.cards ?? []) {
    if (!card?.image) continue;
    try {
      map.set(new URL(card.image, location.href).href, Number(card.id));
    } catch {}
  }
  return map;
}
