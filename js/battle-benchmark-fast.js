import { loadData } from "./data-loader.js";
import { state } from "./state.js";
import { loadWorkspace, applyWorkspace } from "./storage.js";
import { resolveDeckClass } from "./battle-class-mechanics.js";

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

const CHUNK_SIZE = 25;
const MAX_PARALLEL_WORKERS = 2;

let referenceData = { decks: [] };
let ready = false;
let running = false;
let workers = new Set();
let cancelled = false;

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

    if (!refsResponse.ok) throw new Error("Unable to load reference decks");
    referenceData = await refsResponse.json();
    populateCompareDecks();
    bindEvents();
    ready = true;
    refreshControls();
  } catch (error) {
    showError(error?.message || String(error));
  }
}

function bindEvents() {
  els.run?.addEventListener("click", runBenchmark);
  els.cancel?.addEventListener("click", cancelBenchmark);
  for (const element of [els.yourDeck, els.playerStrategy, els.opponent, els.scope, els.games, els.compare]) {
    element?.addEventListener("change", () => {
      if (!running) clearOutput();
      refreshControls();
    });
  }
}

function populateCompareDecks() {
  if (!els.compare) return;
  const current = els.compare.value;
  const options = ['<option value="">Off</option>', '<option value="__current__">Current deck</option>'];
  for (const name of Object.keys(state.savedDecks ?? {}).sort((a, b) => a.localeCompare(b))) {
    options.push(`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`);
  }
  els.compare.innerHTML = options.join("");
  if ([...els.compare.options].some(option => option.value === current)) els.compare.value = current;
}

function refreshControls() {
  if (!ready) return;
  const player = getSelectedPlayerDeck();
  const compare = getCompareDeck();
  const opponents = getSelectedOpponents();
  let classError = "";
  try {
    resolveDeckClass(player.deck, state.cardMap, player.class);
    if (compare) resolveDeckClass(compare.deck, state.cardMap, compare.class);
    for (const opponent of opponents) resolveDeckClass(resolveReferenceDeck(opponent), state.cardMap, opponent.class);
  } catch (error) {
    classError = error.message;
  }
  const invalidCompare = compare && (deckSize(compare.deck) !== 40 || deckFingerprint(compare.deck) === deckFingerprint(player.deck));
  const invalid = deckSize(player.deck) !== 40 || invalidCompare || opponents.length === 0 || Boolean(classError);
  els.run.disabled = running || invalid;
  for (const control of [els.yourDeck, els.playerStrategy, els.opponent, els.scope, els.games, els.compare]) {
    if (control) control.disabled = running;
  }
  if (!running) {
    els.cancel.hidden = true;
    if (invalid && els.status) {
      els.status.dataset.type = classError ? "error" : "warn";
      els.status.textContent = classError || (deckSize(player.deck) !== 40 ? "A 40-card deck is required." : invalidCompare ? "Choose a different comparison deck." : "No valid opponent.");
    } else if (els.status) {
      els.status.dataset.type = "info";
      els.status.textContent = "";
    }
  }
}

async function runBenchmark() {
  if (!ready || running) return;

  const player = getSelectedPlayerDeck();
  const compare = getCompareDeck();
  const opponents = getSelectedOpponents();
  const games = Math.max(1, Number(els.games.value) || 50);
  if (deckSize(player.deck) !== 40 || !opponents.length) return;
  if (compare && (deckSize(compare.deck) !== 40 || deckFingerprint(compare.deck) === deckFingerprint(player.deck))) return;

  running = true;
  cancelled = false;
  clearOutput();
  refreshControls();
  els.cancel.hidden = false;

  const seed = String(els.seed?.value || "deci-benchmark").trim() || "deci-benchmark";
  const primaryStrategy = getPlayerStrategy(player.deck);
  const compareStrategy = compare ? getPlayerStrategy(compare.deck) : null;
  const jobs = buildJobs({ player, compare, opponents, games, seed, primaryStrategy, compareStrategy });
  const totalGames = jobs.reduce((sum, job) => sum + job.games, 0);
  const progressByJob = new Map(jobs.map(job => [job.id, 0]));

  if (els.progress) {
    els.progress.hidden = false;
    els.progress.max = totalGames;
    els.progress.value = 0;
  }
  if (els.progressLabel) els.progressLabel.textContent = `0 / ${totalGames}`;

  try {
    const chunks = await runJobQueue(jobs, progressByJob, totalGames);
    if (cancelled) return;
    const rows = mergeChunks(chunks, opponents, player, compare);
    renderResults(rows, compare ? { primaryName: player.name, compareName: compare.name } : null);
    if (els.progress) els.progress.hidden = true;
    if (els.progressLabel) els.progressLabel.textContent = "";
    if (els.status) {
      els.status.dataset.type = "info";
      els.status.textContent = "";
    }
  } catch (error) {
    if (!cancelled) showError(error?.message || "Benchmark failed.");
  } finally {
    terminateAllWorkers();
    running = false;
    refreshControls();
  }
}

