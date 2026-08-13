import { state } from "./state.js";
import { calculateAdvancedStats, checkLegality } from "./tools-common.js";

if (!document.querySelector('link[href$="advanced-analysis.css"]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./css/advanced-analysis.css";
  document.head.appendChild(link);
}

const root = document.getElementById("deck-analysis");
if (root) {
  const observer = new MutationObserver(() => renderAdvanced());
  observer.observe(root, { childList: true });
  renderAdvanced();
}

function renderAdvanced() {
  if (!root || root.querySelector(".advanced-analysis")) return;
  if (!state.cardMap?.size) {
    setTimeout(renderAdvanced, 150);
    return;
  }

  const mainDeck = getMainDeck();
  const stats = calculateAdvancedStats(mainDeck, state.cardMap);
  const legality = checkLegality({
    deck: mainDeck,
    cardMap: state.cardMap,
    selectedClass: state.selectedClass,
    format: state.format ?? "Unlimited"
  });
  const sources = buildSources(mainDeck);

  const section = document.createElement("div");
  section.className = "analysis-section advanced-analysis";
  section.innerHTML = `
    <h3>Tempo & utility</h3>
    <div class="analysis-grid advanced-stat-grid">
      ${statCard("T1 playable", stats.playableT1, "Cost 0–1")}
      ${statCard("T2 playable", stats.playableT2, "Cost 0–2")}
      ${statCard("T3 playable", stats.playableT3, "Cost 0–3")}
      ${statCard("Draw", stats.draw)}
      ${statCard("Removal", stats.removal)}
      ${statCard("Heal", stats.heal)}
      ${statCard("Ward", stats.ward)}
      ${statCard("Finishers", stats.finishers)}
      ${statCard("Board clear", stats.boardClear)}
      ${statCard("Ramp", stats.ramp)}
      ${statCard("Storm", stats.storm)}
      ${statCard("Rush", stats.rush)}
      ${statCard("Generators", stats.generate)}
    </div>

    <details class="utility-sources">
      <summary>Utility sources</summary>
      <div class="utility-source-list">
        ${sources.map(group => `
          <div class="utility-source-group">
            <strong>${escapeHtml(group.label)} <small>${group.cards.length} source${group.cards.length === 1 ? "" : "s"}</small></strong>
            <div>${group.cards.length
              ? group.cards.map(item => `<span class="utility-source-chip">${item.qty}× ${escapeHtml(item.card.name)}</span>`).join("")
              : '<span class="utility-source-empty">None</span>'}
            </div>
          </div>
        `).join("")}
      </div>
    </details>

    <h3 class="advanced-legality-title">Deck legality · ${escapeHtml(state.format ?? "Unlimited")}</h3>
    <div class="legality-box ${legality.legal ? "legal" : "illegal"}">
      <strong>${legality.legal ? "Legal main deck ✓" : `${legality.errors.length} issue${legality.errors.length === 1 ? "" : "s"}`}</strong>
      ${legality.errors.map(text => `<div>${escapeHtml(text)}</div>`).join("")}
      ${legality.warnings.map(text => `<div class="legality-note">${escapeHtml(text)}</div>`).join("")}
    </div>
  `;

  const crafting = root.querySelector(".crafting-analysis");
  if (crafting) root.insertBefore(section, crafting);
  else root.appendChild(section);
}

function buildSources(deck) {
  const definitions = [
    ["Draw", card => card.roles?.includes("Draw")],
    ["Removal", card => card.roles?.includes("Removal")],
    ["Heal", card => card.roles?.includes("Heal")],
    ["Ward", card => card.keywords?.includes("Ward")],
    ["Finishers", card => card.roles?.includes("Finisher")],
    ["Board clear", card => card.roles?.includes("Board Clear")],
    ["Ramp", card => card.roles?.includes("Ramp")],
    ["Storm", card => card.keywords?.includes("Storm")],
    ["Rush", card => card.keywords?.includes("Rush")]
  ];

  return definitions.map(([label, predicate]) => ({
    label,
    cards: [...deck.entries()]
      .map(([id, qty]) => ({ card: state.cardMap.get(Number(id)), qty: Number(qty) || 0 }))
      .filter(item => item.card && item.qty > 0 && predicate(item.card))
      .sort((a, b) => Number(a.card.cost) - Number(b.card.cost) || a.card.name.localeCompare(b.card.name))
  }));
}

function getMainDeck() {
  const deck = new Map();
  let remaining = 40;
  for (const [id, qtyValue] of state.deck.entries()) {
    if (remaining <= 0) break;
    const qty = Math.min(Math.max(0, Number(qtyValue) || 0), remaining);
    if (qty > 0) deck.set(Number(id), qty);
    remaining -= qty;
  }
  return deck;
}

function statCard(label, value, detail = "copies") {
  return `<div class="analysis-card advanced-stat"><strong>${value}</strong>${escapeHtml(label)}<small>${escapeHtml(detail)}</small></div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
