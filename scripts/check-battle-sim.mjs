import fs from "node:fs/promises";
import { analyzeDeckCoverage, simulateBattle } from "../js/battle-engine.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const refs = JSON.parse(await fs.readFile(new URL("../data/custom/reference-decks.json", import.meta.url), "utf8"));
const cardMap = new Map(cards.map(card => [Number(card.id), card]));

let failed = false;
for (const deck of refs.decks ?? []) {
  const rows = (deck.cards ?? []).map(card => [Number(card.cardId), Number(card.qty ?? 1)]);
  const coverage = analyzeDeckCoverage(rows, cardMap);
  const total = rows.reduce((sum, [, qty]) => sum + qty, 0);
  if (total !== 40) throw new Error(`${deck.name}: ${total}/40 cards`);

  const result = simulateBattle({
    playerDeck: rows,
    opponentDeck: rows,
    cardMap,
    playerStrategy: deck.strategy ?? {},
    opponentStrategy: deck.strategy ?? {},
    seed: `ci-${deck.id}`,
    playerSide: "first"
  });

  if (!result.frames?.length) {
    failed = true;
    console.error(`${deck.name}: simulation produced no frames`);
  }

  console.log(`${deck.name}: ${coverage.modeledPercent}% modeled · ${coverage.full} full · ${coverage.partial} partial · ${coverage.unsupported} unsupported · ${result.frames.length} replay frames`);
}

if (failed) process.exitCode = 1;
