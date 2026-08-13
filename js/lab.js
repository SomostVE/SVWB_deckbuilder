import { loadData } from "./data-loader.js";
import { state } from "./state.js";
import { loadWorkspace, applyWorkspace, saveWorkspace } from "./storage.js";
import { matchesFormat } from "./filters.js";
import {
  calculateAdvancedStats,
  calculateDeckCrafting,
  checkLegality,
  probabilityAtLeastOne,
  probabilityAtLeastOneAfterMulligan,
  bestReplacements,
  getMainDeckMap,
  getCraftCost
} from "./tools-common.js";

const LAB_KEY = "shadowverse-deck-assistant:lab:v1";
const labState = loadLabState();

const els = {
  format: document.getElementById("lab-format"),
  stats: document.getElementById("lab-stats"),
  legality: document.getElementById("lab-legality"),
  budget: document.getElementById("lab-budget"),
  budgetResult: document.getElementById("lab-budget-result"),
  probCard: document.getElementById("prob-card"),
  probRedraw: document.getElementById("prob-redraw"),
  probTurn: document.getElementById("prob-turn"),
  probResult: document.getElementById("prob-result"),
  compareA: document.getElementById("compare-card-a"),
  compareB: document.getElementById("compare-card-b"),
  compareC: document.getElementById("compare-card-c"),
  compareCards: document.getElementById("lab-card-compare"),
  replacementSource: document.getElementById("replacement-source"),
  replacementOwnedOnly: document.getElementById("replacement-owned-only"),
  replacementResults: document.getElementById("replacement-results"),
  notes: document.getElementById("deck-notes"),
  dependency: document.getElementById("dependency-graph"),
  compareLeft: document.getElementById("lab-compare-left"),
  compareRight: document.getElementById("lab-compare-right"),
  deckCompare: document.getElementById("lab-deck-compare"),
  templateStatus: document.getElementById("template-status")
};

init();

async function init() {
  const { cards, metadata, packages, customTags, globalExclusions } = await loadData();
  state.cards = cards;
  state.cardMap = new Map(cards.map(card => [Number(card.id), card]));
  state.metadata = metadata;
  state.packages = packages;
  state.customTags = customTags;
  state.globalExclusions = globalExclusions;
  applyWorkspace(state, loadWorkspace());

  els.format.value = state.format ?? "Rotation";
  populateSelectors();
  bindEvents();
  renderAll();
}

function bindEvents() {
  els.format.addEventListener("change", () => {
    state.format = els.format.value;
    saveWorkspace(state);
    populateSelectors();
    renderAll();
  });
  [els.probCard, els.probRedraw, els.probTurn].forEach(el => el.addEventListener("change", renderProbability));
  [els.compareA, els.compareB, els.compareC].forEach(el => el.addEventListener("change", renderCardComparison));
  [els.replacementSource, els.replacementOwnedOnly].forEach(el => el.addEventListener("change", renderReplacements));
  els.budget.addEventListener("input", renderBudget);
  els.compareLeft.addEventListener("change", renderSavedComparison);
  els.compareRight.addEventListener("change", renderSavedComparison);

  document.getElementById("template-aggro")?.addEventListener("click", () => buildTemplate("aggro"));
  document.getElementById("template-control")?.addEventListener("click", () => buildTemplate("control"));
  document.getElementById("template-empty")?.addEventListener("click", () => {
    state.deck.clear();
    saveWorkspace(state);
    els.templateStatus.textContent = "Deck cleared. Return to Cards to continue building.";
    populateSelectors();
    renderAll();
  });
}

function populateSelectors() {
  const main = getMainDeckMap(state.deck);
  const deckCards = [...main.keys()].map(id => state.cardMap.get(id)).filter(Boolean);
  const pool = state.cards
    .filter(card => card.deckSelectable)
    .filter(card => card.class === state.selectedClass || card.class === "Neutral")
    .filter(card => matchesFormat(card, state.format))
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));

  fillCardSelect(els.probCard, deckCards, false);
  fillCardSelect(els.replacementSource, deckCards, false);
  fillCardSelect(els.compareA, pool, true);
  fillCardSelect(els.compareB, pool, true);
  fillCardSelect(els.compareC, pool, true);

  const variants = Object.keys(state.savedDecks ?? {}).sort((a, b) => a.localeCompare(b));
  fillVariantSelect(els.compareLeft, variants);
  fillVariantSelect(els.compareRight, variants);
  if (variants.length > 1 && !els.compareRight.value) els.compareRight.value = variants[1];
}

function fillCardSelect(select, cards, allowEmpty) {
  const previous = select.value;
  select.innerHTML = `${allowEmpty ? '<option value="">— Select card —</option>' : ""}${cards.map(card => `<option value="${card.id}">${escapeHtml(card.name)} · ${card.cost}</option>`).join("")}`;
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
}

