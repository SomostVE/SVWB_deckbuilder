import { state } from "./state.js";
import { loadOfficialChangelog } from "./codex-client.js";

if (!document.querySelector('link[href$="update-report.css"]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./css/update-report.css";
  document.head.appendChild(link);
}

const SEEN_KEY = "shadowverse-deck-assistant:seen-new-cards:v1";
const seen = loadSeen();
waitForReady();

function waitForReady() {
  if (!state.cardMap?.size) {
    setTimeout(waitForReady, 120);
    return;
  }
  setupBadges();
  setupUpdateReport();
}

function setupBadges() {
  const grid = document.getElementById("card-grid");
  if (!grid) return;
  const apply = () => {
    for (const tile of grid.querySelectorAll(".card-tile")) {
      if (tile.dataset.updateBadgeBound) continue;
      const image = tile.querySelector("img");
      const card = state.cards.find(item => item.image && image?.src === new URL(item.image, location.href).href);
      if (!card) continue;
      tile.dataset.updateBadgeBound = "1";
      if (card.newlyAdded && !seen.has(card.id)) {
        const badge = document.createElement("span");
        badge.className = "card-new-badge";
        badge.textContent = "NEW";
        tile.appendChild(badge);
        tile.addEventListener("pointerenter", () => markSeen(card.id, badge), { once: true });
        tile.addEventListener("click", () => markSeen(card.id, badge), { once: true });
      }
    }
  };
  new MutationObserver(apply).observe(grid, { childList: true });
  apply();
}

async function setupUpdateReport() {
  const update = state.metadata?.update;
  if (!update || (!update.added && !update.modified && !update.removed)) return;
  const actions = document.querySelector(".header-actions");
  if (!actions || document.getElementById("open-update-report")) return;

  const button = document.createElement("button");
  button.id = "open-update-report";
  button.className = "button update-report-button";
  button.type = "button";
  button.textContent = `Update +${update.added ?? 0} · ~${update.modified ?? 0}`;
  actions.insertBefore(button, actions.firstChild);

  const dialog = document.createElement("dialog");
  dialog.className = "assistant-dialog update-report-dialog";
  dialog.innerHTML = `<div class="dialog-header"><h2>Card database update</h2><button type="button">×</button></div><div class="update-report-content tools-muted">Loading...</div>`;
  document.body.appendChild(dialog);
  dialog.querySelector(".dialog-header button").addEventListener("click", () => dialog.close());

  button.addEventListener("click", async () => {
    dialog.showModal();
    try {
      const data = await loadOfficialChangelog();
      renderReport(dialog.querySelector(".update-report-content"), data);
    } catch {
      dialog.querySelector(".update-report-content").textContent = "No detailed changelog is available yet.";
    }
  });
}

function renderReport(root, data) {
  if (!data) {
    root.textContent = "No detailed changelog is available yet.";
    return;
  }
  root.innerHTML = `
    <div class="tools-stats">
      ${stat(data.counts?.added ?? 0, "New cards")}
      ${stat(data.counts?.modified ?? 0, "Modified cards")}
      ${stat(data.counts?.removed ?? 0, "Removed cards")}
    </div>
    ${reportGroup("New cards", data.added ?? [], item => `${escapeHtml(item.name)} · ${escapeHtml(item.class)} · ${escapeHtml(item.set)}`)}
    ${reportGroup("Modified cards", data.modified ?? [], item => `${escapeHtml(item.name)} · ${(item.changes ?? []).map(change => escapeHtml(change.field)).join(", ")}`)}
    ${reportGroup("Removed cards", data.removed ?? [], item => `${escapeHtml(item.name)} · ${escapeHtml(item.class)} · ${escapeHtml(item.set)}`)}
  `;
}

function reportGroup(title, items, render) {
  if (!items.length) return "";
  return `<h3>${escapeHtml(title)}</h3>${items.map(item => `<div class="lab-result-row">${render(item)}</div>`).join("")}`;
}

function stat(value, label) { return `<div class="tools-stat"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`; }
function markSeen(id, badge) {
  seen.add(Number(id));
  badge?.remove();
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
}
function loadSeen() {
  try { return new Set((JSON.parse(localStorage.getItem(SEEN_KEY) || "[]") ?? []).map(Number)); }
  catch { return new Set(); }
}
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
