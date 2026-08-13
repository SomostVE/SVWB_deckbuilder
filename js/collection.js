const COLLECTION_FORMAT = "svwb-deck-assistant-collection";
const COLLECTION_VERSION = 1;

// Shadowverse: Worlds Beyond crafting costs per normal card.
// Basic cards are treated as free/unlocked and generated cards are never craftable.
const VIAL_COSTS = Object.freeze({
  Bronze: 50,
  Silver: 90,
  Gold: 750,
  Legendary: 3500
});

export function setupCollectionUI({ state, renderEverything }) {
  const els = {
    open: document.getElementById("open-collection"),
    dialog: document.getElementById("collection-dialog"),
    close: document.getElementById("collection-dialog-close"),
    summary: document.getElementById("collection-summary"),
    text: document.getElementById("collection-text"),
    status: document.getElementById("collection-status"),
    exportButton: document.getElementById("export-collection"),
    mergeButton: document.getElementById("import-collection-merge"),
    replaceButton: document.getElementById("import-collection-replace")
  };

  els.open?.addEventListener("click", () => {
    els.text.value = JSON.stringify(exportCollection(state), null, 2);
    setStatus(els, "Collection export ready.", "info");
    renderDialogSummary(state, els);
    els.dialog?.showModal();
  });

  els.close?.addEventListener("click", () => els.dialog?.close());
  els.dialog?.addEventListener("click", event => {
    if (event.target === els.dialog) els.dialog.close();
  });

  els.exportButton?.addEventListener("click", () => {
    els.text.value = JSON.stringify(exportCollection(state), null, 2);
    setStatus(els, "Collection export refreshed.", "success");
  });

  els.mergeButton?.addEventListener("click", () => importFromTextarea("merge"));
  els.replaceButton?.addEventListener("click", () => importFromTextarea("replace"));

  function importFromTextarea(mode) {
    try {
      const payload = JSON.parse(els.text.value);
      const result = importCollection(state, payload, mode);
      persistOwned(state);
      renderEverything();
      renderDialogSummary(state, els);
      setStatus(
        els,
        `${mode === "merge" ? "Merged" : "Replaced"}: ${result.imported} entries · ${result.unresolved} unresolved ID${result.unresolved === 1 ? "" : "s"} preserved.`,
        "success"
      );
    } catch (error) {
      setStatus(els, `Import failed: ${error.message}`, "error");
    }
  }

  return {
    render() {
      renderCrafting(state);
      renderDialogSummary(state, els);
    },
    calculate() {
      return calculateCrafting(state);
    }
  };
}