function fillVariantSelect(select, names) {
  const previous = select.value;
  select.innerHTML = `<option value="__current__">Current deck</option>` + names.map(name => `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`).join("");
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
}

function renderAll() {
  renderStats();
  renderLegality();
  renderBudget();
  renderProbability();
  renderCardComparison();
  renderReplacements();
  renderNotes();
  renderDependencyGraph();
  renderSavedComparison();
}

function renderStats() {
  const stats = calculateAdvancedStats(state.deck, state.cardMap);
  els.stats.innerHTML = [
    stat(stats.playableT1, "T1 playable"),
    stat(stats.playableT2, "T2 playable"),
    stat(stats.playableT3, "T3 playable"),
    stat(stats.draw, "Draw"),
    stat(stats.removal, "Removal"),
    stat(stats.heal, "Heal"),
    stat(stats.ward, "Ward"),
    stat(stats.finishers, "Finishers"),
    stat(stats.boardClear, "Board clear"),
    stat(stats.ramp, "Ramp"),
    stat(stats.storm, "Storm"),
    stat(stats.rush, "Rush")
  ].join("");
}

function renderLegality() {
  const result = checkLegality({ deck: state.deck, cardMap: state.cardMap, selectedClass: state.selectedClass, format: state.format });
  els.legality.innerHTML = `<strong class="${result.legal ? "lab-good" : "lab-bad"}">${result.legal ? "Legal main deck ✓" : "Deck is not legal"}</strong>`
    + result.errors.map(text => `<div class="legality-line lab-bad">${escapeHtml(text)}</div>`).join("")
    + result.warnings.map(text => `<div class="legality-line lab-warn">${escapeHtml(text)}</div>`).join("");
}

function renderBudget() {
  const craft = calculateDeckCrafting(state.deck, state.owned, state.cardMap);
  const budget = Math.max(0, Number(els.budget.value) || 0);
  let remaining = budget;
  const plan = [];

  const missing = [...craft.missing].sort((a, b) => {
    const markA = state.deckMarks.get(a.card.id) === "Core" ? 0 : state.deckMarks.get(a.card.id) === "Optional" ? 1 : 2;
    const markB = state.deckMarks.get(b.card.id) === "Core" ? 0 : state.deckMarks.get(b.card.id) === "Optional" ? 1 : 2;
    return markA - markB || a.vialCost - b.vialCost || a.card.name.localeCompare(b.card.name);
  });

  for (const item of missing) {
    const unit = getCraftCost(item.card);
    const craftable = unit ? Math.min(item.missing, Math.floor(remaining / unit)) : item.missing;
    if (craftable > 0) {
      plan.push({ ...item, craftable, spend: craftable * unit });
      remaining -= craftable * unit;
    }
  }

  els.budgetResult.innerHTML = `
    <div class="tools-stats" style="margin-top:.7rem">
      ${stat(formatNumber(craft.missingVials), "Total missing vials")}
      ${stat(craft.missingCopies, "Missing copies")}
      ${stat(formatNumber(budget - remaining), "Planned spend")}
      ${stat(formatNumber(remaining), "Budget remaining")}
    </div>
    ${budget > 0 ? plan.map(item => `<div class="lab-result-row"><strong>${escapeHtml(item.card.name)}</strong> · craft ${item.craftable}/${item.missing} · ${formatNumber(item.spend)} vials</div>`).join("") || '<div class="tools-muted">Budget is too small for the current missing cards.</div>' : '<div class="tools-muted">Enter a budget to build a Core-first crafting plan.</div>'}
  `;
}

function renderProbability() {
  const id = Number(els.probCard.value);
  const card = state.cardMap.get(id);
  if (!card) {
    els.probResult.innerHTML = stat("—", "Add cards to the deck first");
    return;
  }
  const main = getMainDeckMap(state.deck);
  const copies = Number(main.get(id) ?? 0);
  const redraws = Number(els.probRedraw.value) || 0;
  const turn = Number(els.probTurn.value) || 0;
  const opening = probabilityAtLeastOne({ deckSize: 40, copies, draws: 3 });
  const byTurnNoMulligan = probabilityAtLeastOne({ deckSize: 40, copies, draws: Math.min(40, 3 + turn) });
  const byTurnMulligan = probabilityAtLeastOneAfterMulligan({ deckSize: 40, copies, startingHand: 3, redraws, extraDraws: turn });
  els.probResult.innerHTML = [
    stat(percent(opening), "Opening hand"),
    stat(percent(byTurnNoMulligan), `By T${turn} · keep hand`),
    stat(percent(byTurnMulligan), `By T${turn} · redraw ${redraws}`),
    stat(`${copies}×`, card.name)
  ].join("");
}