function buildJobs({ player, compare, opponents, games, seed, primaryStrategy, compareStrategy }) {
  const jobs = [];
  const variants = [{ key: "primary", name: player.name, class: player.class, deck: player.deck, strategy: primaryStrategy }];
  if (compare) variants.push({ key: "compare", name: compare.name, class: compare.class, deck: compare.deck, strategy: compareStrategy });

  for (const opponent of opponents) {
    const opponentDeck = resolveReferenceDeck(opponent);
    for (const variant of variants) {
      for (let startIndex = 0; startIndex < games; startIndex += CHUNK_SIZE) {
        jobs.push({
          id: `${opponent.id}:${variant.key}:${startIndex}`,
          opponentId: opponent.id,
          opponentName: opponent.name,
          opponentClass: opponent.class,
          opponentFormat: opponent.format,
          variantKey: variant.key,
          variantName: variant.name,
          playerDeck: variant.deck,
          playerClass: variant.class,
          playerStrategy: variant.strategy,
          opponentDeck,
          opponentStrategy: opponent.strategy ?? {},
          games: Math.min(CHUNK_SIZE, games - startIndex),
          startIndex,
          seed: `${seed}:${opponent.id}`
        });
      }
    }
  }
  return jobs;
}

async function runJobQueue(jobs, progressByJob, totalGames) {
  const results = [];
  let cursor = 0;

  async function runner() {
    while (!cancelled) {
      const index = cursor++;
      if (index >= jobs.length) return;
      const result = await runChunk(jobs[index], progressByJob, totalGames);
      results.push(result);
    }
  }

  const count = Math.min(MAX_PARALLEL_WORKERS, jobs.length);
  await Promise.all(Array.from({ length: count }, () => runner()));
  return results;
}

function runChunk(job, progressByJob, totalGames) {
  return new Promise((resolve, reject) => {
    const worker = new Worker("./js/battle-benchmark-fast-worker.js", { type: "module" });
    workers.add(worker);

    const cleanup = () => {
      workers.delete(worker);
      worker.terminate();
    };

    worker.addEventListener("message", event => {
      const message = event.data ?? {};
      if (message.type === "progress") {
        progressByJob.set(job.id, Math.min(job.games, Number(message.done) || 0));
        const completed = [...progressByJob.values()].reduce((sum, value) => sum + value, 0);
        if (els.progress) els.progress.value = completed;
        if (els.progressLabel) els.progressLabel.textContent = `${completed} / ${totalGames}`;
        return;
      }
      if (message.type === "complete") {
        cleanup();
        resolve({ ...job, ...message });
        return;
      }
      if (message.type === "error") {
        cleanup();
        reject(new Error(message.message || "Benchmark worker failed."));
      }
    });

    worker.addEventListener("error", error => {
      cleanup();
      reject(new Error(error.message || "Benchmark worker crashed."));
    });

    worker.postMessage({
      type: "run-chunk",
      jobId: job.id,
      cards: state.cards,
      playerDeck: job.playerDeck,
      opponentDeck: job.opponentDeck,
      playerClass: job.playerClass,
      opponentClass: job.opponentClass,
      playerStrategy: job.playerStrategy,
      opponentStrategy: job.opponentStrategy,
      games: job.games,
      startIndex: job.startIndex,
      seed: job.seed
    });
  });
}

function mergeChunks(chunks, opponents, player, compare) {
  return opponents.map(opponent => {
    const primaryChunks = chunks.filter(chunk => chunk.opponentId === opponent.id && chunk.variantKey === "primary");
    const compareChunks = chunks.filter(chunk => chunk.opponentId === opponent.id && chunk.variantKey === "compare");
    const primary = finalizeMerged(primaryChunks);
    const comparison = compareChunks.length ? finalizeMerged(compareChunks) : null;
    return {
      id: opponent.id,
      name: opponent.name,
      class: opponent.class,
      format: opponent.format,
      ...primary,
      compare: comparison ? {
        name: compare?.name || "Compare deck",
        ...comparison,
        deltaWinRate: comparison.overall.winRate - primary.overall.winRate
      } : null
    };
  });
}