export function exportCollection(state) {
  const cards = [...state.owned.entries()]
    .map(([idValue, qtyValue]) => {
      const cardId = Number(idValue);
      const owned = clampOwned(qtyValue);
      if (!Number.isFinite(cardId) || owned <= 0) return null;
      const card = state.cardMap.get(cardId);
      return {
        cardId,
        owned,
        name: card?.name ?? null,
        class: card?.class ?? null,
        setId: Number.isFinite(Number(card?.setId)) ? Number(card.setId) : null,
        set: card?.set ?? null,
        rarity: card?.rarity ?? null
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const cardA = state.cardMap.get(a.cardId);
      const cardB = state.cardMap.get(b.cardId);
      if (!cardA && !cardB) return a.cardId - b.cardId;
      if (!cardA) return 1;
      if (!cardB) return -1;
      return cardA.class.localeCompare(cardB.class) || Number(cardA.cost) - Number(cardB.cost) || cardA.name.localeCompare(cardB.name);
    });

  return {
    format: COLLECTION_FORMAT,
    version: COLLECTION_VERSION,
    exportedAt: new Date().toISOString(),
    databaseGeneratedAt: state.metadata?.generatedAt ?? null,
    note: "Ownership is keyed by the official card ID. Names, effects, rarities and sets are snapshots only.",
    cards
  };
}

export function importCollection(state, payload, mode = "merge") {
  const entries = normalizeCollectionPayload(payload);
  if (!entries.length && !isRecognizedEmptyCollection(payload)) {
    throw new Error("No collection entries found in this JSON.");
  }

  const next = mode === "replace" ? new Map() : new Map(state.owned);
  let imported = 0;
  let unresolved = 0;

  for (const entry of entries) {
    const resolved = resolveCollectionEntry(state, entry);
    if (!resolved) continue;

    const { id, card } = resolved;
    if (card && !card.deckSelectable) continue;

    const qty = Math.min(card?.maxCopies ?? 3, clampOwned(entry.owned));
    if (qty <= 0) {
      if (mode === "replace") next.delete(id);
      continue;
    }

    if (mode === "merge") next.set(id, Math.max(Number(next.get(id)) || 0, qty));
    else next.set(id, qty);

    imported++;
    if (!card) unresolved++;
  }

  state.owned = next;
  return { imported, unresolved };
}

export function calculateCrafting(state) {
  const deck = getMainDeckMap(state.deck);
  const byRarity = new Map(Object.keys(VIAL_COSTS).map(rarity => [rarity, {
    rarity,
    required: 0,
    missing: 0,
    totalVials: 0,
    missingVials: 0
  }]));

  const missingCards = [];
  let requiredCopies = 0;
  let ownedCopiesUsed = 0;
  let missingCopies = 0;
  let totalVials = 0;
  let missingVials = 0;

  for (const [id, qtyValue] of deck.entries()) {
    const card = state.cardMap.get(Number(id));
    const required = Number(qtyValue) || 0;
    if (!card || required <= 0) continue;

    requiredCopies += required;
    const basic = isBasic(card);
    const unitCost = getCraftCost(card);
    const ownedRaw = basic ? required : Math.max(0, Number(state.owned.get(card.id)) || 0);
    const ownedUsed = Math.min(required, ownedRaw);
    const missing = basic ? 0 : Math.max(0, required - ownedUsed);

    ownedCopiesUsed += ownedUsed;
    missingCopies += missing;
    totalVials += required * unitCost;
    missingVials += missing * unitCost;

    const rarityStats = byRarity.get(card.rarity);
    if (rarityStats) {
      rarityStats.required += required;
      rarityStats.missing += missing;
      rarityStats.totalVials += required * unitCost;
      rarityStats.missingVials += missing * unitCost;
    }

    if (missing > 0) {
      missingCards.push({
        card,
        required,
        owned: ownedUsed,
        missing,
        unitCost,
        vialCost: missing * unitCost
      });
    }
  }

  missingCards.sort((a, b) => b.vialCost - a.vialCost || b.missing - a.missing || a.card.name.localeCompare(b.card.name));

  return {
    requiredCopies,
    ownedCopiesUsed,
    missingCopies,
    totalVials,
    missingVials,
    byRarity: [...byRarity.values()],
    missingCards
  };
}

function renderCrafting(state) {
  const stats = calculateCrafting(state);
  const deckList = document.getElementById("deck-list");
  const analysis = document.getElementById("deck-analysis");

  deckList?.querySelector(".deck-craft-summary")?.remove();
  const costStrip = deckList?.querySelector(".deck-cost-strip");
  if (costStrip) {
    const summary = document.createElement("div");
    summary.className = "deck-craft-summary";
    summary.innerHTML = `
      <span>Vials</span>
      <span>Total <strong>${formatNumber(stats.totalVials)}</strong></span>
      <span>Missing <strong class="craft-missing-value">${formatNumber(stats.missingVials)}</strong></span>
    `;
    costStrip.insertAdjacentElement("afterend", summary);
  }

  if (!analysis) return;
  analysis.querySelector(".crafting-analysis")?.remove();

  const section = document.createElement("div");
  section.className = "analysis-section crafting-analysis";
  section.innerHTML = `
    <h3>Collection & crafting</h3>
    <div class="analysis-grid crafting-overview-grid">
      <div class="analysis-card"><strong>${formatNumber(stats.totalVials)}</strong>Total vials from zero</div>
      <div class="analysis-card"><strong class="craft-missing-value">${formatNumber(stats.missingVials)}</strong>Vials still needed</div>
      <div class="analysis-card"><strong>${stats.ownedCopiesUsed}/${stats.requiredCopies}</strong>Required copies owned</div>
      <div class="analysis-card"><strong>${stats.missingCopies}</strong>Missing copies</div>
    </div>
    <div class="craft-rarity-breakdown">
      ${stats.byRarity.map(item => `
        <div class="craft-rarity-row">
          <strong>${escapeHtml(item.rarity)}</strong>
          <span>${item.missing}/${item.required} missing</span>
          <span>${formatNumber(item.missingVials)} vials</span>
        </div>
      `).join("")}
    </div>
    <div class="craft-missing-list">
      ${stats.missingCards.length ? stats.missingCards.map(item => `
        <div class="craft-missing-card">
          <img src="${escapeAttr(item.card.image)}" alt="">
          <div>
            <strong>${escapeHtml(item.card.name)}</strong>
            <span>Owned ${item.owned}/${item.required} · Missing ${item.missing}</span>
          </div>
          <strong>${formatNumber(item.vialCost)}</strong>
        </div>
      `).join("") : `<div class="analysis-warning info">No craftable cards are missing from the current main deck.</div>`}
    </div>
    <p class="craft-note">Main deck only. Workbench cards are not included. Basic cards are treated as available at 0 vials.</p>
  `;
  analysis.appendChild(section);
}

function renderDialogSummary(state, els) {
  if (!els.summary) return;
  const entries = [...state.owned.entries()].filter(([, qty]) => Number(qty) > 0);
  const copies = entries.reduce((sum, [, qty]) => sum + clampOwned(qty), 0);
  const unresolved = entries.filter(([id]) => !state.cardMap.has(Number(id))).length;
  const latestSetCount = new Set(state.cards.filter(card => card.deckSelectable).map(card => card.setId)).size;

  els.summary.innerHTML = `
    <div><strong>${entries.length}</strong><span>Tracked cards</span></div>
    <div><strong>${copies}</strong><span>Owned copies</span></div>
    <div><strong>${unresolved}</strong><span>Unresolved IDs</span></div>
    <div><strong>${latestSetCount}</strong><span>Sets in database</span></div>
  `;
}

function normalizeCollectionPayload(payload) {
  if (Array.isArray(payload)) return payload.map(normalizeEntry).filter(Boolean);

  if (Array.isArray(payload?.cards)) {
    return payload.cards.map(normalizeEntry).filter(Boolean);
  }

  if (Array.isArray(payload?.owned)) {
    return payload.owned.map(entry => {
      if (Array.isArray(entry)) return normalizeEntry({ cardId: entry[0], owned: entry[1] });
      return normalizeEntry(entry);
    }).filter(Boolean);
  }

  return [];
}

function normalizeEntry(entry) {
  if (Array.isArray(entry)) entry = { cardId: entry[0], owned: entry[1] };
  if (!entry || typeof entry !== "object") return null;

  const cardId = Number(entry.cardId ?? entry.id);
  const owned = clampOwned(entry.owned ?? entry.qty ?? entry.quantity);
  if (!Number.isFinite(cardId)) return null;

  return {
    cardId,
    owned,
    name: entry.name ? String(entry.name) : null,
    setId: Number.isFinite(Number(entry.setId)) ? Number(entry.setId) : null
  };
}

function resolveCollectionEntry(state, entry) {
  const exact = state.cardMap.get(entry.cardId);
  if (exact) return { id: exact.id, card: exact };

  if (entry.name && entry.setId !== null) {
    const matches = state.cards.filter(card => card.name === entry.name && Number(card.setId) === entry.setId);
    if (matches.length === 1) return { id: matches[0].id, card: matches[0] };
  }

  // Preserve an unknown official ID instead of dropping it. If the local card
  // database is older than the collection file, a later data update will make
  // this ownership entry resolve automatically.
  return { id: entry.cardId, card: null };
}

function isRecognizedEmptyCollection(payload) {
  return payload?.format === COLLECTION_FORMAT && Array.isArray(payload.cards) && payload.cards.length === 0;
}

function getMainDeckMap(deck) {
  const main = new Map();
  let remaining = 40;
  for (const [id, qty] of deck.entries()) {
    if (remaining <= 0) break;
    const count = Math.min(Math.max(0, Number(qty) || 0), remaining);
    if (count > 0) main.set(Number(id), count);
    remaining -= count;
  }
  return main;
}

function getCraftCost(card) {
  if (!card?.deckSelectable || isBasic(card)) return 0;
  return VIAL_COSTS[card.rarity] ?? 0;
}

function isBasic(card) {
  return Number(card?.setId) === 10000 || String(card?.set ?? "").toLowerCase() === "basic";
}

function persistOwned(state) {
  const payload = {
    deck: Array.from(state.deck.entries()),
    deckMarks: Array.from(state.deckMarks.entries()),
    favorites: Array.from(state.favorites.values()),
    owned: Array.from(state.owned.entries()),
    excluded: Array.from(state.excluded.values()),
    savedDecks: state.savedDecks ?? {},
    preferences: {
      selectedClass: state.selectedClass,
      includeNeutral: state.includeNeutral,
      showGenerated: state.showGenerated,
      showExcluded: state.showExcluded,
      showUnavailableFilters: state.showUnavailableFilters,
      favoritesOnly: state.favoritesOnly
    }
  };
  localStorage.setItem("shadowverse-deck-assistant:v2", JSON.stringify(payload));
}

function setStatus(els, text, type) {
  if (!els.status) return;
  els.status.textContent = text;
  els.status.dataset.type = type;
}

function clampOwned(value) {
  return Math.max(0, Math.min(3, Math.floor(Number(value) || 0)));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
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
