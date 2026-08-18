import { closeCardPreview } from "./card-grid.js";

const RECENT_KEY = "svwb-recent-cards";
const FILTER_KEY = "svwb-filters";
const SCROLL_KEY_PREFIX = "svwb-class-scroll:";
const DECK_WIDTH_KEY = "svwb-deck-panel-width";
const DECK_WIDTH_MIGRATION_KEY = "svwb-deck-panel-width-v2";
const HINT_KEY = "svwb-interaction-hint-dismissed";
const DECK_SORT_KEY = "svwb-deck-sort";
const DECK_COMPACT_KEY = "svwb-deck-compact";
const CARD_SIZE_KEY = "svwb-card-size";
const CARD_SIZE_MODE_KEY = "svwb-card-size-mode";

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
  setupFiltersDrawer({ search });
  setupAdaptiveCardSize(content);
  setupResetView({ resetView, content, deckPanel, renderEverything });
  setupInteractionHint();
  loadFilters(state);
  setupClassScrollPersistence({ state, content });

  return {
    render() {
      renderActiveFilters(state, renderEverything);
      renderRecentCards(state, renderCards);
      enhanceCardSizeControl(content);
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
      saveFilters(state);
    },
    renderActiveFilters() {
      renderActiveFilters(state, renderEverything);
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

function setupFiltersDrawer({ search }) {
  const sidebar = document.getElementById("filters-sidebar");
  const toggle = document.getElementById("filters-drawer-toggle");
  const close = document.getElementById("filters-drawer-close");
  const backdrop = document.getElementById("filters-drawer-backdrop");
  const header = document.querySelector(".app-header");
  const desktop = matchMedia("(min-width: 761px)");
  if (!sidebar || !toggle || !backdrop) return;

  const syncTop = () => {
    const bottom = Math.max(0, Math.round(header?.getBoundingClientRect().bottom ?? 0));
    document.documentElement.style.setProperty("--filter-drawer-top", `${bottom}px`);
  };

  const setOpen = requested => {
    const open = Boolean(requested && desktop.matches);
    sidebar.classList.toggle("drawer-open", open);
    sidebar.setAttribute("aria-hidden", open ? "false" : "true");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    backdrop.hidden = !open;
    document.body.classList.toggle("filter-drawer-open", open);
  };

  toggle.addEventListener("click", () => setOpen(!sidebar.classList.contains("drawer-open")));
  close?.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));

  sidebar.addEventListener("click", event => {
    if (!desktop.matches) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("#filters-drawer-close, .sidebar-collapse-title, .filter-group-title, input[type='search']")) return;

    const checkboxLabel = target.closest("label");
    const usedCheckbox = Boolean(checkboxLabel?.querySelector("input[type='checkbox']"));
    const usedControl = Boolean(target.closest(".filter-option, .filter-group-clear, .compact-button, button"));
    if (!usedCheckbox && !usedControl) return;
    setTimeout(() => setOpen(false), 0);
  });

  search?.addEventListener("keydown", event => {
    if (event.key === "Enter") setOpen(false);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") setOpen(false);
  });

  const resizeObserver = typeof ResizeObserver === "function" && header
    ? new ResizeObserver(syncTop)
    : null;
  resizeObserver?.observe(header);
  window.addEventListener("resize", syncTop, { passive: true });
  desktop.addEventListener?.("change", () => {
    syncTop();
    setOpen(false);
  });
  syncTop();
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
    const width = clamp(window.innerWidth - event.clientX, 240, 540);
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
  let saved = Number(localStorage.getItem(DECK_WIDTH_KEY));
  if (localStorage.getItem(DECK_WIDTH_MIGRATION_KEY) !== "1") {
    if (!Number.isFinite(saved) || saved < 240 || saved === 270) {
      saved = 300;
      localStorage.setItem(DECK_WIDTH_KEY, String(saved));
    }
    localStorage.setItem(DECK_WIDTH_MIGRATION_KEY, "1");
  }

  if (!Number.isFinite(saved) || saved < 240) saved = 300;
  document.documentElement.style.setProperty("--deck-panel-width", `${clamp(saved, 240, 540)}px`);
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

function setupAdaptiveCardSize(content) {
  if (!content) return;
  if (!localStorage.getItem(CARD_SIZE_MODE_KEY)) localStorage.setItem(CARD_SIZE_MODE_KEY, "fit");

  const apply = () => {
    if (localStorage.getItem(CARD_SIZE_MODE_KEY) !== "fit") return;
    applyFitCardSize(content);
  };

  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => requestAnimationFrame(apply));
    observer.observe(content);
  } else {
    window.addEventListener("resize", apply, { passive: true });
  }
  requestAnimationFrame(apply);
}

