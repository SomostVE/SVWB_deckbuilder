import fs from "node:fs/promises";
import assert from "node:assert/strict";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const refs = JSON.parse(await fs.readFile(new URL("../data/custom/reference-decks.json", import.meta.url), "utf8"));
const decks = refs.decks ?? [];
if (decks.length < 2) throw new Error("Need at least two reference decks for compare smoke test");

let messageHandler = null;
const messages = [];
globalThis.self = {
  addEventListener(type, handler) {
    if (type === "message") messageHandler = handler;
  },
  postMessage(message) {
    messages.push(message);
  }
};

await import("../js/battle-benchmark-worker.js");
assert.ok(messageHandler, "Benchmark worker did not register a message handler");

const primary = decks[0];
const compare = decks[1];
const opponent = decks[2] ?? decks[0];
const rows = deck => deck.cards.map(card => [Number(card.cardId), Number(card.qty ?? 1)]);

messageHandler({
  data: {
    type: "run",
    cards,
    playerName: primary.name,
    playerDeck: rows(primary),
    playerStrategy: primary.strategy ?? {},
    compareName: compare.name,
    compareDeck: rows(compare),
    compareStrategy: compare.strategy ?? {},
    opponents: [{
      id: opponent.id,
      name: opponent.name,
      class: opponent.class,
      format: opponent.format,
      strategy: opponent.strategy ?? {},
      deck: rows(opponent)
    }],
    games: 4,
    seed: "ci-paired-compare"
  }
});

const error = messages.find(message => message.type === "error");
if (error) throw new Error(error.message);
const complete = messages.find(message => message.type === "complete");
assert.ok(complete, "Paired benchmark did not complete");
assert.equal(complete.totalGames, 8, "Paired benchmark must run both deck variants");
assert.equal(complete.results.length, 1, "Paired benchmark must return one matchup row");
assert.equal(complete.comparison.primaryName, primary.name);
assert.equal(complete.comparison.compareName, compare.name);

const result = complete.results[0];
assert.equal(result.overall.games, 4);
assert.equal(result.compare.overall.games, 4);
assert.equal(result.compare.name, compare.name);
assert.equal(result.compare.deltaWinRate, result.compare.overall.winRate - result.overall.winRate);
assert.equal(result.compare.deltaFirst, result.compare.first.winRate - result.first.winRate);
assert.equal(result.compare.deltaSecond, result.compare.second.winRate - result.second.winRate);

console.log(`Paired benchmark comparison: OK · ${primary.name} vs ${compare.name} · Δ ${result.compare.deltaWinRate.toFixed(1)}%`);
