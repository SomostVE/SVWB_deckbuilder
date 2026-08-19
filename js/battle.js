import { loadData } from "./data-loader.js";
import { state } from "./state.js";
import { loadWorkspace, applyWorkspace } from "./storage.js";
import { simulateBattle, analyzeDeckCoverage } from "./battle-engine.js";
import { resolveDeckClass } from "./battle-class-mechanics.js";

const els = {
  yourDeck: document.getElementById("battle-your-deck"),
  playerStrategy: document.getElementById("battle-player-strategy"),
  opponent: document.getElementById("battle-opponent"),
  side: document.getElementById("battle-side"),
  seed: document.getElementById("battle-seed"),
  newSeed: document.getElementById("battle-new-seed"),
  start: document.getElementById("battle-start"),
  status: document.getElementById("battle-status"),
  opponentMeta: document.getElementById("battle-opponent-meta"),
  coverage: document.getElementById("battle-coverage"),
  replay: document.getElementById("battle-replay"),
  timeline: document.getElementById("battle-timeline"),
  opponentArea: document.getElementById("battle-opponent-area"),
  playerArea: document.getElementById("battle-player-area"),
  action: document.getElementById("battle-action"),
  frameLabel: document.getElementById("battle-frame-label"),
  prev: document.getElementById("battle-prev"),
  next: document.getElementById("battle-next"),
  auto: document.getElementById("battle-auto"),
  summary: document.getElementById("battle-summary")
};

let referenceData = { decks: [] };
let simulation = null;
let frameIndex = 0;
let autoTimer = null;

init();

async function init() {
  try {
    const [{ cards, metadata, packages, customTags, globalExclusions }, refsResponse] = await Promise.all([
      loadData(),
      fetch("./data/custom/reference-decks.json")
    ]);

    state.cards = cards;
    state.cardMap = new Map(cards.map(card => [Number(card.id), card]));
    state.metadata = metadata;
    state.packages = packages;
    state.customTags = customTags;
    state.globalExclusions = globalExclusions;
    applyWorkspace(state, loadWorkspace());

    if (!refsResponse.ok) throw new Error("Unable to load local reference decks");
    referenceData = await refsResponse.json();

    populateYourDecks();
    populateOpponents();
    bindEvents();
    els.seed.value = makeSeed();
    refreshSetup();
  } catch (error) {
    console.error(error);
    els.status.textContent = error.message;
    els.status.dataset.type = "error";
  }
}

function bindEvents() {
  for (const element of [els.yourDeck, els.playerStrategy, els.opponent, els.side]) {
    element?.addEventListener("change", refreshSetup);
  }

  els.newSeed?.addEventListener("click", () => {
    els.seed.value = makeSeed();
  });

  els.start?.addEventListener("click", runSimulation);
  els.prev?.addEventListener("click", () => showFrame(frameIndex - 1));
  els.next?.addEventListener("click", () => showFrame(frameIndex + 1));
  els.auto?.addEventListener("click", toggleAuto);
}

function populateYourDecks() {
  const options = ['<option value="__current__">Current deck</option>'];
  for (const name of Object.keys(state.savedDecks ?? {}).sort((a, b) => a.localeCompare(b))) {
    options.push(`<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`);
  }
  els.yourDeck.innerHTML = options.join("");
}

function populateOpponents() {
  els.opponent.innerHTML = (referenceData.decks ?? []).map(deck => {
    const resolved = deck.cards?.every(card => Number(card.cardId));
    return `<option value="${escapeAttr(deck.id)}">${escapeHtml(deck.name)} · ${escapeHtml(deck.class)}${resolved ? "" : " · resolving"}</option>`;
  }).join("");
}

