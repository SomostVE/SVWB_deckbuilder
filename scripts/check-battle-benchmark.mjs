import fs from "node:fs/promises";
import { runMatchupBenchmark } from "../js/battle-benchmark-core.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const refs = JSON.parse(await fs.readFile(new URL("../data/custom/reference-decks.json", import.meta.url), "utf8"));
const cardMap = new Map(cards.map(card => [Number(card.id), card]));
const decks = refs.decks ?? [];
if (decks.length < 7) throw new Error("Reference deck pool is incomplete");

const player = decks[0];
const playerDeck = player.cards.map(card => [Number(card.cardId), Number(card.qty ?? 1)]);

for (const opponent of decks) {
  const opponentDeck = opponent.cards.map(card => [Number(card.cardId), Number(card.qty ?? 1)]);
  const result = runMatchupBenchmark({
    playerDeck,
    opponentDeck,
    cardMap,
    playerStrategy: player.strategy ?? {},
    opponentStrategy: opponent.strategy ?? {},
    games: 10,
    seed: `ci-benchmark:${opponent.id}`
  });

  if (result.overall.games !== 10) throw new Error(`${opponent.name}: benchmark returned ${result.overall.games}/10 games`);
  if (result.first.games !== 5 || result.second.games !== 5) throw new Error(`${opponent.name}: first/second split is not balanced`);
  if (result.overall.wins + result.overall.losses + result.overall.draws !== 10) throw new Error(`${opponent.name}: invalid W-L-D total`);

  const interval = result.overall.winRate95;
  if (!interval || interval.low > result.overall.winRate || interval.high < result.overall.winRate) {
    throw new Error(`${opponent.name}: invalid 95% win-rate interval`);
  }

  const expectedGap = Math.abs(result.first.winRate - result.second.winRate);
  if (Math.abs((result.diagnostics?.sideGap ?? -1) - expectedGap) > 1e-9) {
    throw new Error(`${opponent.name}: side-gap diagnostic is inconsistent`);
  }

  if (result.diagnostics?.sampleTier !== "exploratory") {
    throw new Error(`${opponent.name}: 10-game smoke sample must be exploratory`);
  }

  if (!["good", "partial", "low"].includes(result.diagnostics?.rulesTier)) {
    throw new Error(`${opponent.name}: invalid rules reliability tier`);
  }

  console.log(`${opponent.name}: ${result.overall.winRate.toFixed(1)}% · CI ${interval.low.toFixed(1)}-${interval.high.toFixed(1)} · first ${result.first.winRate.toFixed(1)}% · second ${result.second.winRate.toFixed(1)}% · gap ${result.diagnostics.sideGap.toFixed(1)}% · unresolved ${result.diagnostics.unresolvedTriggersPerGame.toFixed(2)}/g · coverage ${result.coverage.minimumModeledPercent}%`);
}
