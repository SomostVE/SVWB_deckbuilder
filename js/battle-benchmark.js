import { loadData } from "./data-loader.js";
import { state } from "./state.js";
import { loadWorkspace, applyWorkspace } from "./storage.js";

const els = {
  yourDeck: document.getElementById("battle-your-deck"),
  playerStrategy: document.getElementById("battle-player-strategy"),
  opponent: document.getElementById("battle-opponent"),
  seed: document.getElementById("battle-seed"),
  scope: document.getElementById("benchmark-scope"),
  games: document.getElementById("benchmark-games"),
  compare: document.getElementById("benchmark-compare"),
  run: document.getElementById("benchmark-run"),
  cancel: document.getElementById("benchmark-cancel"),
  progress: document.getElementById("benchmark-progress"),
  progressLabel: document.getElementById("benchmark-progress-label"),
  status: document.getElementById("benchmark-status"),
  results: document.getElementById("benchmark-results")
};

let referenceData = { decks: [] };
let worker = null;
let ready = false;

init();

async function init() {
  if (!els.run) return;
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
    populateCompareDecks();
    ready = true;
    bindEvents();
    refreshStatus();
  } catch (error) {
    els.status.textContent = error?.message || String(error);
    els.status.dataset.type = "error";
  }
}

function bindEvents() {
  els.run.addEventListener("click", runBenchmark);
  els.cancel.addEventListener("click", cancelBenchmark);
  for (const element of [els.yourDeck, els.playerStrategy, els.opponent, els.scope, els.games, els.compare]) {
    element?.addEventListener("change", refreshStatus);
  }
}

function populateCompareDecks() {
  if (!els.compare) return;
  const options = ['<option value="">Off</option>', '<option value="__current__">Current deck</option>'];
  for (const name of Object.keys(state.savedDecks ?? {}).sort((a, b) => a.localeCompare(b))) {
    options.push(`<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`);
  }
  els.compare.innerHTML = options.join("");
}

function refreshStatus() {
  if (!ready) return;
  const player = getSelectedPlayerDeck();
  const compare = getCompareDeck();
  const opponents = getSelectedOpponents();
  const count = deckSize(player.deck);
  const compareCount = compare ? deckSize(compare.deck) : 40;
  const sameDeck = compare ? deckFingerprint(compare.deck) === deckFingerprint(player.deck) : false;
  const games = Number(els.games.value) || 100;
  const runsPerMatchup = compare ? 2 : 1;
  const total = games * opponents.length * runsPerMatchup;
  els.run.disabled = count !== 40 || compareCount !== 40 || sameDeck || opponents.length === 0 || Boolean(worker);

  if (count !== 40) {
    els.status.dataset.type = "warn";
    els.status.textContent = `Benchmark needs a 40-card Main Deck. Current: ${count}/40.`;
  } else if (compare && compareCount !== 40) {
    els.status.dataset.type = "warn";
    els.status.textContent = `Compare deck needs 40 cards. Current: ${compareCount}/40.`;
  } else if (sameDeck) {
    els.status.dataset.type = "warn";
    els.status.textContent = "Compare deck is identical to the primary deck.";
  } else {
    els.status.dataset.type = "info";
    const sample = games >= 1000 ? "high sample" : games >= 500 ? "medium sample" : "exploratory sample";
    const mode = compare ? `paired comparison vs ${compare.name}` : "single deck";
    els.status.textContent = `${opponents.length} matchup${opponents.length === 1 ? "" : "s"} · ${games} games each · ${total.toLocaleString()} total simulations · ${sample} · ${mode} · Baseline AI.`;
  }
}