function finalizeMerged(chunks) {
  if (!chunks.length) throw new Error("Incomplete benchmark result.");
  const overallRaw = mergeAggregate(chunks.map(chunk => chunk.overall));
  const firstRaw = mergeAggregate(chunks.map(chunk => chunk.first));
  const secondRaw = mergeAggregate(chunks.map(chunk => chunk.second));
  const overall = finalizeAggregate(overallRaw);
  const first = finalizeAggregate(firstRaw);
  const second = finalizeAggregate(secondRaw);
  const coverage = chunks[0].coverage;
  const ruleGaps = overall.ruleGapsPerGame;
  return {
    overall,
    first,
    second,
    coverage,
    diagnostics: {
      sideGap: Math.abs(first.winRate - second.winRate),
      unresolvedTriggersPerGame: ruleGaps,
      ruleGapsPerGame: ruleGaps,
      rulesTier: coverage.unsupportedCopies > 0 || coverage.minimumModeledPercent < 80 || ruleGaps >= .5 ? "low" : coverage.partialCopies > 12 || coverage.minimumModeledPercent < 92 || ruleGaps >= .1 ? "partial" : "good"
    }
  };
}

function mergeAggregate(parts) {
  return parts.reduce((total, part) => {
    total.games += Number(part?.games) || 0;
    total.wins += Number(part?.wins) || 0;
    total.losses += Number(part?.losses) || 0;
    total.draws += Number(part?.draws) || 0;
    total.rounds += Number(part?.rounds) || 0;
    total.ruleGapExposures += Number(part?.ruleGapExposures) || 0;
    return total;
  }, { games: 0, wins: 0, losses: 0, draws: 0, rounds: 0, ruleGapExposures: 0 });
}

function finalizeAggregate(raw) {
  const games = raw.games || 0;
  const winRate = games ? raw.wins / games * 100 : 0;
  return {
    games,
    wins: raw.wins,
    losses: raw.losses,
    draws: raw.draws,
    winRate,
    winRate95: wilsonInterval(raw.wins, games),
    averageRounds: games ? raw.rounds / games : 0,
    ruleGapsPerGame: games ? raw.ruleGapExposures / games : 0,
    unsupportedTriggersPerGame: games ? raw.ruleGapExposures / games : 0
  };
}

function renderResults(results, comparison) {
  if (!results.length) return;
  if (comparison && results.some(result => result.compare)) {
    renderComparison(results, comparison);
    return;
  }

  const overall = summarizeAll(results);
  els.results.innerHTML = `
    <div class="benchmark-overall">
      ${metric(formatPct(overall.winRate), "WR")}
      ${metric(`${overall.wins}-${overall.losses}-${overall.draws}`, "W/L/D")}
      ${metric(`T${overall.averageRounds.toFixed(1)}`, "Avg turn")}
      ${metric(`${overall.averageSideGap.toFixed(1)}%`, "First/Second gap")}
      ${metric(overall.unresolvedPerGame.toFixed(2), "Rule gaps/game")}
    </div>
    <div class="benchmark-table-wrap">
      <table class="benchmark-table">
        <thead><tr><th>Opponent</th><th>WR</th><th>95% CI</th><th>First WR</th><th>Second WR</th><th>Gap</th><th>W/L/D</th><th>Avg turn</th><th>Rule gaps</th><th>Coverage</th></tr></thead>
        <tbody>${results.map(renderRow).join("")}</tbody>
      </table>
    </div>`;
}

function renderComparison(results, comparison) {
  const primaryOverall = summarizeAll(results);
  const compareRows = results.map(result => ({ overall: result.compare.overall, diagnostics: result.compare.diagnostics }));
  const compareOverall = summarizeAll(compareRows);
  const delta = compareOverall.winRate - primaryOverall.winRate;
  els.results.innerHTML = `
    <div class="benchmark-overall">
      ${metric(formatPct(primaryOverall.winRate), comparison.primaryName)}
      ${metric(formatPct(compareOverall.winRate), comparison.compareName)}
      ${metric(formatSignedPct(delta), "WR delta")}
      ${metric(`${primaryOverall.averageSideGap.toFixed(1)}% / ${compareOverall.averageSideGap.toFixed(1)}%`, "Side gap A/B")}
    </div>
    <div class="benchmark-table-wrap">
      <table class="benchmark-table">
        <thead><tr><th>Opponent</th><th>A WR</th><th>B WR</th><th>Delta</th><th>A First/Second</th><th>B First/Second</th><th>Coverage</th></tr></thead>
        <tbody>${results.map(renderCompareRow).join("")}</tbody>
      </table>
    </div>`;
}

