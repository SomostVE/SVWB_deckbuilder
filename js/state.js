export const state = {
  cards: [],
  cardMap: new Map(),
  metadata: {},
  packages: [],
  customTags: {},
  globalExclusions: new Set(),

  selectedClass: "Forestcraft",
  includeNeutral: true,
  showGenerated: false,
  showExcluded: false,
  favoritesOnly: false,
  discoverCardId: null,
  search: "",

  filters: {
    costs: new Set(),
    sets: new Set(),
    types: new Set(),
    rarities: new Set(),
    traits: new Set(),
    keywords: new Set()
  },

  deck: new Map(),
  deckMarks: new Map(),
  favorites: new Set(),
  owned: new Map(),
  excluded: new Set(),
  savedDecks: {},

  history: [],
  future: []
};

export function resetFilters() {
  state.search = "";
  state.discoverCardId = null;
  state.favoritesOnly = false;
  for (const key of Object.keys(state.filters)) {
    state.filters[key].clear();
  }
}
