import { state } from "./state.js";
import { getCraftCost } from "./tools-common.js";

let engineIndex = new Map();
let allEngines = [];
let enhanceQueued = false;
waitForReady();

function waitForReady() {
  if (!state.cardMap?.size) {
    setTimeout(waitForReady, 120);
    return;
  }
  rebuildIndex();
  enhance();
  const page = document.querySelector(".engines-page");
  const dialog = document.getElementById("engine-dialog");
  if (page) new MutationObserver(scheduleEnhance).observe(page, { childList: true, subtree: true });
  if (dialog) new MutationObserver(enhanceDialog).observe(dialog, { childList: true, subtree: true, attributes: true });
}

function scheduleEnhance() {
  if (enhanceQueued) return;
  enhanceQueued = true;
  requestAnimationFrame(() => {
    enhanceQueued = false;
    enhance();
  });
}

function rebuildIndex() {
  const pool = state.cards.filter(card =>
    card.deckSelectable &&
    (card.class === state.selectedClass || (state.includeNeutral && card.class === "Neutral"))
  );
  const result = [];

  const byTrait = new Map();
  for (const card of pool) {
    for (const trait of card.traits ?? []) {
      if (!trait || trait === "-") continue;
      if (!byTrait.has(trait)) byTrait.set(trait, []);
      byTrait.get(trait).push(card);
    }
  }
  for (const [name, cards] of byTrait) if (cards.length >= 2) result.push(makeItem("archetype", name, cards));

  const bySignature = new Map();
  for (const token of state.cards.filter(card => !card.deckSelectable)) {
    const generators = pool.filter(card =>
      (card.relations ?? []).some(relation => Number(relation.id) === token.id && relation.type === "Generates") ||
      (token.generatedBy ?? []).includes(card.id)
    );
    const references = pool.filter(card => (card.relations ?? []).some(relation => Number(relation.id) === token.id));
    const parents = uniqueCards([...generators, ...references]);
    if (parents.length < 2) continue;
    const signature = parents.map(card => card.id).sort((a, b) => a - b).join(",");
    if (bySignature.has(signature)) {
      bySignature.get(signature).generated.push(token);
      continue;
    }
    const item = makeItem("detected", `${token.name} engine`, parents);
    item.generated = [token];
    bySignature.set(signature, item);
    result.push(item);
  }
  for (const item of bySignature.values()) {
    if (item.generated.length > 1) {
      const names = item.generated.map(card => card.name);
      item.name = names.length === 2 ? `${names[0]} / ${names[1]} engine` : `${names[0]} +${names.length - 1} generated engine`;
    }
  }

  const poolIds = new Set(pool.map(card => card.id));
  const adjacency = new Map(pool.map(card => [card.id, new Set()]));
  for (const card of pool) {
    for (const relation of card.relations ?? []) {
      const targetId = Number(relation.id);
      if (!poolIds.has(targetId)) continue;
      adjacency.get(card.id)?.add(targetId);
      adjacency.get(targetId)?.add(card.id);
    }
  }
  const knownSignatures = new Set([...bySignature.values()].map(item => signature(item.cards)));
  const visited = new Set();
  for (const card of pool) {
    if (visited.has(card.id)) continue;
    const ids = [];
    const stack = [card.id];
    visited.add(card.id);
    while (stack.length) {
      const id = stack.pop();
      ids.push(id);
      for (const next of adjacency.get(id) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }
    if (ids.length < 2 || ids.length > 12) continue;
    const cards = ids.map(id => state.cardMap.get(id)).filter(Boolean);
    const sig = signature(cards);
    if (knownSignatures.has(sig)) continue;
    const commonTrait = findCommonTrait(cards);
    if (commonTrait && byTrait.has(commonTrait) && byTrait.get(commonTrait).length >= 2) continue;
    knownSignatures.add(sig);
    result.push(makeItem("detected", commonTrait ? `${commonTrait} linked package` : `${sortCards(cards)[0].name} linked package`, cards));
  }

  for (const packageDef of state.packages ?? []) {
    const entries = normalizePackageCards(packageDef.cards)
      .map(entry => ({ ...entry, card: state.cardMap.get(entry.id) }))
      .filter(entry => entry.card)
      .filter(entry => entry.card.class === state.selectedClass || (state.includeNeutral && entry.card.class === "Neutral"));
    if (!entries.length) continue;
    const item = makeItem("curated", packageDef.name ?? packageDef.id ?? "Package", entries.map(entry => entry.card));
    item.entries = entries;
    result.push(item);
  }

  allEngines = dedupeByName(result);
  engineIndex = new Map(allEngines.map(item => [item.name, item]));
}

function makeItem(kind, name, cards) {
  return { kind, name, cards: uniqueCards(cards), generated: [], entries: [] };
}

function enhance() {
  rebuildIndex();
  for (const element of document.querySelectorAll(".engine-card")) {
    const name = element.querySelector(".engine-card-copy > strong")?.textContent?.trim();
    const item = engineIndex.get(name);
    if (!item) continue;

    const metrics = completion(item);
    const signature = `${metrics.missingCopies}|${metrics.missingVials}|${metrics.newCards}`;
    let row = element.querySelector(".engine-extra-row");

    if (!row) {
      row = document.createElement("div");
      row.className = "engine-extra-row";
      element.querySelector(".engine-card-copy")?.appendChild(row);
    }

    if (row.dataset.metrics === signature) continue;
    row.dataset.metrics = signature;
    row.innerHTML = `
      <span>Missing <strong>${metrics.missingCopies}</strong> copies · <strong>${formatNumber(metrics.missingVials)}</strong> vials</span>
      ${metrics.newCards ? `<span class="engine-new-count">NEW ${metrics.newCards}</span>` : ""}
    `;
  }
}

function enhanceDialog() {
  const dialog = document.getElementById("engine-dialog");
  if (!dialog?.open) return;
  const name = document.getElementById("engine-dialog-title")?.textContent?.trim();
  const item = engineIndex.get(name);
  if (!item) return;

  const stats = document.getElementById("engine-dialog-stats");
  if (stats && !stats.querySelector(".engine-extra-stat")) {
    const metrics = completion(item);
    stats.insertAdjacentHTML("beforeend", `
      <div class="engine-stat engine-extra-stat"><strong>${metrics.missingCopies}</strong><span>Missing copies</span></div>
      <div class="engine-stat engine-extra-stat"><strong>${formatNumber(metrics.missingVials)}</strong><span>Missing vials</span></div>
      <div class="engine-stat engine-extra-stat"><strong>${metrics.newCards}</strong><span>New cards</span></div>
    `);
  }

  const content = document.getElementById("engine-dialog-content");
  if (!content || content.querySelector(".engine-related-suggestions")) return;
  const related = relatedEngines(item).slice(0, 6);
  if (!related.length) return;

  const section = document.createElement("section");
  section.className = "engine-detail-group engine-related-suggestions";
  section.innerHTML = `<h3>Related engines</h3><div class="engine-related-list"></div>`;
  const list = section.querySelector(".engine-related-list");
  for (const entry of related) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "engine-related-button";
    button.innerHTML = `<strong>${escapeHtml(entry.item.name)}</strong><span>${escapeHtml(entry.reason)}</span>`;
    button.addEventListener("click", () => {
      dialog.close();
      const search = document.getElementById("engine-search");
      if (!search) return;
      search.value = entry.item.name;
      search.dispatchEvent(new Event("input", { bubbles: true }));
      search.focus();
    });
    list.appendChild(button);
  }
  content.appendChild(section);
}