function renderRow(result) {
  const o = result.overall;
  const coverage = result.coverage?.minimumModeledPercent ?? 0;
  return `<tr>
    <td><strong>${escapeHtml(result.name)}</strong></td>
    <td class="benchmark-win">${formatPct(o.winRate)}</td>
    <td>${formatRange(o.winRate95)}</td>
    <td>${formatPct(result.first.winRate)}</td>
    <td>${formatPct(result.second.winRate)}</td>
    <td>${formatPct(result.diagnostics.sideGap)}</td>
    <td>${o.wins}-${o.losses}-${o.draws}</td>
    <td>T${o.averageRounds.toFixed(1)}</td>
    <td>${Number(result.diagnostics.unresolvedTriggersPerGame || 0).toFixed(2)}/g</td>
    <td><span class="benchmark-coverage ${result.diagnostics.rulesTier}">${coverage}%</span></td>
  </tr>`;
}

function renderCompareRow(result) {
  const a = result.overall;
  const b = result.compare.overall;
  const delta = b.winRate - a.winRate;
  return `<tr>
    <td><strong>${escapeHtml(result.name)}</strong></td>
    <td class="benchmark-win">${formatPct(a.winRate)}</td>
    <td class="benchmark-win">${formatPct(b.winRate)}</td>
    <td>${formatSignedPct(delta)}</td>
    <td>${formatPct(result.first.winRate)} / ${formatPct(result.second.winRate)}</td>
    <td>${formatPct(result.compare.first.winRate)} / ${formatPct(result.compare.second.winRate)}</td>
    <td>${result.coverage.minimumModeledPercent}% / ${result.compare.coverage.minimumModeledPercent}%</td>
  </tr>`;
}

function summarizeAll(results) {
  const totalGames = results.reduce((sum, row) => sum + Number(row.overall?.games || 0), 0) || 1;
  const wins = results.reduce((sum, row) => sum + Number(row.overall?.wins || 0), 0);
  const losses = results.reduce((sum, row) => sum + Number(row.overall?.losses || 0), 0);
  const draws = results.reduce((sum, row) => sum + Number(row.overall?.draws || 0), 0);
  const weighted = getter => results.reduce((sum, row) => sum + getter(row) * Number(row.overall?.games || 0), 0) / totalGames;
  return {
    wins,
    losses,
    draws,
    winRate: wins / totalGames * 100,
    averageRounds: weighted(row => Number(row.overall?.averageRounds || 0)),
    averageSideGap: weighted(row => Number(row.diagnostics?.sideGap || 0)),
    unresolvedPerGame: weighted(row => Number(row.diagnostics?.unresolvedTriggersPerGame || 0))
  };
}

function cancelBenchmark() {
  if (!running) return;
  cancelled = true;
  terminateAllWorkers();
  running = false;
  clearOutput();
  refreshControls();
}

function terminateAllWorkers() {
  for (const worker of workers) worker.terminate();
  workers.clear();
}

function clearOutput() {
  if (els.results) els.results.innerHTML = "";
  if (els.progress) {
    els.progress.value = 0;
    els.progress.hidden = true;
  }
  if (els.progressLabel) els.progressLabel.textContent = "";
  if (els.status && els.status.dataset.type !== "error") {
    els.status.dataset.type = "info";
    els.status.textContent = "";
  }
}

function showError(message) {
  if (!els.status) return;
  els.status.dataset.type = "error";
  els.status.textContent = message;
}

function getSelectedPlayerDeck() {
  return getDeckByKey(els.yourDeck?.value || "__current__");
}

function getCompareDeck() {
  const key = els.compare?.value || "";
  return key ? getDeckByKey(key) : null;
}

function getDeckByKey(key) {
  if (key === "__current__") return { key, name: "Current deck", class: state.selectedClass, deck: mainDeckFrom(state.deck) };
  const variant = state.savedDecks?.[key];
  return { key, name: key || "Saved deck", class: variant?.class ?? state.selectedClass, deck: mainDeckFrom(new Map((variant?.deck ?? []).map(([id, qty]) => [Number(id), Number(qty)]))) };
}

function getSelectedOpponents() {
  const decks = referenceData.decks ?? [];
  if (els.scope?.value === "all") return decks.filter(deck => deckSize(resolveReferenceDeck(deck)) === 40);
  const selected = decks.find(deck => deck.id === els.opponent?.value) ?? decks[0];
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
  const requested = els.playerStrategy?.value || "auto";
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

function wilsonInterval(successes, trials, z = 1.959963984540054) {
  if (!trials) return { low: 0, high: 0 };
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials) / denominator;
  return {
    low: successes <= 0 ? 0 : Math.max(0, (center - margin) * 100),
    high: successes >= trials ? 100 : Math.min(100, (center + margin) * 100)
  };
}

function deckFingerprint(deck) {
  return (deck ?? []).map(([id, qty]) => [Number(id), Number(qty)]).sort((a, b) => a[0] - b[0]).map(([id, qty]) => `${id}:${qty}`).join("|");
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
