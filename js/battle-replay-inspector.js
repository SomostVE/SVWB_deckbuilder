import "./tool-page-nav.js?v=01.03.002";

const replay = document.getElementById("battle-replay");
const timeline = document.getElementById("battle-timeline");
const actionRoot = document.getElementById("battle-action");
const frameLabel = document.getElementById("battle-frame-label");
const playerArea = document.getElementById("battle-player-area");
const opponentArea = document.getElementById("battle-opponent-area");

if (replay && timeline && actionRoot && playerArea && opponentArea) {
  ensureStylesheet("./css/battle-replay-inspector.css?v=01.03.002", "battle-replay-inspector.css");
  setupReplayInspector();
}

function setupReplayInspector() {
  const cache = new Map();
  let sampling = false;
  let refreshTimer = 0;
  let activeTab = "action";
  let timelineFilter = "all";

  const filters = document.createElement("div");
  filters.className = "battle-timeline-filters";
  filters.setAttribute("aria-label", "Replay timeline filters");
  filters.innerHTML = [
    ["all", "All"], ["play", "Play"], ["attack", "Attack"],
    ["evolve", "Evolve"], ["turn", "Turn"], ["draw", "Draw"]
  ].map(([key, label], index) => `<button type="button" data-replay-filter="${key}" class="${index === 0 ? "active" : ""}">${label}</button>`).join("");
  timeline.insertAdjacentElement("beforebegin", filters);

  const inspector = document.createElement("section");
  inspector.className = "battle-inspector";
  inspector.innerHTML = `
    <div class="battle-inspector-head">
      <div><strong>Replay Inspector</strong><span id="battle-inspector-frame"></span></div>
      <button id="battle-inspector-toggle" type="button" aria-expanded="true">Hide</button>
    </div>
    <div id="battle-inspector-body" class="battle-inspector-body">
      <div class="battle-inspector-tabs" role="tablist" aria-label="Replay inspector sections">
        <button type="button" role="tab" class="active" aria-selected="true" data-inspector-tab="action">Action</button>
        <button type="button" role="tab" aria-selected="false" data-inspector-tab="changes">Changes</button>
        <button type="button" role="tab" aria-selected="false" data-inspector-tab="decision">Decision</button>
        <button type="button" role="tab" aria-selected="false" data-inspector-tab="state">State</button>
      </div>
      <div id="battle-inspector-content" class="battle-inspector-content"></div>
    </div>
  `;
  actionRoot.insertAdjacentElement("afterend", inspector);

  const inspectorFrame = inspector.querySelector("#battle-inspector-frame");
  const inspectorBody = inspector.querySelector("#battle-inspector-body");
  const inspectorContent = inspector.querySelector("#battle-inspector-content");
  const inspectorToggle = inspector.querySelector("#battle-inspector-toggle");
  const tabButtons = [...inspector.querySelectorAll("[data-inspector-tab]")];

  filters.addEventListener("click", event => {
    const button = event.target.closest("[data-replay-filter]");
    if (!button) return;
    timelineFilter = button.dataset.replayFilter || "all";
    filters.querySelectorAll("[data-replay-filter]").forEach(item => item.classList.toggle("active", item === button));
    applyTimelineFilter();
  });

  tabButtons.forEach(button => button.addEventListener("click", () => {
    activeTab = button.dataset.inspectorTab || "action";
    tabButtons.forEach(item => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-selected", selected ? "true" : "false");
    });
    refreshInspector();
  }));

  inspectorToggle.addEventListener("click", () => {
    const open = inspectorToggle.getAttribute("aria-expanded") !== "true";
    inspectorToggle.setAttribute("aria-expanded", open ? "true" : "false");
    inspectorToggle.textContent = open ? "Hide" : "Show";
    inspectorBody.hidden = !open;
  });

  // Replacing the timeline means a new simulation: discard snapshots.
  new MutationObserver(() => scheduleRefresh(true)).observe(timeline, { childList: true });

  // Changing only the active timeline button must never clear the cache. This is
  // important because the Inspector briefly samples the previous frame itself.
  new MutationObserver(() => scheduleRefresh(false)).observe(timeline, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });

  new MutationObserver(() => {
    if (!sampling) scheduleRefresh(false);
  }).observe(actionRoot, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["title"]
  });

  scheduleRefresh(true);

  function scheduleRefresh(resetCache) {
    if (resetCache) cache.clear();
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      applyTimelineFilter();
      refreshInspector();
    }, 0);
  }

  function applyTimelineFilter() {
    for (const button of timeline.querySelectorAll("[data-frame]")) {
      const label = String(button.textContent || "").toLowerCase();
      let visible = true;
      if (timelineFilter === "play") visible = label.includes("play");
      else if (timelineFilter === "attack") visible = label.includes("attack");
      else if (timelineFilter === "evolve") visible = label.includes("evo") || label.includes("super");
      else if (timelineFilter === "turn") visible = label.includes("start") || label.includes("end");
      else if (timelineFilter === "draw") visible = label.includes("draw");
      if (button.classList.contains("active")) visible = true;
      button.hidden = !visible;
    }
  }

  function refreshInspector() {
    const activeButton = timeline.querySelector("[data-frame].active");
    if (!activeButton) {
      inspectorContent.innerHTML = '<div class="battle-inspector-empty">Run a simulation to inspect replay frames.</div>';
      inspectorFrame.textContent = "";
      return;
    }

    const index = Number(activeButton.dataset.frame);
    if (!Number.isFinite(index)) return;

    cache.set(index, captureRenderedFrame(index, false));
    if (index > 0 && !cache.has(index - 1)) sampleFrame(index - 1, index);

    const current = cache.get(index);
    const previous = index > 0 ? cache.get(index - 1) : null;
    if (!current) return;

    inspectorFrame.textContent = `${current.label}${frameLabel?.textContent ? ` · ${frameLabel.textContent}` : ""}`;
    if (activeTab === "changes") inspectorContent.innerHTML = renderChanges(previous, current);
    else if (activeTab === "decision") inspectorContent.innerHTML = renderDecision(previous, current);
    else if (activeTab === "state") inspectorContent.innerHTML = renderState(current);
    else inspectorContent.innerHTML = renderAction(current);
  }

  function sampleFrame(targetIndex, restoreIndex) {
    const target = timeline.querySelector(`[data-frame="${targetIndex}"]`);
    const restore = timeline.querySelector(`[data-frame="${restoreIndex}"]`);
    if (!target || !restore) return;

    sampling = true;
    const targetScroll = target.scrollIntoView;
    const restoreScroll = restore.scrollIntoView;
    target.scrollIntoView = () => {};
    restore.scrollIntoView = () => {};

    try {
      target.click();
      cache.set(targetIndex, captureRenderedFrame(targetIndex, true));
      restore.click();
      cache.set(restoreIndex, captureRenderedFrame(restoreIndex, true));
    } finally {
      target.scrollIntoView = targetScroll;
      restore.scrollIntoView = restoreScroll;
      sampling = false;
    }
  }
}

