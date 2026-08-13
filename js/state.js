export const state = {
  cards: [],
  metadata: {},
  selectedClass: "Forestcraft",
  includeNeutral: true,
  search: "",
  filters: {
    sets: new Set(),
    types: new Set(),
    rarities: new Set(),
    traits: new Set(),
    keywords: new Set()
  },
  deck: new Map()
};

export function resetFilters() {
  state.search = "";
  for (const key of Object.keys(state.filters)) {
    state.filters[key].clear();
  }
}
