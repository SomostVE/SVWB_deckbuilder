import fs from "node:fs/promises";
import { runMatchupBenchmark } from "../js/battle-benchmark-core.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const refs = JSON.parse(await fs.readFile(new URL("../data/custom/reference-decks.json", import.meta.url), "utf8"));
const cardMap = new Map(cards.map(card => [Number(card.id), card]));
const decks = refs.decks ?? [];

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

for (const player of focusDecks) {
  console.log(`\n=== ${player.name} ===`);
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
  }

  const aggregateWinRate = totalGames ? totalWins / totalGames * 100 : 0;
  const aggregateDrawRate = totalGames ? totalDraws / totalGames * 100 : 0;
  const aggregateGaps = totalGames ? totalRuleGaps / totalGames : 0;
  console.log(`TOTAL (${totalGames} games) | WR ${fmt(aggregateWinRate)}% | draw ${fmt(aggregateDrawRate)}% | gaps ${fmt(aggregateGaps, 2)}/g`);
}
