from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing replacement target: {label}")
    return text.replace(old, new, 1)


def replace_function(text, name, new_body, next_name):
    start = text.index(f"function {name}(")
    end = text.index(f"function {next_name}(", start)
    return text[:start] + new_body.rstrip() + "\n\n" + text[end:]

# battle.html
path = Path("battle.html")
text = path.read_text()
old = '''      <div class="benchmark-controls">\n        <label>\n          <span>Opponent pool</span>'''
new = '''      <div class="benchmark-controls">\n        <label>\n          <span>Benchmark mode</span>\n          <select id="benchmark-mode">\n            <option value="deck">Deck benchmark</option>\n            <option value="calibration">AI mirror calibration</option>\n          </select>\n        </label>\n        <label>\n          <span>Opponent pool</span>'''
text = replace_once(text, old, new, "benchmark mode control")
text = text.replace("The benchmark uses the baseline AI for now; rules coverage is the priority.", "Run deck matchups or calibrate the current AI with reference-deck mirrors. Rules coverage and side bias stay visible.")
path.write_text(text)

# battle-benchmark.js
path = Path("js/battle-benchmark.js")
text = path.read_text()
text = replace_once(text,
'''  seed: document.getElementById("battle-seed"),\n  scope: document.getElementById("benchmark-scope"),''',
'''  seed: document.getElementById("battle-seed"),\n  mode: document.getElementById("benchmark-mode"),\n  scope: document.getElementById("benchmark-scope"),''',
"benchmark mode element")
text = replace_once(text,
'''  for (const element of [els.yourDeck, els.playerStrategy, els.opponent, els.scope, els.games, els.compare]) {''',
'''  for (const element of [els.yourDeck, els.playerStrategy, els.opponent, els.mode, els.scope, els.games, els.compare]) {''',
"benchmark mode event")

refresh_status = r'''function refreshStatus() {
  if (!ready) return;
  const calibration = benchmarkMode() === "calibration";
  const games = Number(els.games.value) || 100;
  els.scope.disabled = calibration;
  els.compare.disabled = calibration;
  els.run.textContent = calibration ? "Run AI calibration" : "Run benchmark";

  if (calibration) {
    const mirrors = referenceData.decks ?? [];
    const total = games * mirrors.length;
    els.run.disabled = mirrors.length === 0 || Boolean(worker);
    els.status.dataset.type = "info";
    const sample = games >= 1000 ? "high sample" : games >= 500 ? "medium sample" : "exploratory sample";
    els.status.textContent = `${mirrors.length} reference-deck mirrors · ${games} games each · ${total.toLocaleString()} total simulations · ${sample} · current AI calibration.`;
    return;
  }

  const player = getSelectedPlayerDeck();
  const compare = getCompareDeck();
  const opponents = getSelectedOpponents();
  const count = deckSize(player.deck);
  const compareCount = compare ? deckSize(compare.deck) : 40;
  const sameDeck = compare ? deckFingerprint(compare.deck) === deckFingerprint(player.deck) : false;
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
    els.status.textContent = `${opponents.length} matchup${opponents.length === 1 ? "" : "s"} · ${games} games each · ${total.toLocaleString()} total simulations · ${sample} · ${mode} · Current AI.`;
  }
}

function benchmarkMode() {
  return els.mode?.value === "calibration" ? "calibration" : "deck";
}'''
text = replace_function(text, "refreshStatus", refresh_status, "runBenchmark")

