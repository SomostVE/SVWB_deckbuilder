// Reproducible Battle Sim v5 matrix for Ward Havencraft and Puppetry Portalcraft.
import fs from "node:fs/promises";
import { runMatchupBenchmark } from "../js/battle-benchmark-core.js";
import { analyzeCardSupport } from "../js/battle-engine.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const refs = JSON.parse(await fs.readFile(new URL("../data/custom/reference-decks.json", import.meta.url), "utf8"));
const cardMap = new Map(cards.map(card => [Number(card.id), card]));
const decks = refs.decks ?? [];

for (const card of cardMap.values()) {
  card.__relatedNames = (card.relatedCards ?? []).map(id => cardMap.get(Number(id))?.name).filter(Boolean);
}

const focusIds = new Set(["ward-havencraft", "puppetry-portalcraft"]);
const focusDecks = decks.filter(deck => focusIds.has(deck.id));

if (focusDecks.length !== focusIds.size) {
  throw new Error(`Expected ${focusIds.size} focus decks, found ${focusDecks.length}`);
}

function deckList(reference) {
  return reference.cards.map(card => [Number(card.cardId), Number(card.qty ?? 1)]);
}

function fmt(value, digits = 1) {
  return Number(value ?? 0).toFixed(digits);
}

function generatedDependencies(reference) {
  const deckIds = new Set(reference.cards.map(card => Number(card.cardId)));
  const visited = new Set(deckIds);
  const queue = [...deckIds];
  const dependencies = [];

  while (queue.length) {
    const id = queue.shift();
    const card = cardMap.get(Number(id));
    if (!card) continue;
    for (const relatedIdValue of card.relatedCards ?? []) {
      const relatedId = Number(relatedIdValue);
      if (!relatedId || visited.has(relatedId)) continue;
      visited.add(relatedId);
      queue.push(relatedId);
      const related = cardMap.get(relatedId);
      if (!related || deckIds.has(relatedId)) continue;
      const support = analyzeCardSupport(related);
      dependencies.push({
        source: card.name,
        card: related.name,
        level: support.level,
        reason: support.reason ?? ""
      });
    }
  }

  return dependencies;
}

function printCardDetails(name) {
  const card = cards.find(item => item.name === name);
  if (!card) {
    console.log(`Card details missing: ${name}`);
    return;
  }
  const support = analyzeCardSupport(card);
  console.log(`\n--- ${name} ---`);
  console.log(`id=${card.id} type=${card.type} cost=${card.cost} traits=${(card.traits ?? []).join(",") || "-"} keywords=${(card.keywords ?? []).join(",") || "-"}`);
  console.log(`support=${support.level} reason=${support.reason ?? "-"}`);
  console.log(`related=${(card.__relatedNames ?? []).join(" | ") || "-"}`);
  console.log(`text=${String(card.text ?? "").replace(/\s+/g, " ").trim() || "-"}`);
}

function auditFocusDeck(reference) {
  console.log(`Focus deck rule audit: ${reference.name}`);
  for (const entry of reference.cards) {
    const card = cardMap.get(Number(entry.cardId));
    if (!card) {
      console.log(`  MISSING ${entry.cardId}`);
      continue;
    }
    const support = analyzeCardSupport(card);
    const text = String(card.text ?? "").replace(/\s+/g, " ").trim() || "-";
    console.log(`  ${entry.qty ?? 1}x ${card.name} | ${support.level} | ${support.reason ?? "-"} | ${text}`);
  }
}

printCardDetails("Freerunning");
printCardDetails("Analyzing Artifact");
for (const reference of focusDecks) auditFocusDeck(reference);

for (const player of focusDecks) {
  console.log(`\n=== ${player.name} ===`);
  const dependencies = generatedDependencies(player);
  const nonFullDependencies = dependencies.filter(item => item.level !== "full");
  if (nonFullDependencies.length) {
    console.log("Generated / related cards with incomplete rules:");
    for (const item of nonFullDependencies) {
      console.log(`  ${item.card} <- ${item.source} | ${item.level} | ${item.reason}`);
    }
  } else {
    console.log("Generated / related cards: all discovered dependencies fully modeled.");
  }

  let totalWins = 0;
  let totalGames = 0;
  let totalDraws = 0;
  let totalRuleGaps = 0;

  for (const opponent of decks) {
    const result = runMatchupBenchmark({
      playerDeck: deckList(player),
      opponentDeck: deckList(opponent),
      cardMap,
      playerStrategy: player.strategy ?? {},
      opponentStrategy: opponent.strategy ?? {},
      games: 100,
      seed: `v5-rebenchmark:${player.id}:${opponent.id}`
    });

    totalWins += result.overall.wins;
    totalGames += result.overall.games;
    totalDraws += result.overall.draws;
    totalRuleGaps += result.overall.ruleGapsPerGame * result.overall.games;

    console.log([
      opponent.name.padEnd(22),
      `WR ${fmt(result.overall.winRate)}%`,
      `F ${fmt(result.first.winRate)}%`,
      `S ${fmt(result.second.winRate)}%`,
      `draw ${fmt(result.overall.drawRate)}%`,
      `gaps ${fmt(result.overall.ruleGapsPerGame, 2)}/g`,
      `coverage ${result.coverage.player.modeledPercent}%/${result.coverage.opponent.modeledPercent}%`,
      `rules ${result.diagnostics.rulesTier}`
    ].join(" | "));

    if (result.overall.ruleGapsByCard?.length) {
      console.log(`  gap sources: ${result.overall.ruleGapsByCard.map(item => `${item.name}=${item.count} (${fmt(item.perGame, 2)}/g)`).join(" | ")}`);
    }
  }

  const aggregateWinRate = totalGames ? totalWins / totalGames * 100 : 0;
  const aggregateDrawRate = totalGames ? totalDraws / totalGames * 100 : 0;
  const aggregateGaps = totalGames ? totalRuleGaps / totalGames : 0;
  console.log(`TOTAL (${totalGames} games) | WR ${fmt(aggregateWinRate)}% | draw ${fmt(aggregateDrawRate)}% | gaps ${fmt(aggregateGaps, 2)}/g`);
}