function captureRenderedFrame(index, rawMode) {
  const activeButton = timeline.querySelector(`[data-frame="${index}"]`);
  const rawAction = rawMode
    ? String(actionRoot.textContent || "").trim()
    : String(actionRoot.title || actionRoot.textContent || "").trim();
  return {
    index,
    label: String(activeButton?.textContent || `Frame ${index + 1}`).trim(),
    action: rawAction,
    actor: detectActor(rawAction),
    player: parseSide(playerArea),
    opponent: parseSide(opponentArea)
  };
}

function parseSide(area) {
  const text = String(area.textContent || "").replace(/\s+/g, " ").trim();
  const number = (pattern, group = 1) => numberOrNull(text.match(pattern)?.[group]);
  return {
    name: area.querySelector(".battle-leader-row strong")?.textContent?.trim() || "Player",
    subtitle: area.querySelector(".battle-leader-row > div:first-child span")?.textContent?.trim() || "",
    hp: number(/♥\s*(\d+)\/(\d+)/i),
    maxHp: number(/♥\s*(\d+)\/(\d+)/i, 2),
    pp: number(/\bPP\s*(\d+)\/(\d+)/i),
    maxPp: number(/\bPP\s*(\d+)\/(\d+)/i, 2),
    ep: number(/\b(?:Evo|EP)\s*(\d+)/i),
    sep: number(/\b(?:Super Evo|SEP)\s*(\d+)/i),
    shadows: number(/\bShadows\s*(\d+)/i),
    handCount: number(/\bHand\s*(\d+)\/9/i),
    deckCount: number(/\bDeck\s*(\d+)/i),
    cemeteryCount: number(/\bCemetery\s*(\d+)/i),
    boardCount: number(/\bField\s*(\d+)\/5/i),
    hand: [...area.querySelectorAll(".battle-hand-card")].map(card => ({
      name: card.getAttribute("title") || card.querySelector("strong")?.textContent?.trim() || "Card",
      cost: card.querySelector(".battle-card-cost")?.textContent?.trim() || "",
      detail: card.querySelector("small")?.textContent?.trim() || ""
    })),
    board: [...area.querySelectorAll(".battle-board-card")].map(card => ({
      name: card.getAttribute("title") || card.querySelector("strong")?.textContent?.trim() || "Card",
      combat: card.querySelector(".battle-card-combat")?.textContent?.trim() || "",
      detail: card.querySelector("small")?.textContent?.trim() || "",
      spent: card.classList.contains("spent")
    }))
  };
}

