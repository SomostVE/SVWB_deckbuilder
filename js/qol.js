import { closeCardPreview } from "./card-grid.js";

const RECENT_KEY = "svwb-recent-cards";
const FILTER_KEY_PREFIX = "svwb-class-filters:";
const SCROLL_KEY_PREFIX = "svwb-class-scroll:";
const DECK_WIDTH_KEY = "svwb-deck-panel-width";
const HINT_KEY = "svwb-interaction-hint-dismissed";
const DECK_SORT_KEY = "svwb-deck-sort";
const DECK_COMPACT_KEY = "svwb-deck-compact";

export function setupQol({ state, renderEverything, renderCards, undoDeck, redoDeck }) {
  const content = document.querySelector(".content");
  const deckPanel = document.querySelector(".deck-panel");
  const resizer = document.getElementById("deck-resizer");
  const backToTop = document.getElementById("back-to-top");
  const resetView = document.getElementById("reset-view");
  const search = document.getElementById("search-input");

  applySavedDeckWidth();
  applySavedDeckCompact(deckPanel);
  setupDeckResizer(resizer);
  setupBackToTop(content, backToTop);
  setupKeyboardShortcuts({ search, renderEverything, undoDeck, redoDeck });
  setupResetView({ resetView, content, deckPanel, renderEverything });
  setupInteractionHint();
  setupClassFilterPersistence({ state, content, renderEverything });

  return {
    render() {
      renderActiveFilters(state, renderEverything);
      renderRecentCards(state, renderCards);
      enhanceCardSizeControl();
    },
    recordRecent(card) {
      if (!card?.id) return;
      const ids = loadRecentIds().filter(id => id !== Number(card.id));
      ids.unshift(Number(card.id));
      localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, 10)));
      renderRecentCards(state, renderCards);
    },
    getDeckSort() {
      return localStorage.getItem(DECK_SORT_KEY) || "cost";
    },
    setDeckSort(value) {
      localStorage.setItem(DECK_SORT_KEY, String(value || "cost"));
    },
    isCompactDeck() {
      return localStorage.getItem(DECK_COMPACT_KEY) === "1";
    },
    setCompactDeck(value) {
      localStorage.setItem(DECK_COMPACT_KEY, value ? "1" : "0");
      deckPanel?.classList.toggle("compact-deck", Boolean(value));
    },
    saveCurrentClassFilters() {
      saveClassFilters(state);
    }
  };
}

function setupKeyboardShortcuts({ search, renderEverything, undoDeck, redoDeck }) {
  document.addEventListener("keydown", event => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;

    if (event.key === "/" && !typing) {
      event.preventDefault();
      search?.focus();
      search?.select();
      return;
    }

    if (event.key === "Escape") {
      closeCardPreview();
      document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
      return;
    }

    const mod = event.ctrlKey || event.metaKey;
    if (!mod || typing) return;

    if (event.key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      if (undoDeck()) renderEverything();
      return;
    }

    if (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey)) {
      event.preventDefault();
      if (redoDeck()) renderEverything();
    }
  });
}