function completion(item) {
  let missingCopies = 0;
  let missingVials = 0;
  const newCards = item.cards.filter(card => card.newlyAdded).length;
  for (const card of item.cards) {
    const required = item.kind === "curated"
      ? Math.max(1, Number(item.entries.find(entry => Number(entry.id) === card.id)?.count ?? 1))
      : 1;
    const basic = card.set === "Basic" || Number(card.setId) === 10000;
    const have = basic ? required : Math.max(0, Number(state.owned.get(card.id) ?? 0));
    const missing = Math.max(0, required - have);
    missingCopies += missing;
    missingVials += missing * getCraftCost(card);
  }
  return { missingCopies, missingVials, newCards };
}

function relatedEngines(source) {
  const sourceIds = new Set(source.cards.map(card => card.id));
  const sourceTraits = new Set(source.cards.flatMap(card => card.traits ?? []).filter(value => value && value !== "-"));
  const sourceRoles = new Set(source.cards.flatMap(card => card.roles ?? []));
  return allEngines
    .filter(item => item !== source && item.name !== source.name)
    .map(item => {
      const sharedCards = item.cards.filter(card => sourceIds.has(card.id)).length;
      const traits = new Set(item.cards.flatMap(card => card.traits ?? []).filter(value => value && value !== "-"));
      const roles = new Set(item.cards.flatMap(card => card.roles ?? []));
      const sharedTraits = [...traits].filter(value => sourceTraits.has(value)).length;
      const sharedRoles = [...roles].filter(value => sourceRoles.has(value)).length;
      const score = sharedCards * 30 + sharedTraits * 8 + sharedRoles * 2;
      const reason = sharedCards
        ? `${sharedCards} shared card${sharedCards === 1 ? "" : "s"}`
        : sharedTraits
          ? `${sharedTraits} shared trait${sharedTraits === 1 ? "" : "s"}`
          : `${sharedRoles} shared role${sharedRoles === 1 ? "" : "s"}`;
      return { item, score, reason };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
}

function signature(cards) { return cards.map(card => card.id).sort((a, b) => a - b).join(","); }
function findCommonTrait(cards) {
  if (!cards.length) return null;
  const first = (cards[0].traits ?? []).filter(value => value && value !== "-");
  return first.find(trait => cards.every(card => (card.traits ?? []).includes(trait))) ?? null;
}
function normalizePackageCards(cards) {
  return (cards ?? []).map(entry => typeof entry === "number" || typeof entry === "string"
    ? { id: Number(entry), count: 1 }
    : { id: Number(entry.id), count: Number(entry.count ?? entry.quantity ?? 1) }
  ).filter(entry => Number.isFinite(entry.id));
}
function uniqueCards(cards) { return [...new Map(cards.map(card => [card.id, card])).values()]; }
function dedupeByName(items) { return [...new Map(items.map(item => [item.name, item])).values()]; }
function sortCards(cards) { return [...cards].sort((a, b) => Number(a.cost) - Number(b.cost) || a.name.localeCompare(b.name)); }
function formatNumber(value) { return new Intl.NumberFormat("en-US").format(Number(value) || 0); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