function renderAction(frame) {
  const parts = frame.action.split(" · ").map(item => item.trim()).filter(Boolean);
  const primary = parts.shift() || "No action recorded.";
  const subject = parseSubject(frame.action);
  return `
    <div class="battle-inspector-meta">
      <span><strong>Actor</strong>${escapeHtml(frame.actor)}</span>
      <span><strong>Phase</strong>${escapeHtml(frame.label)}</span>
      ${subject ? `<span><strong>Subject</strong>${escapeHtml(subject)}</span>` : ""}
    </div>
    <div class="battle-inspector-primary">${escapeHtml(primary)}</div>
    ${parts.length ? `<ul class="battle-inspector-events">${parts.map(part => `<li>${escapeHtml(part)}</li>`).join("")}</ul>` : '<div class="battle-inspector-note">No additional resolution details were recorded for this frame.</div>'}
  `;
}

function renderChanges(previous, current) {
  if (!previous) return '<div class="battle-inspector-empty">Opening frame: there is no previous state to compare.</div>';
  const sections = [renderSideChanges("You", previous.player, current.player), renderSideChanges("Opponent", previous.opponent, current.opponent)].filter(Boolean);
  return sections.length
    ? `<div class="battle-inspector-change-columns">${sections.join("")}</div>`
    : '<div class="battle-inspector-empty">No visible state change between these two replay frames.</div>';
}

function renderSideChanges(label, before, after) {
  const rows = [];
  addChange(rows, "HP", before.hp, after.hp);
  addChange(rows, "PP", fraction(before.pp, before.maxPp), fraction(after.pp, after.maxPp));
  addChange(rows, "Evo", before.ep, after.ep);
  addChange(rows, "Super Evo", before.sep, after.sep);
  addChange(rows, "Shadows", before.shadows, after.shadows);
  addChange(rows, "Hand", before.handCount, after.handCount);
  addChange(rows, "Deck", before.deckCount, after.deckCount);
  addChange(rows, "Cemetery", before.cemeteryCount, after.cemeteryCount);
  addChange(rows, "Field", before.boardCount, after.boardCount);

  const hand = diffNames(before.hand, after.hand);
  const board = diffNames(before.board, after.board);
  if (hand.added.length) rows.push(changeRow("Hand +", hand.added.join(", ")));
  if (hand.removed.length) rows.push(changeRow("Hand −", hand.removed.join(", ")));
  if (board.added.length) rows.push(changeRow("Field +", board.added.join(", ")));
  if (board.removed.length) rows.push(changeRow("Field −", board.removed.join(", ")));
  return rows.length ? `<section class="battle-inspector-change-card"><h3>${label}</h3>${rows.join("")}</section>` : "";
}

function renderDecision(previous, current) {
  const opponentActor = current.actor === "Opponent";
  const now = opponentActor ? current.opponent : current.player;
  const before = previous ? (opponentActor ? previous.opponent : previous.player) : null;
  const enemyNow = opponentActor ? current.player : current.opponent;
  const enemyBefore = previous ? (opponentActor ? previous.player : previous.opponent) : null;
  const factors = [];
  const phase = current.label.toLowerCase();

  if (!before || !enemyBefore) {
    factors.push("Opening-state action; no earlier frame is available for contextual comparison.");
  } else {
    if (now.pp < before.pp) factors.push(`Spent ${before.pp - now.pp} PP while keeping the action legal.`);
    if (enemyNow.hp < enemyBefore.hp) factors.push(`Applied ${enemyBefore.hp - enemyNow.hp} damage to the opposing leader.`);
    if (now.hp > before.hp) factors.push(`Recovered ${now.hp - before.hp} leader defense.`);
    if (enemyNow.boardCount < enemyBefore.boardCount) factors.push(`Reduced the opposing field by ${enemyBefore.boardCount - enemyNow.boardCount}.`);
    if (now.boardCount > before.boardCount) factors.push(`Developed ${now.boardCount - before.boardCount} additional board slot${now.boardCount - before.boardCount === 1 ? "" : "s"}.`);
    if (now.handCount > before.handCount) factors.push(`Finished with ${now.handCount - before.handCount} more card${now.handCount - before.handCount === 1 ? "" : "s"} in hand.`);
    if (phase.includes("attack") && enemyNow.boardCount === enemyBefore.boardCount && enemyNow.hp < enemyBefore.hp) factors.push("Chose leader pressure rather than a visible board trade.");
    if (phase.includes("attack") && enemyNow.boardCount < enemyBefore.boardCount) factors.push("Used the attack as a board trade/removal line.");
    if (phase.includes("evo") || phase.includes("super")) factors.push("Used an evolution resource at this point in the turn.");
  }

  if (!factors.length) factors.push("The selected action follows the simulator's existing heuristic ordering; no extra visible state delta explains it further.");
  return `
    <div class="battle-inspector-note">Observed decision context only. This inspector does not add a stronger AI layer or alter the simulator's choices.</div>
    <ul class="battle-inspector-events">${factors.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  `;
}

