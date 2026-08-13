import { state } from "./state.js";
import { saveDeck } from "./storage.js";

export const MAX_DECK_SIZE = 40;

export function getDeckSize() {
  let total = 0;
  for (const qty of state.deck.values()) total += qty;
  return total;
}

export function addCard(card) {
  const current = state.deck.get(card.id) ?? 0;
  const maxCopies = card.maxCopies ?? 3;
  if (current >= maxCopies) return;
  if (getDeckSize() >= MAX_DECK_SIZE) return;

  state.deck.set(card.id, current + 1);
  saveDeck(state.deck);
}

export function removeCard(card) {
  const current = state.deck.get(card.id) ?? 0;
  if (current <= 1) state.deck.delete(card.id);
  else state.deck.set(card.id, current - 1);
  saveDeck(state.deck);
}

export function clearDeck() {
  state.deck.clear();
  saveDeck(state.deck);
}
