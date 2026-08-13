import { state } from "./state.js";
import { saveWorkspace } from "./storage.js";

export const MAX_DECK_SIZE = 40;
const HISTORY_LIMIT = 60;

export function getDeckSize() {
  let total = 0;
  for (const qty of state.deck.values()) total += Number(qty) || 0;
  return total;
}

export function addCard(card, quantity = 1) {
  if (!card?.deckSelectable) return false;

  const current = state.deck.get(card.id) ?? 0;
  const maxCopies = Number(card.maxCopies ?? 3);
  const roomInDeck = MAX_DECK_SIZE - getDeckSize();
  const allowed = Math.min(Number(quantity) || 1, maxCopies - current, roomInDeck);
  if (allowed <= 0) return false;

  pushHistory();
  state.deck.set(card.id, current + allowed);
  persist();
  return true;
}

export function addCards(entries, cardMap = state.cardMap) {
  const normalized = [];
  let remaining = MAX_DECK_SIZE - getDeckSize();

  for (const entry of entries ?? []) {
    const card = cardMap.get(Number(entry.id));
    if (!card?.deckSelectable || remaining <= 0) continue;
    const current = state.deck.get(card.id) ?? 0;
    const wanted = Number(entry.count ?? entry.quantity ?? 1);
    const add = Math.min(wanted, Number(card.maxCopies ?? 3) - current, remaining);
    if (add > 0) {
      normalized.push([card, add]);
      remaining -= add;
    }
  }

  if (!normalized.length) return false;
  pushHistory();
  for (const [card, add] of normalized) {
    state.deck.set(card.id, (state.deck.get(card.id) ?? 0) + add);
  }
  persist();
  return true;
}

export function removeCard(card, quantity = 1) {
  const current = state.deck.get(card?.id) ?? 0;
  if (current <= 0) return false;

  pushHistory();
  const next = current - (Number(quantity) || 1);
  if (next <= 0) {
    state.deck.delete(card.id);
    state.deckMarks.delete(card.id);
  } else {
    state.deck.set(card.id, next);
  }
  persist();
  return true;
}

export function clearDeck() {
  if (!state.deck.size) return false;
  pushHistory();
  state.deck.clear();
  state.deckMarks.clear();
  persist();
  return true;
}

export function setDeckMark(cardId, mark) {
  const id = Number(cardId);
  if (!state.deck.has(id)) return;
  if (!mark) state.deckMarks.delete(id);
  else state.deckMarks.set(id, mark);
  persist();
}

export function undoDeck() {
  const snapshot = state.history.pop();
  if (!snapshot) return false;
  state.future.push(captureSnapshot());
  restoreSnapshot(snapshot);
  persist();
  return true;
}

export function redoDeck() {
  const snapshot = state.future.pop();
  if (!snapshot) return false;
  state.history.push(captureSnapshot());
  restoreSnapshot(snapshot);
  persist();
  return true;
}

export function saveVariant(name) {
  const cleanName = String(name ?? "").trim();
  if (!cleanName) return false;

  state.savedDecks[cleanName] = {
    name: cleanName,
    savedAt: new Date().toISOString(),
    class: state.selectedClass,
    includeNeutral: state.includeNeutral,
    deck: Array.from(state.deck.entries()),
    marks: Array.from(state.deckMarks.entries())
  };
  persist();
  return true;
}

export function loadVariant(name) {
  const variant = state.savedDecks?.[name];
  if (!variant) return false;

  pushHistory();
  state.deck = new Map((variant.deck ?? []).map(([id, qty]) => [Number(id), Number(qty)]));
  state.deckMarks = new Map((variant.marks ?? []).map(([id, mark]) => [Number(id), mark]));
  if (variant.class) state.selectedClass = variant.class;
  if (typeof variant.includeNeutral === "boolean") state.includeNeutral = variant.includeNeutral;
  persist();
  return true;
}

export function deleteVariant(name) {
  if (!state.savedDecks?.[name]) return false;
  delete state.savedDecks[name];
  persist();
  return true;
}

export function getVariant(name) {
  if (name === "__current__") {
    return {
      name: "Current",
      class: state.selectedClass,
      deck: Array.from(state.deck.entries()),
      marks: Array.from(state.deckMarks.entries())
    };
  }
  return state.savedDecks?.[name] ?? null;
}

function pushHistory() {
  state.history.push(captureSnapshot());
  if (state.history.length > HISTORY_LIMIT) state.history.shift();
  state.future.length = 0;
}

function captureSnapshot() {
  return {
    deck: Array.from(state.deck.entries()),
    marks: Array.from(state.deckMarks.entries()),
    selectedClass: state.selectedClass,
    includeNeutral: state.includeNeutral
  };
}

function restoreSnapshot(snapshot) {
  state.deck = new Map((snapshot.deck ?? []).map(([id, qty]) => [Number(id), Number(qty)]));
  state.deckMarks = new Map((snapshot.marks ?? []).map(([id, mark]) => [Number(id), mark]));
  if (snapshot.selectedClass) state.selectedClass = snapshot.selectedClass;
  if (typeof snapshot.includeNeutral === "boolean") state.includeNeutral = snapshot.includeNeutral;
}

function persist() {
  saveWorkspace(state);
}