function renderState(frame) {
  return `<div class="battle-inspector-state-grid">${renderSideState(frame.player)}${renderSideState(frame.opponent)}</div>`;
}

function renderSideState(side) {
  const resources = [
    ["HP", fraction(side.hp, side.maxHp)], ["PP", fraction(side.pp, side.maxPp)],
    ["Evo", side.ep], ["Super Evo", side.sep], ["Shadows", side.shadows],
    ["Hand", side.handCount], ["Deck", side.deckCount], ["Cemetery", side.cemeteryCount], ["Field", side.boardCount]
  ];
  const hand = side.hand.length ? side.hand.map(card => `${card.name}${card.cost ? ` (${card.cost})` : ""}${card.detail ? ` · ${card.detail}` : ""}`).map(escapeHtml).join("<br>") : "Empty";
  const board = side.board.length ? side.board.map(card => `${card.name}${card.combat ? ` ${card.combat}` : ""}${card.detail ? ` · ${card.detail}` : ""}${card.spent ? " · spent" : ""}`).map(escapeHtml).join("<br>") : "Empty";
  return `
    <section class="battle-inspector-state-card">
      <h3>${escapeHtml(side.name)}</h3><span class="battle-inspector-subtitle">${escapeHtml(side.subtitle)}</span>
      <div class="battle-inspector-resource-grid">${resources.map(([label, value]) => `<div><span>${label}</span><strong>${escapeHtml(value ?? "—")}</strong></div>`).join("")}</div>
      <div class="battle-inspector-zone"><strong>Hand</strong><span>${hand}</span></div>
      <div class="battle-inspector-zone"><strong>Field</strong><span>${board}</span></div>
    </section>
  `;
}

function addChange(rows, label, before, after) {
  if (before == null || after == null || before === after) return;
  rows.push(changeRow(label, `${before} → ${after}`));
}

function changeRow(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function diffNames(before, after) {
  const left = countNames(before);
  const right = countNames(after);
  const added = [];
  const removed = [];
  for (const name of new Set([...left.keys(), ...right.keys()])) {
    const delta = (right.get(name) || 0) - (left.get(name) || 0);
    if (delta > 0) added.push(delta > 1 ? `${delta}× ${name}` : name);
    if (delta < 0) removed.push(delta < -1 ? `${-delta}× ${name}` : name);
  }
  return { added, removed };
}

function countNames(items) {
  const result = new Map();
  for (const item of items || []) result.set(item.name, (result.get(item.name) || 0) + 1);
  return result;
}

function detectActor(raw) {
  if (/^Both players\b/i.test(raw)) return "Both";
  if (/^You\b/i.test(raw)) return "You";
  if (/^Opponent\b/i.test(raw)) return "Opponent";
  if (/attacks Opponent's leader/i.test(raw)) return "You";
  if (/attacks You's leader/i.test(raw)) return "Opponent";
  if (playerArea.querySelector(".battle-leader-row.active")) return "You";
  if (opponentArea.querySelector(".battle-leader-row.active")) return "Opponent";
  return "Battle";
}

function parseSubject(raw) {
  for (const pattern of [
    /^(?:You|Opponent) plays (.+?) \(/i,
    /^(?:You|Opponent) super-evolves (.+?)(?:\.| ·|$)/i,
    /^(?:You|Opponent) evolves (.+?)(?:\.| ·|$)/i,
    /^(?:You|Opponent) engages (.+?)(?:\.| ·|$)/i,
    /^(.+?) attacks /i
  ]) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function fraction(value, max) {
  if (value == null) return null;
  return max == null ? String(value) : `${value}/${max}`;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function ensureStylesheet(href, suffix) {
  if (document.querySelector(`link[href*="${suffix}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
