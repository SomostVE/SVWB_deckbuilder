import { state } from "./state.js";
import { getMainDeckMap } from "./tools-common.js";

const root = document.getElementById("dependency-graph");
let rendering = false;

if (root) {
  new MutationObserver(() => {
    if (!rendering) queueMicrotask(renderGraph);
  }).observe(root, { childList: true });
  waitForReady();
}

function waitForReady() {
  if (!state.cardMap?.size) {
    setTimeout(waitForReady, 120);
    return;
  }
  renderGraph();
}

function renderGraph() {
  if (!root || !state.cardMap?.size) return;
  rendering = true;
  const main = getMainDeckMap(state.deck);
  const cards = [...main.keys()].map(id => state.cardMap.get(id)).filter(Boolean);
  const paths = [];

  for (const source of cards) {
    for (const relation of source.relations ?? []) {
      if (relation.type !== "Generates") continue;
      const token = state.cardMap.get(Number(relation.id));
      if (!token) continue;
      const tokenName = normalize(token.name);
      const consumers = cards.filter(card =>
        card.id !== source.id && normalize(card.text).includes(tokenName)
      );
      paths.push({ source, token, consumers });
    }
  }

  root.innerHTML = paths.length ? `<div class="dependency-visual-list">${paths.map(renderPath).join("")}</div>` : '<div class="tools-muted">No generated-card chain detected in the current main deck.</div>';
  requestAnimationFrame(() => { rendering = false; });
}

function renderPath(path) {
  const consumers = path.consumers.length
    ? path.consumers.map(card => node(card, "consumer")).join("")
    : '<div class="dependency-end">No dependent deck card detected</div>';
  return `<div class="dependency-path">
    ${node(path.source, "source")}
    <div class="dependency-arrow"><span>generates</span>→</div>
    ${node(path.token, "token")}
    <div class="dependency-arrow"><span>used by</span>→</div>
    <div class="dependency-consumers">${consumers}</div>
  </div>`;
}

function node(card, kind) {
  return `<div class="dependency-node ${kind}">
    <img src="${escapeAttr(card.image)}" alt="">
    <span>${escapeHtml(card.name)}</span>
  </div>`;
}

function normalize(value) { return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim(); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function escapeAttr(value) { return escapeHtml(value); }
