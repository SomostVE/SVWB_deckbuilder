from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"Missing expected {label} marker")
    return text.replace(old, new, 1)

# collection.html
path = ROOT / "collection.html"
html = path.read_text()
html = replace_once(
    html,
    '      </div>\n\n      <div class="collection-browser-toolbar">',
    '''      </div>\n\n      <div id="collection-missing-tools" class="collection-missing-tools" hidden>\n        <div id="collection-missing-summary" class="tools-stats collection-missing-summary"></div>\n        <label class="collection-missing-group-label"><span>Group missing cards</span>\n          <select id="collection-missing-group">\n            <option value="">No grouping</option>\n            <option value="set">Set</option>\n            <option value="class">Class</option>\n            <option value="rarity">Rarity</option>\n          </select>\n        </label>\n      </div>\n\n      <div class="collection-browser-toolbar">''',
    "missing tools insertion",
)
html = html.replace(
    "Track unique cards and completed playsets separately. Click a set to open it in the browser.",
    "Track unique cards and completed playsets separately. Click a set to open its missing cards in the browser.",
)
html = html.replace("01.02.002", "01.02.003")
path.write_text(html)

# js/collection-page.js
path = ROOT / "js/collection-page.js"
js = path.read_text()
js = replace_once(
    js,
    '  resultsCount: document.getElementById("collection-results-count"),\n',
    '  resultsCount: document.getElementById("collection-results-count"),\n  missingTools: document.getElementById("collection-missing-tools"),\n  missingSummary: document.getElementById("collection-missing-summary"),\n  missingGroup: document.getElementById("collection-missing-group"),\n',
    "collection element registry",
)
js = replace_once(
    js,
    '  els.setSort?.addEventListener("change", renderSetProgress);\n',
    '  els.setSort?.addEventListener("change", renderSetProgress);\n  els.missingGroup?.addEventListener("change", () => {\n    resetCardLimit();\n    renderCards();\n  });\n',
    "missing grouping event",
)
start = js.index("function renderCards() {")
end = js.index("function matchesOwnershipStatus(card) {", start)
new_render = r'''function renderCards() {
  const q = String(els.search.value ?? "").trim().toLowerCase();
  const className = els.classFilter.value;
  const setName = els.setFilter.value;
  const rarity = els.rarityFilter.value;

  const cards = state.cards.filter(card => card.deckSelectable)
    .filter(card => !className || card.class === className)
    .filter(card => !setName || card.set === setName)
    .filter(card => !rarity || card.rarity === rarity)
    .filter(card => matchesOwnershipStatus(card))
    .filter(card => !q || [card.name, card.set, card.class, card.rarity, ...(card.traits ?? []), ...(card.keywords ?? [])].join(" ").toLowerCase().includes(q));

  sortCards(cards, els.sort?.value || "game");

  const missingView = cardStatus === "missing";
  if (els.missingTools) els.missingTools.hidden = !missingView;
  if (missingView && els.missingSummary) {
    const missingCopies = cards.reduce((sum, card) => sum + Math.max(0, Number(card.maxCopies ?? 3) - owned(card)), 0);
    const missingVials = cards.reduce((sum, card) => sum + Math.max(0, Number(card.maxCopies ?? 3) - owned(card)) * getCraftCost(card), 0);
    els.missingSummary.innerHTML = [
      stat(formatNumber(cards.length), "Missing cards"),
      stat(formatNumber(missingCopies), "Missing copies"),
      stat(formatNumber(missingVials), "Vials needed")
    ].join("");
  } else if (els.missingSummary) {
    els.missingSummary.innerHTML = "";
  }

  const ownedInResults = cards.filter(card => owned(card) > 0).length;
  const visible = cards.slice(0, visibleCardCount);
  els.resultsCount.textContent = `${formatNumber(cards.length)} cards · ${formatNumber(ownedInResults)} owned`;

  const groupMode = missingView ? String(els.missingGroup?.value ?? "") : "";
  if (groupMode) {
    const groups = new Map();
    for (const card of visible) {
      const label = missingGroupLabel(card, groupMode);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(card);
    }
    els.cards.innerHTML = [...groups.entries()].map(([label, groupCards]) => `
      <div class="collection-card-group-heading"><strong>${escapeHtml(label)}</strong><span>${formatNumber(groupCards.length)} cards</span></div>
      ${groupCards.map(renderCollectionCard).join("")}
    `).join("") || `<div class="tools-muted">No cards match these filters.</div>`;
  } else {
    els.cards.innerHTML = visible.map(renderCollectionCard).join("") || `<div class="tools-muted">No cards match these filters.</div>`;
  }

  const shown = visible.length;
  els.loadStatus.textContent = cards.length ? `Showing ${formatNumber(shown)} of ${formatNumber(cards.length)}` : "";
  els.loadMore.hidden = shown >= cards.length;
}

function renderCollectionCard(card) {
  const have = owned(card);
  const max = Number(card.maxCopies ?? 3);
  const missingCost = Math.max(0, max - have) * getCraftCost(card);
  const stateName = have >= max ? "complete" : have > 0 ? "partial" : "missing";
  const stateLabel = stateName === "complete" ? `${have}/${max} complete` : stateName === "partial" ? `${have}/${max} partial` : `${have}/${max} missing`;
  return `<div class="collection-card-row collection-state-${stateName}" data-card-id="${card.id}">
    <img src="${escapeAttr(card.image)}" alt="">
    <div class="collection-card-copy">
      <strong>${escapeHtml(card.name)}</strong>
      <small>${escapeHtml(card.class)} · ${escapeHtml(card.rarity)} · ${escapeHtml(card.set)} · Cost ${card.cost}</small>
      <small>${have < max ? `${formatNumber(missingCost)} vials to ${max}×` : "Playset complete"}</small>
      <span class="collection-card-state">${stateLabel}</span>
    </div>
    <div class="owned-stepper" aria-label="Owned copies">
      <button type="button" data-step="-1" aria-label="Remove one ${escapeAttr(card.name)}">−</button>
      <strong>${have}</strong>
      <button type="button" data-step="1" aria-label="Add one ${escapeAttr(card.name)}">+</button>
    </div>
  </div>`;
}

function missingGroupLabel(card, mode) {
  if (mode === "set") return card.set || "Unknown set";
  if (mode === "class") return card.class || "Unknown class";
  if (mode === "rarity") return card.rarity || "Unknown rarity";
  return "Missing cards";
}

'''
js = js[:start] + new_render + js[end:]
old_open_set = '''function openSetInBrowser(setName) {\n  els.search.value = "";\n  els.classFilter.value = "";\n  els.rarityFilter.value = "";\n  els.setFilter.value = setName;\n  setCardStatus("all");\n  resetCardLimit();\n  switchTab("cards");\n  renderCards();\n}'''
new_open_set = '''function openSetInBrowser(setName) {\n  els.search.value = "";\n  els.classFilter.value = "";\n  els.rarityFilter.value = "";\n  els.setFilter.value = setName;\n  setCardStatus("missing");\n  resetCardLimit();\n  switchTab("cards");\n  renderCards();\n}'''
js = replace_once(js, old_open_set, new_open_set, "set completion browser behavior")
path.write_text(js)

