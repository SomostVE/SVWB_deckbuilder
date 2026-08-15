import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { analyzeDeckCoverage, simulateBattle } from "../js/battle-engine-v5.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const refs = JSON.parse(await fs.readFile(new URL("../data/custom/reference-decks.json", import.meta.url), "utf8"));
const cardMap = new Map(cards.map(card => [Number(card.id), card]));
const rowsOf = deck => (deck.cards ?? []).map(entry => [Number(entry.cardId), Number(entry.qty ?? 1)]);

function assertFrameIntegrity(result, label) {
  assert.ok(result.frames.length > 0, `${label}: replay must contain frames`);
  for (let index = 0; index < result.frames.length; index += 1) {
    const frame = result.frames[index];
    assert.equal(frame.index, index, `${label}: replay frame indexes must be contiguous`);
    assert.ok(Number.isInteger(frame.round) && frame.round >= 0 && frame.round <= 60, `${label}: invalid round at frame ${index}`);
    assert.ok(!/\b(?:Fuse unavailable|Play unavailable|No valid Fuse materials)\b/i.test(String(frame.action ?? "")), `${label}: planner executed an illegal action at frame ${index}: ${frame.action}`);

    for (const [side, player] of frame.players.entries()) {
      assert.ok(Number.isFinite(player.hp), `${label}: non-finite HP at frame ${index}/${side}`);
      assert.ok(Number.isFinite(player.pp) && player.pp >= 0, `${label}: negative/non-finite PP at frame ${index}/${side}`);
      assert.ok(Number.isFinite(player.maxPp) && player.maxPp >= 0 && player.maxPp <= 10, `${label}: invalid max PP at frame ${index}/${side}`);
      assert.ok(player.pp <= player.maxPp + 1, `${label}: PP exceeds legal max+ExtraPP at frame ${index}/${side}`);
      assert.ok(Number.isInteger(player.ep) && player.ep >= 0, `${label}: invalid EP at frame ${index}/${side}`);
      assert.ok(Number.isInteger(player.sep) && player.sep >= 0, `${label}: invalid SEP at frame ${index}/${side}`);
      assert.ok(Number.isInteger(player.deckCount) && player.deckCount >= 0, `${label}: invalid deck count at frame ${index}/${side}`);
      assert.ok(player.hand.length <= 9, `${label}: hand exceeds 9 cards at frame ${index}/${side}`);
      assert.ok(player.board.length <= 5, `${label}: board exceeds 5 slots at frame ${index}/${side}`);
      assert.ok(Number.isInteger(player.fusedCount) && player.fusedCount >= 0, `${label}: invalid fused-zone count at frame ${index}/${side}`);
      const boardUids = player.board.map(unit => unit.uid).filter(Boolean);
      assert.equal(new Set(boardUids).size, boardUids.length, `${label}: duplicate board UID at frame ${index}/${side}`);
      for (const unit of player.board) {
        if (unit.type !== "Follower") continue;
        assert.ok(Number.isFinite(unit.attack), `${label}: non-finite follower attack at frame ${index}/${side}`);
        assert.ok(Number.isFinite(unit.defense), `${label}: non-finite follower defense at frame ${index}/${side}`);
      }
    }
  }

  const last = result.frames.at(-1);
  assert.deepEqual(last.players.map(player => player.hp), result.summary.finalHp, `${label}: final replay HP must match summary`);
  assert.deepEqual(result.summary.stats.unsupportedEffects, [0, 0], `${label}: no unresolved rule effects are allowed`);
  assert.equal(result.summary.experimental, false, `${label}: fully modeled reference decks must not be experimental`);
}

for (const deck of refs.decks ?? []) {
  const rows = rowsOf(deck);
  assert.equal(rows.reduce((sum, [, qty]) => sum + qty, 0), 40, `${deck.name}: invalid deck size`);
  const coverage = analyzeDeckCoverage(rows, cardMap);
  assert.equal(coverage.full, 40, `${deck.name}: all copies must be full support`);
  assert.equal(coverage.partial, 0, `${deck.name}: partial support found`);
  assert.equal(coverage.unsupported, 0, `${deck.name}: unsupported support found`);
  assert.equal(coverage.modeledPercent, 100, `${deck.name}: coverage must be 100%`);
}

// Determinism and replay/state integrity on two mechanically different decks.
for (const id of ["buff-forestcraft", "puppetry-portalcraft"]) {
  const deck = (refs.decks ?? []).find(entry => entry.id === id);
  assert.ok(deck, `Missing reference deck ${id}`);
  const rows = rowsOf(deck);
  const input = {
    playerDeck: rows,
    opponentDeck: rows,
    cardMap,
    playerStrategy: deck.strategy ?? {},
    opponentStrategy: deck.strategy ?? {},
    seed: `integrity-${id}`,
    playerSide: "first",
    recordFrames: true
  };
  const a = simulateBattle(input);
  const b = simulateBattle(input);
  assert.deepEqual(b.summary, a.summary, `${deck.name}: same seed must reproduce summary exactly`);
  assert.deepEqual(b.frames, a.frames, `${deck.name}: same seed must reproduce replay exactly`);
  assertFrameIntegrity(a, deck.name);
}

console.log("Battle Sim integrity audit: OK");