function setupDeckResizer(resizer) {
  if (!resizer) return;
  let dragging = false;

  resizer.addEventListener("pointerdown", event => {
    dragging = true;
    resizer.classList.add("dragging");
    resizer.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  resizer.addEventListener("pointermove", event => {
    if (!dragging) return;
    const width = clamp(window.innerWidth - event.clientX, 220, 520);
    document.documentElement.style.setProperty("--deck-panel-width", `${width}px`);
    localStorage.setItem(DECK_WIDTH_KEY, String(width));
  });

  const stop = () => {
    dragging = false;
    resizer.classList.remove("dragging");
  };
  resizer.addEventListener("pointerup", stop);
  resizer.addEventListener("pointercancel", stop);
}

function applySavedDeckWidth() {
  const saved = Number(localStorage.getItem(DECK_WIDTH_KEY));
  if (Number.isFinite(saved) && saved >= 220) {
    document.documentElement.style.setProperty("--deck-panel-width", `${clamp(saved, 220, 520)}px`);
  }
}

function applySavedDeckCompact(deckPanel) {
  deckPanel?.classList.toggle("compact-deck", localStorage.getItem(DECK_COMPACT_KEY) === "1");
}

function setupBackToTop(content, button) {
  if (!content || !button) return;
  const refresh = () => { button.hidden = content.scrollTop < 500; };
  content.addEventListener("scroll", refresh, { passive: true });
  button.addEventListener("click", () => content.scrollTo({ top: 0, behavior: "smooth" }));
  refresh();
}

function setupResetView({ resetView, content, deckPanel, renderEverything }) {
  resetView?.addEventListener("click", () => {
    const size = 118;
    document.documentElement.style.setProperty("--card-width", `${size}px`);
    localStorage.setItem("svwb-card-size", String(size));
    const slider = document.getElementById("card-size");
    if (slider) slider.value = String(size);

    document.documentElement.style.setProperty("--deck-panel-width", "270px");
    localStorage.setItem(DECK_WIDTH_KEY, "270");
    localStorage.setItem(DECK_COMPACT_KEY, "0");
    deckPanel?.classList.remove("compact-deck");
    content?.scrollTo({ top: 0 });
    renderEverything();
  });
}

function enhanceCardSizeControl() {
  const control = document.querySelector(".card-size-control");
  const slider = document.getElementById("card-size");
  if (!control || !slider || control.querySelector(".card-size-presets")) return;

  const presets = document.createElement("span");
  presets.className = "card-size-presets";
  const values = [
    ["S", 90],
    ["M", 118],
    ["L", 154]
  ];

  for (const [label, value] of values) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card-size-preset";
    button.textContent = label;
    button.addEventListener("click", () => {
      slider.value = String(value);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      updatePresetState(presets, value);
    });
    presets.appendChild(button);
  }

  control.appendChild(presets);
  slider.addEventListener("input", () => updatePresetState(presets, Number(slider.value)));
  updatePresetState(presets, Number(slider.value));
}

function updatePresetState(root, value) {
  const map = { S: 90, M: 118, L: 154 };
  root.querySelectorAll(".card-size-preset").forEach(button => {
    button.classList.toggle("active", map[button.textContent] === Number(value));
  });
}

function setupInteractionHint() {
  if (localStorage.getItem(HINT_KEY) === "1") return;

  const hint = document.createElement("div");
  hint.className = "qol-hint";
  hint.innerHTML = `
    <span>Click: +1 · Shift+click: fill copies · Right click: −1 · Shift+right click: remove all · /: search</span>
    <button type="button" aria-label="Dismiss">×</button>
  `;
  hint.querySelector("button").addEventListener("click", () => {
    localStorage.setItem(HINT_KEY, "1");
    hint.remove();
  });
  document.body.appendChild(hint);
}

function setupClassFilterPersistence({ state, content, renderEverything }) {
  const classFilter = document.getElementById("class-filter");
  if (!classFilter) return;

  loadClassFilters(state, state.selectedClass);
  restoreClassScroll(content, state.selectedClass);

  classFilter.addEventListener("pointerdown", event => {
    if (!event.target.closest(".class-button")) return;
    saveClassFilters(state, state.selectedClass);
    saveClassScroll(content, state.selectedClass);
  }, true);

  classFilter.addEventListener("click", event => {
    if (!event.target.closest(".class-button")) return;
    setTimeout(() => {
      loadClassFilters(state, state.selectedClass);
      renderEverything();
      restoreClassScroll(content, state.selectedClass);
    }, 0);
  });

  document.addEventListener("click", event => {
    if (!event.target.closest(".filter-option, .cost-button, .filter-group-clear, #reset-filters")) return;
    setTimeout(() => saveClassFilters(state, state.selectedClass), 0);
  });
}

function saveClassFilters(state, className = state.selectedClass) {
  const payload = {};
  for (const [key, set] of Object.entries(state.filters ?? {})) payload[key] = [...set];
  localStorage.setItem(`${FILTER_KEY_PREFIX}${className}`, JSON.stringify(payload));
}

function loadClassFilters(state, className) {
  let payload = null;
  try { payload = JSON.parse(localStorage.getItem(`${FILTER_KEY_PREFIX}${className}`) || "null"); } catch {}
  for (const [key, set] of Object.entries(state.filters ?? {})) {
    set.clear();
    for (const value of payload?.[key] ?? []) set.add(value);
  }
}

function saveClassScroll(content, className) {
  if (!content) return;
  localStorage.setItem(`${SCROLL_KEY_PREFIX}${className}`, String(content.scrollTop || 0));
}

function restoreClassScroll(content, className) {
  if (!content) return;
  const value = Number(localStorage.getItem(`${SCROLL_KEY_PREFIX}${className}`)) || 0;
  requestAnimationFrame(() => { content.scrollTop = value; });
}

function renderActiveFilters(state, renderEverything) {
  const root = document.getElementById("active-filters");
  if (!root) return;
  root.innerHTML = "";

  const labels = {
    costs: "Cost",
    sets: "Set",
    types: "Type",
    rarities: "Rarity",
    traits: "Trait",
    keywords: "Keyword"
  };

  for (const [key, set] of Object.entries(state.filters ?? {})) {
    for (const value of set) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "active-filter-chip";
      button.textContent = `${labels[key] ?? key}: ${value} ×`;
      button.addEventListener("click", () => {
        set.delete(value);
        saveClassFilters(state);
        renderEverything();
      });
      root.appendChild(button);
    }
  }

  if (state.search) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "active-filter-chip";
    button.textContent = `Search: ${state.search} ×`;
    button.addEventListener("click", () => {
      state.search = "";
      renderEverything();
    });
    root.appendChild(button);
  }
}

function renderRecentCards(state, renderCards) {
  const root = document.getElementById("recent-cards");
  if (!root) return;
  root.innerHTML = "";

  const cards = loadRecentIds().map(id => state.cardMap.get(Number(id))).filter(Boolean).slice(0, 8);
  if (!cards.length) {
    root.innerHTML = `<span class="muted">No recently viewed cards.</span>`;
    return;
  }

  for (const card of cards) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "compact-button";
    button.innerHTML = `<img src="${escapeAttr(card.image)}" alt=""><span>${escapeHtml(card.name)}</span>`;
    button.addEventListener("click", () => {
      state.discoverCardId = card.id;
      state.search = "";
      renderCards();
    });
    root.appendChild(button);
  }
}

function loadRecentIds() {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min));
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