function refreshSetup() {
  const player = getSelectedPlayerDeck();
  const opponent = getSelectedOpponent();
  const playerCoverage = analyzeDeckCoverage(player.deck, state.cardMap);
  const opponentDeck = resolveReferenceDeck(opponent);
  const opponentCoverage = analyzeDeckCoverage(opponentDeck, state.cardMap);
  const playerCount = deckSize(player.deck);
  const opponentCount = deckSize(opponentDeck);

  if (opponent) {
    els.opponentMeta.innerHTML = `
      <strong>${escapeHtml(opponent.strategy?.label ?? "Reference strategy")}</strong>
      <span>${escapeHtml(opponent.format ?? "Unlimited")} · local JSON · ${opponentCount}/40 cards resolved</span>
    `;
  }

  els.coverage.innerHTML = [
    coverageCard("Your deck", playerCoverage),
    coverageCard(opponent?.name ?? "Opponent", opponentCoverage)
  ].join("");

  let classError = "";
  try {
    resolveDeckClass(player.deck, state.cardMap, player.class);
    resolveDeckClass(opponentDeck, state.cardMap, opponent?.class);
  } catch (error) {
    classError = error.message;
  }

  const ready = playerCount === 40 && opponentCount === 40 && !classError;
  els.start.disabled = !ready;
  els.status.dataset.type = classError ? "error" : ready ? "info" : "warn";

  if (classError) {
    els.status.textContent = classError;
  } else if (playerCount !== 40) {
    els.status.textContent = `Your Main Deck needs 40 cards for a normal simulation. Current: ${playerCount}/40.`;
  } else if (opponentCount !== 40) {
    els.status.textContent = "The local reference deck is waiting for its official card-ID resolution workflow.";
  } else {
    const unsupported = playerCoverage.unsupported + opponentCoverage.unsupported;
    const partial = playerCoverage.partial + opponentCoverage.partial;
    if (unsupported || partial) {
      els.status.textContent = `${unsupported} unsupported · ${partial} partial card copies. Common effects are simulated, but win-rate benchmarking stays locked until rule coverage is stronger.`;
    } else {
      els.status.textContent = "Full modeled coverage for this matchup. Replay can be inspected action by action.";
    }
  }
}

function runSimulation() {
  stopAuto();
  const player = getSelectedPlayerDeck();
  const opponent = getSelectedOpponent();
  const opponentDeck = resolveReferenceDeck(opponent);
  if (deckSize(player.deck) !== 40 || deckSize(opponentDeck) !== 40) return;

  const strategy = getPlayerStrategy(player.deck);
  simulation = simulateBattle({
    playerDeck: player.deck,
    opponentDeck,
    cardMap: state.cardMap,
    playerStrategy: strategy,
    opponentStrategy: opponent.strategy ?? {},
    playerClass: player.class,
    opponentClass: opponent.class,
    seed: els.seed.value || makeSeed(),
    playerSide: els.side.value
  });

  frameIndex = 0;
  els.replay.hidden = false;
  renderTimeline();
  renderSummary();
  showFrame(0);
}

function getSelectedPlayerDeck() {
  if (els.yourDeck.value === "__current__") {
    return { name: "Current deck", class: state.selectedClass, deck: mainDeckFrom(state.deck) };
  }

  const variant = state.savedDecks?.[els.yourDeck.value];
  return {
    name: els.yourDeck.value,
    class: variant?.class ?? state.selectedClass,
    deck: mainDeckFrom(new Map((variant?.deck ?? []).map(([id, qty]) => [Number(id), Number(qty)])))
  };
}

function getSelectedOpponent() {
  return (referenceData.decks ?? []).find(deck => deck.id === els.opponent.value) ?? referenceData.decks?.[0] ?? null;
}

function resolveReferenceDeck(deck) {
  if (!deck) return [];
  return (deck.cards ?? [])
    .filter(card => Number(card.cardId))
    .map(card => [Number(card.cardId), Number(card.qty ?? 1)]);
}

function mainDeckFrom(deckMap) {
  const result = [];
  let remaining = 40;
  for (const [id, qtyValue] of deckMap.entries()) {
    if (remaining <= 0) break;
    const qty = Math.min(Math.max(0, Number(qtyValue) || 0), remaining);
    if (qty > 0) result.push([Number(id), qty]);
    remaining -= qty;
  }
  return result;
}