function runBenchmark() {
  if (!ready || worker) return;
  const player = getSelectedPlayerDeck();
  const compare = getCompareDeck();
  const opponents = getSelectedOpponents();
  if (deckSize(player.deck) !== 40 || !opponents.length) return;
  if (compare && (deckSize(compare.deck) !== 40 || deckFingerprint(compare.deck) === deckFingerprint(player.deck))) return;

  const games = Number(els.games.value) || 100;
  const seed = String(els.seed.value || "deci-benchmark").trim() || "deci-benchmark";
  const strategy = getPlayerStrategy(player.deck);
  const compareStrategy = compare ? getPlayerStrategy(compare.deck) : null;
  const runsPerMatchup = compare ? 2 : 1;

  els.results.innerHTML = "";
  els.progress.hidden = false;
  els.progress.max = games * opponents.length * runsPerMatchup;
  els.progress.value = 0;
  els.progressLabel.textContent = `0 / ${els.progress.max.toLocaleString()}`;
  els.status.dataset.type = "info";
  els.status.textContent = compare
    ? "Paired benchmark running. Both deck variants use the same matchup seeds and First/Second split."
    : "Benchmark running in a background worker. The page remains usable.";
  els.run.disabled = true;
  els.cancel.hidden = false;

  worker = new Worker("./js/battle-benchmark-worker.js", { type: "module" });
  worker.addEventListener("message", event => {
    const message = event.data ?? {};
    if (message.type === "progress") {
      els.progress.value = Number(message.completed) || 0;
      const deckLabel = message.deckLabel ? ` · ${message.deckLabel}` : "";
      els.progressLabel.textContent = `${Number(message.completed).toLocaleString()} / ${Number(message.total).toLocaleString()} · ${message.opponentName || ""}${deckLabel}`;
      return;
    }
    if (message.type === "complete") {
      finishWorker();
      renderResults(message.results ?? [], message.comparison ?? null);
      els.status.dataset.type = "info";
      els.status.textContent = message.comparison
        ? `Comparison complete · ${Number(message.totalGames || 0).toLocaleString()} simulations. Deltas use identical seeds and side splits for both variants.`
        : `Benchmark complete · ${Number(message.totalGames || 0).toLocaleString()} simulations. Confidence range, side gap and unresolved-rule rate are shown so noisy results are easier to identify.`;
      return;
    }
    if (message.type === "error") {
      finishWorker();
      els.status.dataset.type = "error";
      els.status.textContent = message.message || "Benchmark failed.";
    }
  });
  worker.addEventListener("error", error => {
    finishWorker();
    els.status.dataset.type = "error";
    els.status.textContent = error.message || "Benchmark worker failed.";
  });

  worker.postMessage({
    type: "run",
    cards: state.cards,
    playerName: player.name,
    playerDeck: player.deck,
    playerStrategy: strategy,
    compareName: compare?.name ?? null,
    compareDeck: compare?.deck ?? null,
    compareStrategy: compareStrategy ?? null,
    opponents: opponents.map(deck => ({
      id: deck.id,
      name: deck.name,
      class: deck.class,
      format: deck.format,
      strategy: deck.strategy ?? {},
      deck: resolveReferenceDeck(deck)
    })),
    games,
    seed
  });
}

function cancelBenchmark() {
  if (!worker) return;
  worker.terminate();
  worker = null;
  els.cancel.hidden = true;
  els.progress.hidden = true;
  els.status.dataset.type = "warn";
  els.status.textContent = "Benchmark cancelled.";
  refreshStatus();
}

function finishWorker() {
  worker?.terminate();
  worker = null;
  els.cancel.hidden = true;
  els.progress.value = els.progress.max;
  refreshRunOnly();
}

function refreshRunOnly() {
  const player = getSelectedPlayerDeck();
  const compare = getCompareDeck();
  const invalidCompare = compare && (deckSize(compare.deck) !== 40 || deckFingerprint(compare.deck) === deckFingerprint(player.deck));
  els.run.disabled = deckSize(player.deck) !== 40 || invalidCompare || getSelectedOpponents().length === 0 || Boolean(worker);
}

function renderResults(results, comparison) {
  if (!results.length) {
    els.results.innerHTML = '<div class="tools-muted">No benchmark results.</div>';
    return;
  }

  if (comparison && results.some(result => result.compare)) {
    renderComparisonResults(results, comparison);
    return;
  }

  const overall = summarizeAll(results);
  els.results.innerHTML = `
    <div class="benchmark-overall">
      ${metric(`${formatPct(overall.winRate)}`, "Overall win rate")}
      ${metric(`${overall.wins}-${overall.losses}-${overall.draws}`, "W-L-D")}
      ${metric(overall.averageRounds.toFixed(1), "Avg rounds")}
      ${metric(`${overall.averageSideGap.toFixed(1)}%`, "Avg side gap")}
      ${metric(overall.unresolvedPerGame.toFixed(2), "Unresolved / game")}
    </div>
    <div class="benchmark-table-wrap">
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Matchup</th><th>Win</th><th>95% CI</th><th>First</th><th>Second</th><th>Side gap</th><th>W-L-D</th><th>Avg end</th><th>Unresolved</th><th>Coverage</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(renderResultRow).join("")}
        </tbody>
      </table>
    </div>
    <div class="benchmark-note">100 games is exploratory. 500 is better for tuning; 1,000 is preferred before comparing small win-rate differences. Same seed + same pool remains deterministic, while the 95% interval shows sampling noise and Side gap helps expose first/second bias.</div>
  `;
}