run_benchmark = r'''function runBenchmark() {
  if (!ready || worker) return;
  const calibration = benchmarkMode() === "calibration";
  const games = Number(els.games.value) || 100;
  const seed = String(els.seed.value || "deci-benchmark").trim() || "deci-benchmark";

  let player = null;
  let compare = null;
  let opponents = [];
  let strategy = null;
  let compareStrategy = null;
  let references = [];
  let totalGames = 0;

  if (calibration) {
    references = (referenceData.decks ?? []).map(deck => ({
      id: deck.id,
      name: deck.name,
      class: deck.class,
      format: deck.format,
      strategy: deck.strategy ?? {},
      deck: resolveReferenceDeck(deck)
    })).filter(deck => deckSize(deck.deck) === 40);
    if (!references.length) return;
    totalGames = games * references.length;
  } else {
    player = getSelectedPlayerDeck();
    compare = getCompareDeck();
    opponents = getSelectedOpponents();
    if (deckSize(player.deck) !== 40 || !opponents.length) return;
    if (compare && (deckSize(compare.deck) !== 40 || deckFingerprint(compare.deck) === deckFingerprint(player.deck))) return;
    strategy = getPlayerStrategy(player.deck);
    compareStrategy = compare ? getPlayerStrategy(compare.deck) : null;
    totalGames = games * opponents.length * (compare ? 2 : 1);
  }

  els.results.innerHTML = "";
  els.progress.hidden = false;
  els.progress.max = totalGames;
  els.progress.value = 0;
  els.progressLabel.textContent = `0 / ${totalGames.toLocaleString()}`;
  els.status.dataset.type = "info";
  els.status.textContent = calibration
    ? "AI mirror calibration running. Each reference deck plays itself with an alternating First/Second split."
    : compare
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
      if (message.calibration) renderCalibrationResults(message.results ?? []);
      else renderResults(message.results ?? [], message.comparison ?? null);
      els.status.dataset.type = "info";
      els.status.textContent = message.calibration
        ? `AI mirror calibration complete · ${Number(message.totalGames || 0).toLocaleString()} simulations. Mirror win rate should sit near 50%; First/Second gap exposes side bias.`
        : message.comparison
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

  if (calibration) {
    worker.postMessage({
      type: "calibration",
      cards: state.cards,
      references,
      games,
      seed
    });
    return;
  }

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
}'''
text = replace_function(text, "runBenchmark", run_benchmark, "cancelBenchmark")

refresh_run = r'''function refreshRunOnly() {
  if (benchmarkMode() === "calibration") {
    els.run.disabled = !(referenceData.decks ?? []).length || Boolean(worker);
    return;
  }
  const player = getSelectedPlayerDeck();
  const compare = getCompareDeck();
  const invalidCompare = compare && (deckSize(compare.deck) !== 40 || deckFingerprint(compare.deck) === deckFingerprint(player.deck));
  els.run.disabled = deckSize(player.deck) !== 40 || invalidCompare || getSelectedOpponents().length === 0 || Boolean(worker);
}'''
text = replace_function(text, "refreshRunOnly", refresh_run, "renderResults")