function getPlayerStrategy(deck) {
  const requested = els.playerStrategy.value;
  if (requested !== "auto") return strategyPreset(requested);

  const cards = deck.flatMap(([id, qty]) => Array(Number(qty)).fill(state.cardMap.get(Number(id)))).filter(Boolean);
  const ramp = cards.filter(card => card.roles?.includes("Ramp")).length;
  const spells = cards.filter(card => card.type === "Spell").length;
  const wards = cards.filter(card => card.keywords?.includes("Ward")).length;
  const low = cards.filter(card => Number(card.cost) <= 3).length;

  if (ramp >= 4) return strategyPreset("ramp");
  if (spells >= 18) return strategyPreset("spell-combo");
  if (wards >= 6) return strategyPreset("ward-control");
  if (low >= 26) return strategyPreset("aggro");
  return strategyPreset("midrange");
}

function strategyPreset(style) {
  const presets = {
    aggro: { style: "aggro", label: "Aggro", mulliganMaxCost: 2, faceBias: .9, tradeBias: .24, priorities: ["Early Game", "Storm", "Finisher"] },
    midrange: { style: "midrange", label: "Midrange", mulliganMaxCost: 3, faceBias: .52, tradeBias: .55, priorities: ["Follower", "Removal", "Draw"] },
    control: { style: "ward-control", label: "Control", mulliganMaxCost: 3, faceBias: .28, tradeBias: .86, priorities: ["Removal", "Heal", "Ward", "Draw"] },
    ramp: { style: "ramp", label: "Ramp", mulliganMaxCost: 3, faceBias: .46, tradeBias: .64, priorities: ["Ramp", "Draw", "Finisher"] },
    "spell-combo": { style: "spell-combo", label: "Spell / Combo", mulliganMaxCost: 3, faceBias: .38, tradeBias: .68, priorities: ["Spell", "Draw", "Removal", "Combo Piece"] },
    "buff-tempo": { style: "buff-tempo", label: "Buff / Tempo", mulliganMaxCost: 3, faceBias: .62, tradeBias: .48, priorities: ["Buff", "Early Game", "Follower"] },
    "puppetry-tempo": { style: "puppetry-tempo", label: "Puppetry / Tempo", mulliganMaxCost: 3, faceBias: .5, tradeBias: .72, priorities: ["Generate", "Rush", "Removal"] },
    "ward-control": { style: "ward-control", label: "Ward / Control", mulliganMaxCost: 3, faceBias: .32, tradeBias: .84, priorities: ["Ward", "Heal", "Removal", "Draw"] }
  };
  return presets[style] ?? presets.midrange;
}

function renderTimeline() {
  els.timeline.innerHTML = simulation.frames.map((frame, index) => {
    const who = frame.players?.[frame.active]?.name === "You" ? "Y" : "O";
    const label = frame.round === 0 ? `Open · ${shortPhase(frame.phase)}` : `R${frame.round} ${who} · ${shortPhase(frame.phase)}`;
    return `<button type="button" data-frame="${index}">${escapeHtml(label)}</button>`;
  }).join("");

  els.timeline.querySelectorAll("[data-frame]").forEach(button => {
    button.addEventListener("click", () => showFrame(Number(button.dataset.frame)));
  });
}