# css/collection-layout.css
path = ROOT / "css/collection-layout.css"
css = path.read_text()
css = replace_once(
    css,
    '    "heading heading"\n    "cards filters"\n',
    '    "heading heading"\n    "missing missing"\n    "cards filters"\n',
    "collection grid areas",
)
css = replace_once(
    css,
    '''#collection-tab-cards .collection-section-head {\n  grid-area: heading;\n  margin-bottom: 0;\n}\n''',
    '''#collection-tab-cards .collection-section-head {\n  grid-area: heading;\n  margin-bottom: 0;\n}\n\n#collection-tab-cards .collection-missing-tools {\n  grid-area: missing;\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) 190px;\n  gap: .75rem;\n  align-items: end;\n  padding: .7rem;\n  border: 1px solid rgba(177,194,224,.18);\n  border-radius: .72rem;\n  background: rgba(17,27,42,.42);\n}\n\n#collection-tab-cards .collection-missing-tools[hidden] {\n  display: none;\n}\n\n.collection-missing-summary {\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  margin: 0;\n}\n\n.collection-missing-group-label {\n  display: grid;\n  gap: .28rem;\n  color: #aebbd0;\n  font-size: .72rem;\n}\n\n.collection-missing-group-label select {\n  width: 100%;\n  min-height: 36px;\n  padding: .42rem .55rem;\n  border: 1px solid rgba(177,194,224,.22);\n  border-radius: .5rem;\n  background: rgba(15,24,38,.62);\n  color: #f6f8fc;\n}\n\n.collection-card-group-heading {\n  grid-column: 1 / -1;\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 1rem;\n  margin-top: .25rem;\n  padding: .38rem .2rem .32rem;\n  border-bottom: 1px solid rgba(177,194,224,.18);\n}\n\n.collection-card-group-heading strong {\n  color: #f5f8ff;\n  font-size: .9rem;\n}\n\n.collection-card-group-heading span {\n  color: #aebbd0;\n  font-size: .68rem;\n}\n''',
    "missing tools CSS",
)
css = css.replace("/* Collection 01.02.001 desktop layout refinements. */", "/* Collection 01.02.003 desktop layout refinements. */")
css = replace_once(
    css,
    '''  #collection-tab-cards.active {\n    display: block;\n  }\n''',
    '''  #collection-tab-cards.active {\n    display: block;\n  }\n\n  #collection-tab-cards .collection-missing-tools {\n    margin-bottom: .85rem;\n  }\n''',
    "tablet missing tools spacing",
)
css = replace_once(
    css,
    '''  .collection-status-filter {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0,1fr));\n    margin-left: 0;\n    border-radius: .62rem;\n  }\n''',
    '''  .collection-status-filter {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0,1fr));\n    margin-left: 0;\n    border-radius: .62rem;\n  }\n\n  #collection-tab-cards .collection-missing-tools {\n    grid-template-columns: 1fr;\n  }\n\n  .collection-missing-summary {\n    grid-template-columns: 1fr;\n  }\n''',
    "mobile missing tools layout",
)
path.write_text(css)