function renderComparisonResults(results, comparison) {
  const primaryOverall = summarizeAll(results);
  const compareRows = results.map(result => ({
    overall: result.compare.overall,
    diagnostics: result.compare.diagnostics
  }));
  const compareOverall = summarizeAll(compareRows);
  const delta = compareOverall.winRate - primaryOverall.winRate;
  const primaryName = comparison.primaryName || "Primary deck";
  const compareName = comparison.compareName || "Compare deck";

  els.results.innerHTML = `
    <div class="benchmark-overall">
      ${metric(formatPct(primaryOverall.winRate), primaryName)}
      ${metric(formatPct(compareOverall.winRate), compareName)}
      ${metric(formatSignedPct(delta), "Overall delta")}
      ${metric(`${primaryOverall.averageSideGap.toFixed(1)}% / ${compareOverall.averageSideGap.toFixed(1)}%`, "Side gap · A / B")}
      ${metric(`${primaryOverall.unresolvedPerGame.toFixed(2)} / ${compareOverall.unresolvedPerGame.toFixed(2)}`, "Unresolved · A / B")}
    </div>
    <div class="benchmark-table-wrap">
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Matchup</th><th>A Win</th><th>B Win</th><th>Δ</th><th>A 95% CI</th><th>B 95% CI</th><th>A First/Second</th><th>B First/Second</th><th>Coverage A/B</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(renderComparisonRow).join("")}
        </tbody>
      </table>
    </div>
    <div class="benchmark-note"><strong>A:</strong> ${escapeHtml(primaryName)} · <strong>B:</strong> ${escapeHtml(compareName)}. Both variants run against the same opponents with the same deterministic seeds and alternating First/Second split. The raw Δ is useful for direction; use 500–1,000 games before treating small differences as meaningful.</div>
  `;
}

function renderComparisonRow(result) {
  const a = result.overall;
  const b = result.compare.overall;
  const delta = result.compare.deltaWinRate ?? (b.winRate - a.winRate);
  const aTier = tierLabel(result.diagnostics?.rulesTier || "partial");
  const bTier = tierLabel(result.compare.diagnostics?.rulesTier || "partial");
  return `
    <tr>
      <td><strong>${escapeHtml(result.name)}</strong><small>${escapeHtml(result.class || "")} · ${escapeHtml(result.format || "Unlimited")}</small></td>
      <td class="benchmark-win">${formatPct(a.winRate)}</td>
      <td class="benchmark-win">${formatPct(b.winRate)}</td>
      <td><strong>${formatSignedPct(delta)}</strong></td>
      <td>${formatRange(a.winRate95)}</td>
      <td>${formatRange(b.winRate95)}</td>
      <td>${formatPct(result.first.winRate)} / ${formatPct(result.second.winRate)}</td>
      <td>${formatPct(result.compare.first.winRate)} / ${formatPct(result.compare.second.winRate)}</td>
      <td><span class="benchmark-coverage ${aTier.className}">A ${result.coverage.minimumModeledPercent}%</span> <span class="benchmark-coverage ${bTier.className}">B ${result.compare.coverage.minimumModeledPercent}%</span></td>
    </tr>
  `;
}

function renderResultRow(result) {
  const o = result.overall;
  const diagnostics = result.diagnostics ?? {};
  const reliability = diagnostics.rulesTier ? tierLabel(diagnostics.rulesTier) : coverageLabel(result.coverage);
  const interval = o.winRate95 ?? { low: o.winRate, high: o.winRate };
  return `
    <tr>
      <td><strong>${escapeHtml(result.name)}</strong><small>${escapeHtml(result.class || "")} · ${escapeHtml(result.format || "Unlimited")} · ${escapeHtml(diagnostics.sampleTier || "sample")}</small></td>
      <td class="benchmark-win">${formatPct(o.winRate)}</td>
      <td>${formatRange(interval)}</td>
      <td>${formatPct(result.first.winRate)}</td>
      <td>${formatPct(result.second.winRate)}</td>
      <td>${formatPct(diagnostics.sideGap ?? Math.abs(result.first.winRate - result.second.winRate))}</td>
      <td>${o.wins}-${o.losses}-${o.draws}</td>
      <td>T${o.averageRounds.toFixed(1)}</td>
      <td>${Number(diagnostics.unresolvedTriggersPerGame ?? o.unsupportedTriggersPerGame ?? 0).toFixed(2)}/g</td>
      <td><span class="benchmark-coverage ${reliability.className}">${reliability.label} · ${result.coverage.minimumModeledPercent}%</span></td>
    </tr>
  `;
}