function renderCardComparison() {
  const ids = [els.compareA.value, els.compareB.value, els.compareC.value].map(Number).filter(Boolean);
  const cards = [...new Set(ids)].map(id => state.cardMap.get(id)).filter(Boolean);
  els.compareCards.innerHTML = cards.map(card => `<article class="lab-compare-card">
    <img src="${escapeAttr(card.image)}" alt="">
    <strong>${escapeHtml(card.name)}</strong>
    <div class="tools-muted">${escapeHtml(card.class)} · ${escapeHtml(card.rarity)} · ${escapeHtml(card.set)}</div>
    <div>Cost ${card.cost}${card.type === "Follower" ? ` · ${card.attack}/${card.defense}` : ""} · ${escapeHtml(card.type)}</div>
    ${(card.traits ?? []).length ? `<div>Traits: ${escapeHtml(card.traits.join(", "))}</div>` : ""}
    ${(card.keywords ?? []).length ? `<div>Keywords: ${escapeHtml(card.keywords.join(", "))}</div>` : ""}
    ${(card.roles ?? []).length ? `<div>Roles: ${escapeHtml(card.roles.join(", "))}</div>` : ""}
    <p>${escapeHtml(card.text)}</p>
  </article>`).join("") || '<div class="tools-muted">Select up to three cards.</div>';
}

function renderReplacements() {
  const source = state.cardMap.get(Number(els.replacementSource.value));
  if (!source) {
    els.replacementResults.innerHTML = '<div class="tools-muted">Select a card from the current deck.</div>';
    return;
  }
  const items = bestReplacements(source, state.cards.filter(card => matchesFormat(card, state.format)), state.selectedClass, {
    owned: state.owned,
    ownedOnly: els.replacementOwnedOnly.checked,
    limit: 10
  });
  els.replacementResults.innerHTML = items.map(item => `<div class="lab-result-row">
    <strong>${escapeHtml(item.card.name)}</strong> · score ${item.score} · Cost ${item.card.cost} · ${escapeHtml(item.card.type)}
    <div class="tools-muted">${escapeHtml([...(item.card.roles ?? []), ...(item.card.keywords ?? [])].join(" · "))}</div>
  </div>`).join("") || '<div class="tools-muted">No sufficiently similar cards found.</div>';
}

function renderNotes() {
  const main = getMainDeckMap(state.deck);
  const rows = [...main.entries()].map(([id, qty]) => ({ card: state.cardMap.get(id), qty })).filter(item => item.card);
  els.notes.innerHTML = rows.map(({ card, qty }) => {
    const saved = labState.cards[String(card.id)] ?? {};
    return `<div class="lab-result-row" data-note-card="${card.id}">
      <strong>${escapeHtml(card.name)} ×${qty}</strong>
      <div class="tools-actions">
        <select data-note-tag>
          ${["", "Always keep", "Situational", "Never keep"].map(value => `<option value="${value}" ${saved.mulligan === value ? "selected" : ""}>${value || "Mulligan: untagged"}</option>`).join("")}
        </select>
        <input data-note-text class="input" value="${escapeAttr(saved.note ?? "")}" placeholder="Personal note...">
      </div>
    </div>`;
  }).join("") || '<div class="tools-muted">No cards in the main deck.</div>';

  els.notes.querySelectorAll("[data-note-card]").forEach(row => {
    const id = row.dataset.noteCard;
    const save = () => {
      labState.cards[id] = {
        mulligan: row.querySelector("[data-note-tag]").value,
        note: row.querySelector("[data-note-text]").value
      };
      saveLabState();
    };
    row.querySelector("[data-note-tag]").addEventListener("change", save);
    row.querySelector("[data-note-text]").addEventListener("input", save);
  });
}

function renderDependencyGraph() {
  const main = getMainDeckMap(state.deck);
  const deckCards = [...main.keys()].map(id => state.cardMap.get(id)).filter(Boolean);
  const lines = [];
  for (const source of deckCards) {
    for (const relation of source.relations ?? []) {
      if (relation.type !== "Generates") continue;
      const target = state.cardMap.get(Number(relation.id));
      if (!target) continue;
      const consumers = deckCards.filter(card => card.id !== source.id && normalize(card.text).includes(normalize(target.name)));
      lines.push({ source, target, consumers });
    }
  }
  els.dependency.innerHTML = lines.map(line => `<div class="lab-result-row">
    <strong>${escapeHtml(line.source.name)}</strong> → <strong>${escapeHtml(line.target.name)}</strong>
    ${line.consumers.length ? ` → ${line.consumers.map(card => escapeHtml(card.name)).join(", ")}` : ""}
  </div>`).join("") || '<div class="tools-muted">No generated-card chain detected in the current main deck.</div>';
}

