export const state = {
  cards: [],
  cardMap: new Map(),
  metadata: {},
  packages: [],
  customTags: {},
  globalExclusions: new Set(),

  selectedClass: "Forestcraft",
  includeNeutral: true,
  format: "Unlimited",
  showGenerated: false,
  showExcluded: false,
  showUnavailableFilters: false,
  favoritesOnly: false,
  ownedOnly: false,
  missingOnly: false,
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
  state.ownedOnly = false;
  state.missingOnly = false;
  for (const key of Object.keys(state.filters)) {
    state.filters[key].clear();
  }
}
