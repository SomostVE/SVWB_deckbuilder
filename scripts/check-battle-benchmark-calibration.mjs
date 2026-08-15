import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { runMatchupBenchmark } from "../js/battle-benchmark-core.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const refs = JSON.parse(await fs.readFile(new URL("../data/custom/reference-decks.json", import.meta.url), "utf8"));
const cardMap = new Map(cards.map(card => [Number(card.id), card]));
const decks = refs.decks ?? [];

function deckList(reference) {
  return reference.cards.map(card => [Number(card.cardId), Number(card.qty ?? 1)]);
}

function fingerprint(result) {
  return {
    overall: result.overall,
    first: result.first,
    second: result.second,
    coverage: result.coverage,
    diagnostics: result.diagnostics
  };
}

const fullyModeled = decks.filter(deck => ["spell-runecraft", "aggro-abysscraft"].includes(deck.id));
assert.equal(fullyModeled.length, 2, "Calibration expects the two fully modeled reference decks");

for (const reference of fullyModeled) {
  const deck = deckList(reference);
  const input = {
    playerDeck: deck,
    opponentDeck: deck,
    cardMap,
    playerStrategy: reference.strategy ?? {},
    opponentStrategy: reference.strategy ?? {},
    games: 40,
    seed: `ci-calibration:${reference.id}`
  };

  const firstRun = runMatchupBenchmark(input);
  const secondRun = runMatchupBenchmark(input);
  assert.deepEqual(fingerprint(secondRun), fingerprint(firstRun), `${reference.name}: identical seed/input must be exactly reproducible`);
  assert.equal(firstRun.first.games, 20, `${reference.name}: calibration must have 20 First games`);
  assert.equal(firstRun.second.games, 20, `${reference.name}: calibration must have 20 Second games`);
  assert.equal(firstRun.coverage.unsupportedCopies, 0, `${reference.name}: full-coverage calibration cannot contain unsupported cards`);
  assert.equal(firstRun.coverage.partialCopies, 0, `${reference.name}: full-coverage calibration cannot contain partial cards`);
  assert.equal(firstRun.overall.ruleGapsPerGame, 0, `${reference.name}: full-coverage mirror should have zero rule-gap exposures`);
  assert.equal(firstRun.diagnostics.rulesTier, "good", `${reference.name}: full-coverage mirror should be a good rules sample`);

  // This is deliberately broad: it catches catastrophic identity/side bias without
  // pretending a 40-game baseline-AI mirror is a statistical balance test.
  assert.ok(firstRun.overall.winRate >= 20 && firstRun.overall.winRate <= 80, `${reference.name}: mirror win rate ${firstRun.overall.winRate.toFixed(1)}% indicates severe simulator identity bias`);
  assert.ok(firstRun.diagnostics.sideGap <= 60, `${reference.name}: mirror First/Second gap ${firstRun.diagnostics.sideGap.toFixed(1)}% is implausibly large`);

  console.log(`${reference.name}: mirror ${firstRun.overall.winRate.toFixed(1)}% · first ${firstRun.first.winRate.toFixed(1)}% · second ${firstRun.second.winRate.toFixed(1)}% · side gap ${firstRun.diagnostics.sideGap.toFixed(1)}% · deterministic OK`);
}

const partialReference = decks.find(deck => deck.id === "buff-forestcraft");
assert.ok(partialReference, "Calibration expects Buff Forestcraft");
const partialDeck = deckList(partialReference);
const partial = runMatchupBenchmark({
  playerDeck: partialDeck,
  opponentDeck: partialDeck,
  cardMap,
  playerStrategy: partialReference.strategy ?? {},
  opponentStrategy: partialReference.strategy ?? {},
  games: 20,
  seed: "ci-calibration:partial-gap"
});
assert.ok(partial.coverage.partialCopies > 0, "Partial calibration deck should expose partial card copies");
assert.ok(partial.overall.ruleGapsPerGame > 0, "Playing partial cards should produce measurable rule-gap exposure");
assert.notEqual(partial.diagnostics.rulesTier, "good", "A frequently exposed partial matchup must not be labeled good");

console.log(`Partial rules gate: ${partial.overall.ruleGapsPerGame.toFixed(2)} rule gaps/game · ${partial.diagnostics.rulesTier}`);
console.log("Battle Sim benchmark calibration: OK");