function renderSavedComparison() {
  const left = variantMap(els.compareLeft.value);
  const right = variantMap(els.compareRight.value);
  const leftStats = calculateAdvancedStats(left.deck, state.cardMap);
  const rightStats = calculateAdvancedStats(right.deck, state.cardMap);
  const ids = new Set([...getMainDeckMap(left.deck).keys(), ...getMainDeckMap(right.deck).keys()]);
  const changes = [];
  const lmain = getMainDeckMap(left.deck);
  const rmain = getMainDeckMap(right.deck);
  for (const id of ids) {
    const a = lmain.get(id) ?? 0;
    const b = rmain.get(id) ?? 0;
    if (a === b) continue;
    const card = state.cardMap.get(id);
    if (card) changes.push({ card, a, b, delta: b - a });
  }
  changes.sort((a, b) => a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name));
  els.deckCompare.innerHTML = `
    <div class="tools-stats">
      ${deltaStat(leftStats.playableT2, rightStats.playableT2, "T2 playable")}
      ${deltaStat(leftStats.draw, rightStats.draw, "Draw")}
      ${deltaStat(leftStats.removal, rightStats.removal, "Removal")}
      ${deltaStat(leftStats.heal, rightStats.heal, "Heal")}
      ${deltaStat(leftStats.ward, rightStats.ward, "Ward")}
      ${deltaStat(leftStats.finishers, rightStats.finishers, "Finishers")}
    </div>
    ${changes.map(item => `<div class="lab-result-row"><strong>${escapeHtml(item.card.name)}</strong> ${item.a} → ${item.b} <span class="${item.delta > 0 ? "lab-good" : "lab-bad"}">${item.delta > 0 ? "+" : ""}${item.delta}</span></div>`).join("") || '<div class="tools-muted">No card differences.</div>'}
  `;
}

function buildTemplate(kind) {
  const candidates = state.cards
    .filter(card => card.deckSelectable)
    .filter(card => card.class === state.selectedClass || card.class === "Neutral")
    .filter(card => matchesFormat(card, state.format))
    .map(card => ({ card, score: templateScore(card, kind) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name));

  const deck = new Map();
  let total = 0;
  for (const { card } of candidates) {
    if (total >= 40) break;
    const qty = Math.min(Number(card.maxCopies ?? 3), 40 - total);
    deck.set(card.id, qty);
    total += qty;
  }
  state.deck = deck;
  saveWorkspace(state);
  els.templateStatus.textContent = `${kind === "aggro" ? "Aggro" : "Control"} shell generated (${total}/40). Return to Cards to refine it.`;
  populateSelectors();
  renderAll();
}

function templateScore(card, kind) {
  const roles = new Set(card.roles ?? []);
  const keywords = new Set(card.keywords ?? []);
  const cost = Number(card.cost) || 0;
  if (kind === "aggro") {
    let score = Math.max(0, 8 - cost);
    if (roles.has("Early Game")) score += 10;
    if (roles.has("Draw")) score += 5;
    if (roles.has("Finisher")) score += 7;
    if (keywords.has("Storm")) score += 9;
    if (keywords.has("Rush")) score += 3;
    return score;
  }
  let score = 2;
  if (roles.has("Removal")) score += 10;
  if (roles.has("Board Clear")) score += 11;
  if (roles.has("Heal")) score += 7;
  if (roles.has("Draw")) score += 6;
  if (roles.has("Finisher")) score += 6;
  if (roles.has("Ramp")) score += 6;
  if (keywords.has("Ward")) score += 6;
  if (cost <= 2) score += 2;
  return score;
}

function variantMap(name) {
  if (!name || name === "__current__") return { deck: new Map(state.deck), name: "Current" };
  const variant = state.savedDecks?.[name];
  return { deck: new Map((variant?.deck ?? []).map(([id, qty]) => [Number(id), Number(qty)])), name };
}

function loadLabState() {
  try {
    const raw = JSON.parse(localStorage.getItem(LAB_KEY) || "{}");
    return { cards: raw.cards && typeof raw.cards === "object" ? raw.cards : {} };
  } catch { return { cards: {} }; }
}
function saveLabState() { localStorage.setItem(LAB_KEY, JSON.stringify(labState)); }
function stat(value, label) { return `<div class="tools-stat"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`; }
function deltaStat(a, b, label) { const d = b - a; return `<div class="tools-stat"><strong>${a} → ${b} <small class="${d > 0 ? "lab-good" : d < 0 ? "lab-bad" : ""}">${d ? `${d > 0 ? "+" : ""}${d}` : ""}</small></strong><span>${escapeHtml(label)}</span></div>`; }
function percent(value) { return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`; }
function formatNumber(value) { return new Intl.NumberFormat("en-US").format(Number(value) || 0); }
function normalize(value) { return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim(); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function escapeAttr(value) { return escapeHtml(value); }
