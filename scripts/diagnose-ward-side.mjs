import fs from "node:fs/promises";
import { simulateBattle } from "../js/battle-engine.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const refs = JSON.parse(await fs.readFile(new URL("../data/custom/reference-decks.json", import.meta.url), "utf8"));
const cardMap = new Map(cards.map(card => [Number(card.id), card]));
const ref = refs.decks.find(deck => deck.id === "ward-havencraft");
const deck = ref.cards.map(card => [Number(card.cardId), Number(card.qty ?? 1)]);

function bucket() {
  return { games: 0, wins: 0, rounds: 0, damage: 0, taken: 0, ppSpent: 0, ppWasted: 0, cards: 0, evo: 0, superEvo: 0, healing: 0, bonusUses: 0, epLeft: 0, sepLeft: 0, hand: 0, board: 0 };
}
const out = { first: bucket(), second: bucket() };

for (let index = 0; index < 1000; index += 1) {
  const side = index % 2 === 0 ? "first" : "second";
  const result = simulateBattle({
    playerDeck: deck,
    opponentDeck: deck,
    cardMap,
    playerStrategy: ref.strategy,
    opponentStrategy: ref.strategy,
    seed: `mirror-calibration-v5:${ref.id}:${index}`,
    playerSide: side,
    recordFrames: true
  });
  const b = out[side];
  const stats = result.summary.stats;
  const last = result.frames.at(-1)?.players?.[0];
  b.games += 1;
  b.wins += result.summary.winnerIndex === 0 ? 1 : 0;
  b.rounds += result.summary.rounds;
  b.damage += stats.damageDealt[0];
  b.taken += stats.damageDealt[1];
  b.ppSpent += stats.ppSpent[0];
  b.ppWasted += stats.ppWasted[0];
  b.cards += stats.cardsPlayed[0];
  b.evo += stats.evolutions[0];
  b.superEvo += stats.superEvolutions[0];
  b.healing += stats.healing[0];
  b.bonusUses += last?.bonusPpUses ?? 0;
  b.epLeft += last?.ep ?? 0;
  b.sepLeft += last?.sep ?? 0;
  b.hand += last?.hand?.length ?? 0;
  b.board += last?.board?.length ?? 0;
}

for (const [side, b] of Object.entries(out)) {
  const n = b.games;
  console.log(side, JSON.stringify({
    WR: +(b.wins / n * 100).toFixed(1),
    avgRounds: +(b.rounds / n).toFixed(2),
    damage: +(b.damage / n).toFixed(2),
    damageTaken: +(b.taken / n).toFixed(2),
    ppSpent: +(b.ppSpent / n).toFixed(2),
    ppWasted: +(b.ppWasted / n).toFixed(2),
    cardsPlayed: +(b.cards / n).toFixed(2),
    evolutions: +(b.evo / n).toFixed(2),
    superEvolutions: +(b.superEvo / n).toFixed(2),
    healing: +(b.healing / n).toFixed(2),
    bonusPpUses: +(b.bonusUses / n).toFixed(2),
    epLeft: +(b.epLeft / n).toFixed(2),
    sepLeft: +(b.sepLeft / n).toFixed(2),
    finalHand: +(b.hand / n).toFixed(2),
    finalBoard: +(b.board / n).toFixed(2)
  }));
}