insert = r'''function renderCalibrationResults(results) {
  if (!results.length) {
    els.results.innerHTML = '<div class="tools-muted">No calibration results.</div>';
    return;
  }

  const totalGames = results.reduce((sum, row) => sum + Number(row.overall?.games || 0), 0) || 1;
  const weighted = getter => results.reduce((sum, row) => sum + getter(row) * Number(row.overall?.games || 0), 0) / totalGames;
  const averageMirrorWinRate = weighted(row => Number(row.overall?.winRate || 0));
  const averageSideGap = weighted(row => Number(row.diagnostics?.sideGap ?? Math.abs(row.first.winRate - row.second.winRate)));
  const averageRounds = weighted(row => Number(row.overall?.averageRounds || 0));
  const worst = results.reduce((best, row) => {
    const gap = Number(row.diagnostics?.sideGap ?? Math.abs(row.first.winRate - row.second.winRate));
    return !best || gap > best.gap ? { name: row.name, gap } : best;
  }, null);
  const unresolved = weighted(row => Number(row.diagnostics?.unresolvedTriggersPerGame ?? row.overall?.unsupportedTriggersPerGame ?? 0));

  els.results.innerHTML = `
    <div class="benchmark-overall">
      ${metric(formatPct(averageMirrorWinRate), "Average mirror win rate")}
      ${metric(`${averageSideGap.toFixed(1)}%`, "Average First/Second gap")}
      ${metric(`${worst?.gap.toFixed(1) ?? "0.0"}%`, `Largest side gap · ${worst?.name ?? "—"}`)}
      ${metric(`T${averageRounds.toFixed(1)}`, "Average ending turn")}
      ${metric(unresolved.toFixed(2), "Rule gaps per game")}
    </div>
    <div class="benchmark-table-wrap">
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Reference deck</th><th>Mirror win rate</th><th>Win rate when going first</th><th>Win rate when going second</th><th>First/Second win-rate gap</th><th>Wins / Losses / Draws</th><th>Average ending turn</th><th>Rule gaps per game</th><th>Rules coverage</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(renderCalibrationRow).join("")}
        </tbody>
      </table>
    </div>
    <div class="benchmark-note">This mode measures the simulator and AI, not deck strength: every reference deck plays an identical copy of itself. A mirror win rate near 50% is expected. The important diagnostic is the First/Second gap; large values indicate side-sensitive play or game rules that deserve inspection.</div>
  `;
}

function renderCalibrationRow(result) {
  const o = result.overall;
  const diagnostics = result.diagnostics ?? {};
  const reliability = diagnostics.rulesTier ? tierLabel(diagnostics.rulesTier) : coverageLabel(result.coverage);
  return `
    <tr>
      <td><strong>${escapeHtml(result.name)}</strong><small>${escapeHtml(result.class || "")} · ${escapeHtml(result.format || "Unlimited")} · mirror</small></td>
      <td class="benchmark-win">${formatPct(o.winRate)}</td>
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

'''
marker = "function renderResults(results, comparison) {"
if marker not in text:
    raise SystemExit("missing renderResults marker")
text = text.replace(marker, insert + marker, 1)
path.write_text(text)

# worker
path = Path("js/battle-benchmark-worker.js")
text = path.read_text()
text = replace_once(text,
'''  if (payload.type !== "run") return;\n\n  try {\n    const cardMap = new Map((payload.cards ?? []).map(card => [Number(card.id), card]));''',
'''  if (payload.type !== "run" && payload.type !== "calibration") return;\n\n  try {\n    const cardMap = new Map((payload.cards ?? []).map(card => [Number(card.id), card]));\n    if (payload.type === "calibration") {\n      runCalibration(payload, cardMap);\n      return;\n    }''',
"worker calibration dispatch")
worker_insert = r'''
function runCalibration(payload, cardMap) {
  const references = payload.references ?? [];
  const results = [];
  const gamesPerMatchup = Math.max(1, Number(payload.games) || 100);
  const totalGames = gamesPerMatchup * references.length;
  let completed = 0;

  for (const reference of references) {
    const opponent = {
      id: reference.id,
      name: reference.name,
      class: reference.class,
      format: reference.format,
      strategy: reference.strategy ?? {},
      deck: reference.deck
    };
    const result = runOne({
      playerDeck: reference.deck,
      playerStrategy: reference.strategy ?? {},
      opponent,
      cardMap,
      gamesPerMatchup,
      seed: `${payload.seed || "deci-benchmark"}:${reference.id}:mirror`,
      completed,
      totalGames,
      label: "Mirror"
    });
    completed += gamesPerMatchup;
    results.push({
      id: reference.id,
      name: reference.name,
      class: reference.class,
      format: reference.format,
      ...result,
      compare: null
    });
  }

  self.postMessage({
    type: "complete",
    calibration: true,
    results,
    totalGames,
    comparison: null
  });
}

'''
marker = "function runOne({ playerDeck"
if marker not in text:
    raise SystemExit("missing worker runOne marker")
text = text.replace(marker, worker_insert + marker, 1)
path.write_text(text)

print("Benchmark AI calibration UI materialized")
