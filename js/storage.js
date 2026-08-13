const KEY = "shadowverse-deck-assistant:v1";

export function saveDeck(deck) {
  const payload = Array.from(deck.entries());
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function loadDeck() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw));
  } catch {
    return new Map();
  }
}
