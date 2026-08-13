import { state } from "./state.js";

export const CLASSES = [
  "Forestcraft",
  "Swordcraft",
  "Runecraft",
  "Dragoncraft",
  "Abysscraft",
  "Havencraft",
  "Portalcraft"
];

export function filteredCards() {
  const q = state.search.trim().toLowerCase();

  return state.cards.filter(card => {
    const classMatch = card.class === state.selectedClass || card.class === "Neutral";
    if (!classMatch) return false;

    if (q) {
      const haystack = [
        card.name,
        card.text,
        card.set,
        ...(card.traits ?? []),
        ...(card.keywords ?? [])
      ].join(" ").toLowerCase();

      if (!haystack.includes(q)) return false;
    }

    if (state.filters.sets.size && !state.filters.sets.has(card.set)) return false;
    if (state.filters.types.size && !state.filters.types.has(card.type)) return false;
    if (state.filters.rarities.size && !state.filters.rarities.has(card.rarity)) return false;

    if (state.filters.traits.size) {
      const traits = new Set(card.traits ?? []);
      if (![...state.filters.traits].every(x => traits.has(x))) return false;
    }

    if (state.filters.keywords.size) {
      const keywords = new Set(card.keywords ?? []);
      if (![...state.filters.keywords].every(x => keywords.has(x))) return false;
    }

    return true;
  });
}
