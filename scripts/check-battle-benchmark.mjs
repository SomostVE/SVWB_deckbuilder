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

  console.log(`${opponent.name}: ${result.overall.winRate.toFixed(1)}% · first ${result.first.winRate.toFixed(1)}% · second ${result.second.winRate.toFixed(1)}% · coverage ${result.coverage.minimumModeledPercent}%`);
}