function showFrame(index) {
  if (!simulation?.frames?.length) return;
  frameIndex = Math.max(0, Math.min(index, simulation.frames.length - 1));
  const frame = simulation.frames[frameIndex];

  els.timeline.querySelectorAll("[data-frame]").forEach(button => {
    button.classList.toggle("active", Number(button.dataset.frame) === frameIndex);
  });
  els.timeline.querySelector(`[data-frame="${frameIndex}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });

  els.frameLabel.textContent = `${frameIndex + 1} / ${simulation.frames.length}`;
  els.action.textContent = frame.action;
  els.prev.disabled = frameIndex <= 0;
  els.next.disabled = frameIndex >= simulation.frames.length - 1;
  els.opponentArea.innerHTML = renderPlayer(frame.players[1], true, frame.active === 1);
  els.playerArea.innerHTML = renderPlayer(frame.players[0], false, frame.active === 0);

  if (autoTimer && frameIndex >= simulation.frames.length - 1) stopAuto();
}

function renderPlayer(player, opponent, active) {
  return `
    <div class="battle-leader-row ${active ? "active" : ""}">
      <div>
        <strong>${escapeHtml(player.name)}</strong>
        <span>${opponent ? "Opponent" : "Your deck"}${player.className ? ` · ${escapeHtml(player.className)}` : ""} · turn ${player.personalTurn}</span>
      </div>
      <div class="battle-leader-stats">
        <span class="battle-hp">♥ ${player.hp}/${player.maxHp}</span>
        <span>PP ${player.pp}/${player.maxPp}</span>
        <span>Evo ${player.ep}</span>
        <span>Super Evo ${player.sep}</span>
        ${(player.classMechanics ?? []).map(mechanic => `<span class="battle-class-mechanic" data-mechanic="${escapeAttr(mechanic.key)}">${escapeHtml(mechanic.label)} ${escapeHtml(mechanic.value)}</span>`).join("")}
        ${player.bonusPpAvailable ? "<span>+PP ready</span>" : ""}
      </div>
    </div>
    <div class="battle-zone-label"><span>Hand ${player.hand.length}/9</span><span>Deck ${player.deckCount} · Cemetery ${player.cemeteryCount}</span></div>
    <div class="battle-hand">${player.hand.map(card => renderHandCard(card)).join("") || '<span class="battle-empty">Empty hand</span>'}</div>
    <div class="battle-zone-label"><span>Field ${player.board.length}/5</span></div>
    <div class="battle-board">${player.board.map(unit => renderBoardCard(unit)).join("") || '<span class="battle-empty">Empty field</span>'}</div>
  `;
}

function renderHandCard(card) {
  return `
    <div class="battle-card battle-hand-card" title="${escapeAttr(card.name)}">
      ${card.image ? `<img src="${escapeAttr(card.image)}" alt="">` : ""}
      <span class="battle-card-cost">${card.cost}</span>
      <strong>${escapeHtml(card.name)}</strong>
      ${card.spellboost ? `<small>Spellboost ${card.spellboost}</small>` : ""}
    </div>
  `;
}

function renderBoardCard(unit) {
  const stats = unit.type === "Follower" ? `<span class="battle-card-combat">${unit.attack}/${unit.defense}</span>` : "";
  const stateLabels = [
    unit.evolved ? "Evo" : "",
    unit.superEvolved ? "Super" : "",
    unit.keywords?.includes("Ward") ? "Ward" : "",
    Number.isFinite(unit.countdown) ? `Countdown ${unit.countdown}` : ""
  ].filter(Boolean).join(" · ");

  return `
    <div class="battle-card battle-board-card ${unit.attacked ? "spent" : ""}" title="${escapeAttr(unit.name)}">
      ${unit.image ? `<img src="${escapeAttr(unit.image)}" alt="">` : ""}
      ${stats}
      <strong>${escapeHtml(unit.name)}</strong>
      ${stateLabels ? `<small>${escapeHtml(stateLabels)}</small>` : ""}
    </div>
  `;
}

function renderSummary() {
  const s = simulation.summary;
  const stats = s.stats;
  const ppEfficiency = (index) => {
    const spent = Number(stats.ppSpent?.[index] ?? 0);
    const wasted = Number(stats.ppWasted?.[index] ?? 0);
    const total = spent + wasted;
    return total ? Math.round(spent / total * 100) : 0;
  };

  els.summary.innerHTML = `
    <div class="battle-stat"><strong>${escapeHtml(s.winner)}</strong><span>Result at turn limit / lethal</span></div>
    <div class="battle-stat"><strong>${s.rounds}</strong><span>Rounds</span></div>
    <div class="battle-stat"><strong>${stats.damageDealt[0]} / ${stats.damageDealt[1]}</strong><span>Damage · You / Opp.</span></div>
    <div class="battle-stat"><strong>${stats.cardsPlayed[0]} / ${stats.cardsPlayed[1]}</strong><span>Cards played</span></div>
    <div class="battle-stat"><strong>${stats.attacks[0]} / ${stats.attacks[1]}</strong><span>Attacks</span></div>
    <div class="battle-stat"><strong>${stats.healing?.[0] ?? 0} / ${stats.healing?.[1] ?? 0}</strong><span>Healing</span></div>
    <div class="battle-stat"><strong>${stats.cardsGenerated?.[0] ?? 0} / ${stats.cardsGenerated?.[1] ?? 0}</strong><span>Generated cards</span></div>
    <div class="battle-stat"><strong>${stats.followersLost?.[0] ?? 0} / ${stats.followersLost?.[1] ?? 0}</strong><span>Followers lost</span></div>
    <div class="battle-stat"><strong>${ppEfficiency(0)}% / ${ppEfficiency(1)}%</strong><span>PP efficiency</span></div>
    <div class="battle-stat ${stats.unsupportedEffects[0] + stats.unsupportedEffects[1] ? "warn" : ""}"><strong>${stats.unsupportedEffects[0] + stats.unsupportedEffects[1]}</strong><span>Unresolved effects triggered</span></div>
  `;
}

function coverageCard(label, coverage) {
  const mechanics = (coverage.mechanics ?? []).slice(0, 4).map(item => `${item.name} ${item.count}`).join(" · ");
  const missing = coverage.unsupportedCards.length
    ? `Not modeled: ${coverage.unsupportedCards.slice(0, 5).join(", ")}${coverage.unsupportedCards.length > 5 ? "…" : ""}`
    : coverage.partialCards.length
      ? `Partial: ${coverage.partialCards.slice(0, 4).join(", ")}${coverage.partialCards.length > 4 ? "…" : ""}`
      : "";

  return `
    <div class="battle-coverage-card">
      <div class="battle-coverage-head"><strong>${escapeHtml(label)}</strong><span>${coverage.modeledPercent}% modeled</span></div>
      <div class="battle-coverage-bar"><span style="width:${coverage.modeledPercent}%"></span></div>
      <div class="battle-coverage-counts">
        <span>${coverage.full} full</span>
        <span>${coverage.partial} partial</span>
        <span class="${coverage.unsupported ? "warn" : ""}">${coverage.unsupported} unsupported</span>
      </div>
      ${missing ? `<small>${escapeHtml(missing)}</small>` : ""}
      ${mechanics ? `<small>Mechanics: ${escapeHtml(mechanics)}</small>` : ""}
    </div>
  `;
}

function toggleAuto() {
  if (autoTimer) {
    stopAuto();
    return;
  }
  if (!simulation) return;
  els.auto.textContent = "Pause";
  autoTimer = setInterval(() => {
    if (frameIndex >= simulation.frames.length - 1) {
      stopAuto();
      return;
    }
    showFrame(frameIndex + 1);
  }, 650);
}

function stopAuto() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
  if (els.auto) els.auto.textContent = "Auto";
}

function deckSize(deck) {
  return (deck ?? []).reduce((sum, entry) => sum + Number(Array.isArray(entry) ? entry[1] : entry.qty ?? entry.quantity ?? 1), 0);
}

function shortPhase(value) {
  const labels = {
    opening: "Opening",
    mulligan: "Mulligan",
    "turn-start": "Start",
    draw: "Draw",
    "bonus-pp": "+PP",
    play: "Play",
    evolve: "Evo",
    "super-evolve": "Super",
    attack: "Attack",
    "turn-end": "End"
  };
  return labels[value] ?? value;
}

function makeSeed() { return Math.random().toString(36).slice(2, 10); }

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) { return escapeHtml(value); }
