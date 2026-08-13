import { state } from "./state.js";
import { getMainDeckMap } from "./tools-common.js";

let raf = 0;
wait();

function wait() {
  if (!state.cardMap?.size) return setTimeout(wait, 120);
  const root = document.getElementById("deck-list");
  if (!root) return;
  new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
  schedule();
}

function schedule() {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; render(); });
}

function render() {
  const root = document.getElementById("deck-list");
  const main = getMainDeckMap(state.deck);
  const cards = [...main.keys()].map(id => state.cardMap.get(Number(id))).filter(Boolean);
  const byName = new Map(cards.map(card => [card.name, card]));

  for (const row of root.querySelectorAll(".deck-row")) {
    if (workbench(row)) continue;
    const card = byName.get(row.querySelector(".deck-row-title > strong")?.textContent?.trim());
    const meta = row.querySelector(".deck-row-meta");
    if (!card || !meta) continue;
    const result = score(card, cards);
    let badge = meta.querySelector(".deck-synergy-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "deck-synergy-badge";
      meta.appendChild(badge);
    }
    badge.className = `deck-synergy-badge synergy-${result.level.toLowerCase()}`;
    badge.textContent = result.level;
    badge.title = result.reasons.length ? result.reasons.slice(0, 5).join(" · ") : "No explicit connection detected";
  }
}

function workbench(row) {
  let el = row.previousElementSibling;
  while (el) {
    if (el.classList?.contains("deck-section-title")) return el.classList.contains("workbench");
    el = el.previousElementSibling;
  }
  return false;
}

function score(card, cards) {
  let points = 0;
  let direct = 0;
  const reasons = [];
  for (const other of cards) {
    if (other.id === card.id) continue;
    const out = (card.relations ?? []).find(r => Number(r.id) === other.id);
    const inc = (other.relations ?? []).find(r => Number(r.id) === card.id);
    if (out || inc || (card.generatedBy ?? []).includes(other.id) || (other.generatedBy ?? []).includes(card.id)) {
      points += out?.type === "Generates" || inc?.type === "Generates" ? 9 : 7;
      direct++;
      reasons.push(`Linked with ${other.name}`);
    }
    const traits = common(card.traits, other.traits).filter(v => v && v !== "-");
    if (traits.length) { points += Math.min(4, traits.length * 2); reasons.push(`${traits.join(", ")} with ${other.name}`); }
    if (common(card.packages, other.packages).length) { points += 6; direct++; reasons.push(`Shared package with ${other.name}`); }
    points += Math.min(2, common(card.roles, other.roles).length);
    points += Math.min(2, common(card.keywords, other.keywords).length);
  }
  return { level: direct || points >= 10 ? "Strong" : points >= 4 ? "Medium" : "Weak", reasons: [...new Set(reasons)] };
}

function common(a = [], b = []) {
  const set = new Set((a ?? []).map(String));
  return [...new Set((b ?? []).map(String).filter(v => set.has(v)))];
}
