// Calibration marker: effect-aware evolution AI.
import fs from "node:fs/promises";
import { runMatchupBenchmark } from "../js/battle-benchmark-core.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const refs = JSON.parse(await fs.readFile(new URL("../data/custom/reference-decks.json", import.meta.url), "utf8"));
const cardMap = new Map(cards.map(card => [Number(card.id), card]));
const requestedId = String(process.env.MIRROR_DECK_ID ?? "").trim();
const games = Math.max(1, Number(process.env.MIRROR_GAMES ?? 1000) || 1000);
const decks = (refs.decks ?? []).filter(deck => !requestedId || deck.id === requestedId);
if (requestedId && !decks.length) throw new Error(`Unknown reference deck: ${requestedId}`);

function deckList(reference) {
  return reference.cards.map(card => [Number(card.cardId), Number(card.qty ?? 1)]);
}

function pct(value) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

function num(value, digits = 2) {
  return Number(value ?? 0).toFixed(digits);
}

console.log(`Battle Sim mirror calibration · ${decks.length} deck${decks.length === 1 ? "" : "s"} · ${games} games each`);
console.log("Deck | WR | First | Second | Side gap | Draw | Avg end | Rule gaps | Coverage");
console.log("---|---:|---:|---:|---:|---:|---:|---:|---:");

for (const reference of decks) {
  const deck = deckList(reference);
  const result = runMatchupBenchmark({
    playerDeck: deck,
    opponentDeck: deck,
    cardMap,
    playerStrategy: reference.strategy ?? {},
    opponentStrategy: reference.strategy ?? {},
    games,
    seed: `mirror-calibration-v5:${reference.id}`
  });

  console.log([
    reference.name,
    pct(result.overall.winRate),
    pct(result.first.winRate),
    pct(result.second.winRate),
    pct(result.diagnostics.sideGap),
    pct(result.overall.drawRate),
    `T${num(result.overall.averageRounds, 1)}`,
    `${num(result.overall.ruleGapsPerGame, 2)}/g`,
    `${result.coverage.minimumModeledPercent}%`
  ].join(" | "));
}