function summarizeAll(results) {
  const totalGames = results.reduce((sum, row) => sum + row.overall.games, 0) || 1;
  const wins = results.reduce((sum, row) => sum + row.overall.wins, 0);
  const losses = results.reduce((sum, row) => sum + row.overall.losses, 0);
  const draws = results.reduce((sum, row) => sum + row.overall.draws, 0);
  const weighted = key => results.reduce((sum, row) => sum + row.overall[key] * row.overall.games, 0) / totalGames;
  const weightedDiagnostic = key => results.reduce((sum, row) => sum + Number(row.diagnostics?.[key] ?? 0) * row.overall.games, 0) / totalGames;
  return {
    wins,
    losses,
    draws,
    winRate: wins / totalGames * 100,
    averageRounds: weighted("averageRounds"),
    averageSideGap: weightedDiagnostic("sideGap"),
    unresolvedPerGame: weightedDiagnostic("unresolvedTriggersPerGame")
  };
}

function tierLabel(tier) {
  if (tier === "low") return { label: "Low", className: "low" };
  if (tier === "partial") return { label: "Partial", className: "partial" };
  return { label: "Good", className: "good" };
}

function coverageLabel(coverage) {
  if ((coverage?.unsupportedCopies ?? 0) > 0 || (coverage?.minimumModeledPercent ?? 0) < 60) return { label: "Low", className: "low" };
  if ((coverage?.partialCopies ?? 0) > 20 || (coverage?.minimumModeledPercent ?? 0) < 85) return { label: "Partial", className: "partial" };
  return { label: "Good", className: "good" };
}

function getSelectedPlayerDeck() {
  return getDeckByKey(els.yourDeck.value);
}

function getCompareDeck() {
  const key = els.compare?.value || "";
  return key ? getDeckByKey(key) : null;
}

function getDeckByKey(key) {
  if (key === "__current__") {
    return { key, name: "Current deck", deck: mainDeckFrom(state.deck) };
  }
  const variant = state.savedDecks?.[key];
  return {
    key,
    name: key || "Saved deck",
    deck: mainDeckFrom(new Map((variant?.deck ?? []).map(([id, qty]) => [Number(id), Number(qty)])))
  };
}

function getSelectedOpponents() {
  const decks = referenceData.decks ?? [];
  if (els.scope.value === "all") return decks.filter(deck => deckSize(resolveReferenceDeck(deck)) === 40);
  const selected = decks.find(deck => deck.id === els.opponent.value) ?? decks[0];
  return selected ? [selected] : [];
}

function resolveReferenceDeck(deck) {
  return (deck?.cards ?? []).filter(card => Number(card.cardId)).map(card => [Number(card.cardId), Number(card.qty ?? 1)]);
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
    aggro: { style: "aggro", label: "Aggro", mulliganMaxCost: 2, faceBias: .9, tradeBias: .24 },
    midrange: { style: "midrange", label: "Midrange", mulliganMaxCost: 3, faceBias: .52, tradeBias: .55 },
    control: { style: "ward-control", label: "Control", mulliganMaxCost: 3, faceBias: .28, tradeBias: .86 },
    ramp: { style: "ramp", label: "Ramp", mulliganMaxCost: 3, faceBias: .46, tradeBias: .64 },
    "spell-combo": { style: "spell-combo", label: "Spell / Combo", mulliganMaxCost: 3, faceBias: .38, tradeBias: .68 },
    "buff-tempo": { style: "buff-tempo", label: "Buff / Tempo", mulliganMaxCost: 3, faceBias: .62, tradeBias: .48 },
    "puppetry-tempo": { style: "puppetry-tempo", label: "Puppetry / Tempo", mulliganMaxCost: 3, faceBias: .5, tradeBias: .72 },
    "ward-control": { style: "ward-control", label: "Ward / Control", mulliganMaxCost: 3, faceBias: .32, tradeBias: .84 }
  };
  return presets[style] ?? presets.midrange;
}

function deckFingerprint(deck) {
  return (deck ?? [])
    .map(([id, qty]) => [Number(id), Number(qty)])
    .sort((a, b) => a[0] - b[0])
    .map(([id, qty]) => `${id}:${qty}`)
    .join("|");
}

function deckSize(deck) {
  return (deck ?? []).reduce((sum, entry) => sum + Number(Array.isArray(entry) ? entry[1] : entry.qty ?? entry.quantity ?? 1), 0);
}

function metric(value, label) {
  return `<div class="battle-stat"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function formatPct(value) { return `${Number(value || 0).toFixed(1)}%`; }
function formatSignedPct(value) { const n = Number(value || 0); return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`; }
function formatRange(interval) { return `${Number(interval?.low || 0).toFixed(1)}–${Number(interval?.high || 0).toFixed(1)}%`; }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function escapeAttr(value) { return escapeHtml(value); }