# regression test
path = ROOT / "scripts/check-collection-ui-structure.mjs"
test = path.read_text()
test = replace_once(
    test,
    'const ui = fs.readFileSync("js/collection-ui.js", "utf8");\n',
    'const ui = fs.readFileSync("js/collection-ui.js", "utf8");\nconst page = fs.readFileSync("js/collection-page.js", "utf8");\n',
    "collection page test input",
)
test = test.replace(
    '["collection-tab-cards", "collection-tab-sets", "collection-tab-planner", "collection-cards", "collection-status-filter"]',
    '["collection-tab-cards", "collection-tab-sets", "collection-tab-planner", "collection-cards", "collection-status-filter", "collection-missing-tools", "collection-missing-summary", "collection-missing-group"]',
)
test = replace_once(
    test,
    'assert.ok(ui.includes("showModal"), "Card artwork should support enlarged preview");\n',
    'assert.ok(ui.includes("showModal"), "Card artwork should support enlarged preview");\nassert.ok(page.includes("Missing copies") && page.includes("Vials needed"), "Missing view should expose collection deficit totals");\nassert.ok(page.includes("missingGroupLabel"), "Missing view should support grouping");\nassert.ok(page.includes(\'setCardStatus("missing")\'), "Set completion should open directly on missing cards");\n',
    "missing view regressions",
)
path.write_text(test)

# version
path = ROOT / "version.json"
data = json.loads(path.read_text())
data["version"] = "01.02.003"
path.write_text(json.dumps(data, indent=2) + "\n")
