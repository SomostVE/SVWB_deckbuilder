const KEY = "shadowverse-deck-assistant:v2";
const LEGACY_KEY = "shadowverse-deck-assistant:v1";

export function loadWorkspace() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeWorkspace(JSON.parse(raw));

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      return normalizeWorkspace({ deck: JSON.parse(legacy) });
    }
  } catch (error) {
    console.warn("Unable to load workspace", error);
  }

  return normalizeWorkspace({});
}

export function saveWorkspace(state) {
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
      format: state.format ?? "Unlimited",
      showGenerated: state.showGenerated,
      showExcluded: state.showExcluded,
      showUnavailableFilters: state.showUnavailableFilters,
      favoritesOnly: state.favoritesOnly,
      ownedOnly: state.ownedOnly,
      missingOnly: state.missingOnly
    }
  };

  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function applyWorkspace(state, workspace) {
  state.deck = new Map(workspace.deck ?? []);
  state.deckMarks = new Map(workspace.deckMarks ?? []);
  state.favorites = new Set(workspace.favorites ?? []);
  state.owned = new Map(workspace.owned ?? []);
  state.excluded = new Set(workspace.excluded ?? []);
  state.savedDecks = workspace.savedDecks ?? {};

  const prefs = workspace.preferences ?? {};
  if (prefs.selectedClass) state.selectedClass = prefs.selectedClass;
  if (typeof prefs.includeNeutral === "boolean") state.includeNeutral = prefs.includeNeutral;
  if (["Rotation", "Unlimited", "Boundless"].includes(prefs.format)) state.format = prefs.format;
  if (typeof prefs.showGenerated === "boolean") state.showGenerated = prefs.showGenerated;
  if (typeof prefs.showExcluded === "boolean") state.showExcluded = prefs.showExcluded;
  if (typeof prefs.showUnavailableFilters === "boolean") state.showUnavailableFilters = prefs.showUnavailableFilters;
  if (typeof prefs.favoritesOnly === "boolean") state.favoritesOnly = prefs.favoritesOnly;
  if (typeof prefs.ownedOnly === "boolean") state.ownedOnly = prefs.ownedOnly;
  if (typeof prefs.missingOnly === "boolean") state.missingOnly = prefs.missingOnly;
}

export function exportCurrentDeck(state) {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    class: state.selectedClass,
    format: state.format ?? "Unlimited",
    includeNeutral: state.includeNeutral,
    deck: Array.from(state.deck.entries()),
    marks: Array.from(state.deckMarks.entries())
  };
}

export function importDeckPayload(state, payload) {
  const deck = Array.isArray(payload?.deck) ? payload.deck : [];
  state.deck = new Map(deck.map(([id, qty]) => [Number(id), Number(qty)]));
  state.deckMarks = new Map((payload?.marks ?? payload?.deckMarks ?? []).map(([id, mark]) => [Number(id), mark]));
  if (payload?.class) state.selectedClass = payload.class;
  if (["Rotation", "Unlimited", "Boundless"].includes(payload?.format)) state.format = payload.format;
  if (typeof payload?.includeNeutral === "boolean") state.includeNeutral = payload.includeNeutral;
}

export function encodeSharePayload(state) {
  const payload = {
    c: state.selectedClass,
    f: state.format ?? "Unlimited",
    n: state.includeNeutral ? 1 : 0,
    d: Array.from(state.deck.entries()),
    m: Array.from(state.deckMarks.entries())
  };

  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeSharePayload(value) {
  try {
    const normalized = String(value ?? "").replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return {
      class: payload.c,
      format: ["Rotation", "Unlimited", "Boundless"].includes(payload.f) ? payload.f : "Unlimited",
      includeNeutral: Boolean(payload.n),
      deck: payload.d ?? [],
      marks: payload.m ?? []
    };
  } catch {
    return null;
  }
}

function normalizeWorkspace(value) {
  return {
    deck: Array.isArray(value?.deck) ? value.deck.map(([id, qty]) => [Number(id), Number(qty)]) : [],
    deckMarks: Array.isArray(value?.deckMarks) ? value.deckMarks.map(([id, mark]) => [Number(id), mark]) : [],
    favorites: Array.isArray(value?.favorites) ? value.favorites.map(Number) : [],
    owned: Array.isArray(value?.owned) ? value.owned.map(([id, qty]) => [Number(id), Number(qty)]) : [],
    excluded: Array.isArray(value?.excluded) ? value.excluded.map(Number) : [],
    savedDecks: value?.savedDecks && typeof value.savedDecks === "object" ? value.savedDecks : {},
    preferences: value?.preferences && typeof value.preferences === "object" ? value.preferences : {}
  };
}
