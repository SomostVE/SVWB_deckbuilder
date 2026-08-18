import fs from "node:fs";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing patch target: ${label}`);
  return source.replace(before, after);
}

function patchFile(path, patcher) {
  const before = fs.readFileSync(path, "utf8");
  const after = patcher(before);
  if (after === before) throw new Error(`No changes produced for ${path}`);
  fs.writeFileSync(path, after);
  console.log(`Patched ${path}`);
}

patchFile("js/filters.js", source => {
  source = replaceOnce(
    source,
    `export const CLASSES = [\n  "Forestcraft",\n  "Swordcraft",\n  "Runecraft",\n  "Dragoncraft",\n  "Abysscraft",\n  "Havencraft",\n  "Portalcraft"\n];\n`,
    `export const CLASSES = [\n  "Forestcraft",\n  "Swordcraft",\n  "Runecraft",\n  "Dragoncraft",\n  "Abysscraft",\n  "Havencraft",\n  "Portalcraft"\n];\n\nexport function pruneUnavailableFilters() {\n  const available = state.cards.filter(card =>\n    card.class === state.selectedClass ||\n    (state.includeNeutral && card.class === "Neutral")\n  );\n\n  const valid = {\n    sets: new Set(available.map(card => card.set).filter(Boolean)),\n    types: new Set(available.map(card => card.type).filter(Boolean)),\n    rarities: new Set(available.map(card => card.rarity).filter(Boolean)),\n    traits: new Set(available.flatMap(card => card.traits ?? []).filter(value => value && value !== "-")),\n    keywords: new Set(available.flatMap(card => card.keywords ?? []).filter(value => value && value !== "-"))\n  };\n\n  let changed = false;\n  for (const [key, allowed] of Object.entries(valid)) {\n    const selected = state.filters[key];\n    if (!selected) continue;\n    for (const value of [...selected]) {\n      if (allowed.has(value)) continue;\n      selected.delete(value);\n      changed = true;\n    }\n  }\n  return changed;\n}\n`,
    "filters: add carry-over sanitizer"
  );
  return source;
});

patchFile("js/qol.js", source => {
  source = replaceOnce(source,
    `const FILTER_KEY_PREFIX = "svwb-class-filters:";`,
    `const FILTER_KEY = "svwb-filters";`,
    "qol: global filter key"
  );

  source = replaceOnce(source,
    `  setupInteractionHint();\n  setupClassFilterPersistence({ state, content, renderEverything });`,
    `  setupInteractionHint();\n  loadFilters(state);\n  setupClassScrollPersistence({ state, content });`,
    "qol: initialize global filters"
  );

  source = replaceOnce(source,
    `    saveCurrentClassFilters() {\n      saveClassFilters(state);\n    }`,
    `    saveCurrentClassFilters() {\n      saveFilters(state);\n    },\n    renderActiveFilters() {\n      renderActiveFilters(state, renderEverything);\n    }`,
    "qol: expose global filter persistence"
  );

  const persistenceStart = source.indexOf(`function setupClassFilterPersistence(`);
  const renderActiveStart = source.indexOf(`function renderActiveFilters(`);
  if (persistenceStart < 0 || renderActiveStart < 0 || renderActiveStart <= persistenceStart) {
    throw new Error("Missing patch target: qol class persistence block");
  }
  const replacement = `function setupClassScrollPersistence({ state, content }) {\n  const classFilter = document.getElementById("class-filter");\n  if (!classFilter) return;\n\n  restoreClassScroll(content, state.selectedClass);\n\n  classFilter.addEventListener("pointerdown", event => {\n    if (!event.target.closest(".class-button")) return;\n    saveClassScroll(content, state.selectedClass);\n  }, true);\n\n  classFilter.addEventListener("click", event => {\n    if (!event.target.closest(".class-button")) return;\n    setTimeout(() => restoreClassScroll(content, state.selectedClass), 0);\n  });\n}\n\nfunction saveFilters(state) {\n  const payload = {};\n  for (const [key, set] of Object.entries(state.filters ?? {})) payload[key] = [...set];\n  localStorage.setItem(FILTER_KEY, JSON.stringify(payload));\n}\n\nfunction loadFilters(state) {\n  let payload = null;\n  try { payload = JSON.parse(localStorage.getItem(FILTER_KEY) || "null"); } catch {}\n  for (const [key, set] of Object.entries(state.filters ?? {})) {\n    set.clear();\n    for (const value of payload?.[key] ?? []) set.add(value);\n  }\n}\n\nfunction saveClassScroll(content, className) {\n  if (!content) return;\n  localStorage.setItem(\`${SCROLL_KEY_PREFIX}\${className}\`, String(content.scrollTop || 0));\n}\n\nfunction restoreClassScroll(content, className) {\n  if (!content) return;\n  const value = Number(localStorage.getItem(\`${SCROLL_KEY_PREFIX}\${className}\`)) || 0;\n  requestAnimationFrame(() => { content.scrollTop = value; });\n}\n\n`;
  source = source.slice(0, persistenceStart) + replacement + source.slice(renderActiveStart);

  source = source.replaceAll("saveClassFilters(state);", "saveFilters(state);");
  return source;
});

patchFile("js/app.js", source => {
  source = replaceOnce(source,
    `import { CLASSES, filteredCards } from "./filters.js";`,
    `import { CLASSES, filteredCards, pruneUnavailableFilters } from "./filters.js";`,
    "app: import filter sanitizer"
  );

  source = replaceOnce(source,
    `    qol = setupQol({ state, renderEverything, renderCards, undoDeck, redoDeck });\n    collectionUi = setupCollectionUI({ state, renderEverything });`,
    `    qol = setupQol({ state, renderEverything, renderCards, undoDeck, redoDeck });\n    pruneUnavailableFilters();\n    qol?.saveCurrentClassFilters();\n    collectionUi = setupCollectionUI({ state, renderEverything });`,
    "app: sanitize restored filters"
  );

  source = replaceOnce(source,
    `  els.search.addEventListener("input", event => {\n    state.search = event.target.value;\n    state.discoverCardId = null;\n    renderCards();\n  });`,
    `  els.search.addEventListener("input", event => {\n    state.search = event.target.value;\n    state.discoverCardId = null;\n    renderCards();\n    qol?.renderActiveFilters?.();\n  });`,
    "app: sync search chip"
  );

  for (const [name, field] of [
    ["favoritesOnly", "favoritesOnly"],
    ["showGenerated", "showGenerated"],
    ["showExcluded", "showExcluded"]
  ]) {
    source = replaceOnce(source,
      `  els.${name}.addEventListener("change", () => {\n    state.${field} = els.${name}.checked;\n    persist();\n    renderCards();\n  });`,
      `  els.${name}.addEventListener("change", () => {\n    state.${field} = els.${name}.checked;\n    persist();\n    refreshFilterView();\n  });`,
      `app: refresh ${name} filters`
    );
  }

  source = replaceOnce(source,
    `  els.resetFilters.addEventListener("click", () => {\n    resetFilters();\n    els.search.value = "";\n    renderEverything();\n  });`,
    `  els.resetFilters.addEventListener("click", () => {\n    resetFilters();\n    els.search.value = "";\n    qol?.saveCurrentClassFilters();\n    renderEverything();\n  });`,
    "app: persist reset filters"
  );

  source = replaceOnce(source,
    `function renderEverything() {\n  syncControls();\n  renderClassFilter();\n  renderFilterGroups();\n  renderArchetypes();\n  renderPackageBrowser();\n  renderCostFilter();\n  renderCards();\n  renderDeck();\n  renderAnalysis();\n  collectionUi?.render();\n  renderSavedDecks();\n  updateHistoryButtons();\n  qol?.render();\n}\n`,
    `function renderEverything() {\n  syncControls();\n  renderClassFilter();\n  renderFilterGroups();\n  renderArchetypes();\n  renderPackageBrowser();\n  renderCostFilter();\n  renderCards();\n  renderDeck();\n  renderAnalysis();\n  collectionUi?.render();\n  renderSavedDecks();\n  updateHistoryButtons();\n  qol?.render();\n}\n\nfunction refreshFilterView() {\n  renderFilterGroups();\n  renderArchetypes();\n  renderCostFilter();\n  renderCards();\n  qol?.render();\n}\n`,
    "app: add atomic filter refresh"
  );

  source = replaceOnce(source,
    `    button.addEventListener("click", () => {\n      state.selectedClass = className;\n      state.discoverCardId = null;\n      persist();\n      renderEverything();\n    });`,
    `    button.addEventListener("click", () => {\n      state.selectedClass = className;\n      state.discoverCardId = null;\n      pruneUnavailableFilters();\n      qol?.saveCurrentClassFilters();\n      persist();\n      renderEverything();\n    });`,
    "app: preserve valid filters across classes"
  );

  source = replaceOnce(source,
    `  checkbox.addEventListener("change", () => {\n    state.includeNeutral = checkbox.checked;\n    state.discoverCardId = null;\n    persist();\n    renderEverything();\n  });`,
    `  checkbox.addEventListener("change", () => {\n    state.includeNeutral = checkbox.checked;\n    state.discoverCardId = null;\n    pruneUnavailableFilters();\n    qol?.saveCurrentClassFilters();\n    persist();\n    renderEverything();\n  });`,
    "app: sanitize filters after neutral toggle"
  );

  source = replaceOnce(source,
    `    input.addEventListener("change", () => {\n      if (input.checked) targetSet.add(value);\n      else targetSet.delete(value);\n      qol?.saveCurrentClassFilters();\n      renderCards();\n      renderArchetypes();\n    });`,
    `    input.addEventListener("change", () => {\n      if (input.checked) targetSet.add(value);\n      else targetSet.delete(value);\n      qol?.saveCurrentClassFilters();\n      refreshFilterView();\n    });`,
    "app: atomically refresh checkbox filters"
  );

  source = replaceOnce(source,
    `    button.addEventListener("click", () => {\n      if (state.filters.traits.has(trait)) state.filters.traits.delete(trait);\n      else state.filters.traits.add(trait);\n      renderFilterGroups();\n      renderArchetypes();\n      renderCards();\n    });`,
    `    button.addEventListener("click", () => {\n      if (state.filters.traits.has(trait)) state.filters.traits.delete(trait);\n      else state.filters.traits.add(trait);\n      qol?.saveCurrentClassFilters();\n      refreshFilterView();\n    });`,
    "app: atomically refresh archetype filter"
  );

  return source;
});

console.log("Filter state fix materialized.");