function setupResetView({ resetView, content, deckPanel, renderEverything }) {
  resetView?.addEventListener("click", () => {
    localStorage.setItem(CARD_SIZE_MODE_KEY, "fit");
    applyFitCardSize(content);

    document.documentElement.style.setProperty("--deck-panel-width", "300px");
    localStorage.setItem(DECK_WIDTH_KEY, "300");
    localStorage.setItem(DECK_COMPACT_KEY, "0");
    deckPanel?.classList.remove("compact-deck");
    content?.scrollTo({ top: 0 });
    renderEverything();
  });
}

function enhanceCardSizeControl(content) {
  const control = document.querySelector(".card-size-control");
  const slider = document.getElementById("card-size");
  if (!control || !slider || control.querySelector(".card-size-presets")) return;

  const presets = document.createElement("span");
  presets.className = "card-size-presets";

  const fit = document.createElement("button");
  fit.type = "button";
  fit.className = "card-size-preset";
  fit.dataset.cardSizeMode = "fit";
  fit.textContent = "Fit";
  fit.addEventListener("click", () => {
    localStorage.setItem(CARD_SIZE_MODE_KEY, "fit");
    applyFitCardSize(content, slider, presets);
  });
  presets.appendChild(fit);

  const values = [
    ["S", 90],
    ["M", 118],
    ["L", 154]
  ];

  for (const [label, value] of values) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card-size-preset";
    button.dataset.cardSizeMode = "fixed";
    button.textContent = label;
    button.addEventListener("click", () => {
      setFixedCardSize(value, slider, presets);
    });
    presets.appendChild(button);
  }

  control.appendChild(presets);
  slider.addEventListener("input", () => {
    localStorage.setItem(CARD_SIZE_MODE_KEY, "manual");
    updatePresetState(presets, Number(slider.value), "manual");
  });
  updatePresetState(presets, Number(slider.value), localStorage.getItem(CARD_SIZE_MODE_KEY) || "fit");
}

function setFixedCardSize(value, slider, presets) {
  const size = clamp(value, 74, 190);
  localStorage.setItem(CARD_SIZE_MODE_KEY, "manual");
  localStorage.setItem(CARD_SIZE_KEY, String(size));
  document.documentElement.style.setProperty("--card-width", `${size}px`);
  if (slider) slider.value = String(size);
  updatePresetState(presets, size, "manual");
}

function applyFitCardSize(content, slider = document.getElementById("card-size"), presets = document.querySelector(".card-size-presets")) {
  if (!content) return;
  const style = getComputedStyle(content);
  const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  const usable = Math.max(220, content.clientWidth - padding);
  const gap = 5;
  const target = 156;
  const columns = clamp(Math.round(usable / target), 2, 12);
  const fitted = clamp(Math.floor((usable - gap * (columns - 1)) / columns), 108, 190);

  document.documentElement.style.setProperty("--card-width", `${fitted}px`);
  localStorage.setItem(CARD_SIZE_KEY, String(fitted));
  if (slider) slider.value = String(fitted);
  updatePresetState(presets, fitted, "fit");
}

function updatePresetState(root, value, mode = localStorage.getItem(CARD_SIZE_MODE_KEY) || "fit") {
  if (!root) return;
  const map = { S: 90, M: 118, L: 154 };
  root.querySelectorAll(".card-size-preset").forEach(button => {
    const fit = button.dataset.cardSizeMode === "fit";
    const active = fit ? mode === "fit" : mode !== "fit" && map[button.textContent] === Number(value);
    button.classList.toggle("active", active);
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

function setupClassScrollPersistence({ state, content }) {
  const classFilter = document.getElementById("class-filter");
  if (!classFilter) return;

  restoreClassScroll(content, state.selectedClass);

  classFilter.addEventListener("pointerdown", event => {
    if (!event.target.closest(".class-button")) return;
    saveClassScroll(content, state.selectedClass);
  }, true);

  classFilter.addEventListener("click", event => {
    if (!event.target.closest(".class-button")) return;
    setTimeout(() => restoreClassScroll(content, state.selectedClass), 0);
  });
}

function saveFilters(state) {
  const payload = {};
  for (const [key, set] of Object.entries(state.filters ?? {})) payload[key] = [...set];
  localStorage.setItem(FILTER_KEY, JSON.stringify(payload));
}

function loadFilters(state) {
  let payload = null;
  try { payload = JSON.parse(localStorage.getItem(FILTER_KEY) || "null"); } catch {}
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
        saveFilters(state);
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
