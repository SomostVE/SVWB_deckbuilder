import fs from "node:fs/promises";
import { simulateBattle } from "../js/battle-engine.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const refs = JSON.parse(await fs.readFile(new URL("../data/custom/reference-decks.json", import.meta.url), "utf8"));
const cardMap = new Map(cards.map(card => [Number(card.id), card]));
const decks = refs.decks ?? [];

function deckList(reference) {
  return reference.cards.map(card => [Number(card.cardId), Number(card.qty ?? 1)]);
}

function pct(value) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

console.log("=== Multi-Enhance audit (reference decks) ===");
for (const reference of decks) {
  const names = [];
  for (const [id] of deckList(reference)) {
    const card = cardMap.get(id);
    if (!card) continue;
    const thresholds = [...String(card.text ?? "").matchAll(/Enhance\s*\(?\s*(\d+)\s*\)?\s*:/gi)].map(match => Number(match[1]));
    if (thresholds.length > 1) names.push(`${card.name} [${thresholds.join(", ")}]`);
  }
  console.log(`${reference.name}: ${names.length ? names.join(" | ") : "none"}`);
}

console.log("\n=== Side compensation audit · 100 mirror games/deck ===");
console.log("Deck | Second Extra PP avg | 0 uses | 1 use | 2 uses | First EP | Second EP | First SEP | Second SEP");
console.log("---|---:|---:|---:|---:|---:|---:|---:|---:");

for (const reference of decks) {
  const deck = deckList(reference);
  let secondGames = 0;
  let secondBonusUses = 0;
  const bonusUseBuckets = [0, 0, 0];
  let firstEp = 0, secondEp = 0, firstSep = 0, secondSep = 0;

  for (let index = 0; index < 100; index += 1) {
    const playerSide = index % 2 === 0 ? "first" : "second";
    const result = simulateBattle({
      playerDeck: deck,
      opponentDeck: deck,
      cardMap,
      playerStrategy: reference.strategy ?? {},
      opponentStrategy: reference.strategy ?? {},
      seed: `side-logic-audit:${reference.id}:${index}`,
      playerSide,
      recordFrames: true
    });
    const stats = result.summary.stats;
    if (playerSide === "first") {
      firstEp += Number(stats.evolutions?.[0] ?? 0);
      firstSep += Number(stats.superEvolutions?.[0] ?? 0);
      secondEp += Number(stats.evolutions?.[1] ?? 0);
      secondSep += Number(stats.superEvolutions?.[1] ?? 0);
    } else {
      secondEp += Number(stats.evolutions?.[0] ?? 0);
      secondSep += Number(stats.superEvolutions?.[0] ?? 0);
      firstEp += Number(stats.evolutions?.[1] ?? 0);
      firstSep += Number(stats.superEvolutions?.[1] ?? 0);
    }

    const last = result.frames.at(-1);
    if (last) {
      const secondIndex = playerSide === "second" ? 0 : 1;
      const uses = Math.max(0, Math.min(2, Number(last.players?.[secondIndex]?.bonusPpUses ?? 0)));
      secondGames += 1;
      secondBonusUses += uses;
      bonusUseBuckets[uses] += 1;
    }
  }

  const gamesPerSide = 50;
  console.log([
    reference.name,
    (secondGames ? secondBonusUses / secondGames : 0).toFixed(2),
    pct(secondGames ? bonusUseBuckets[0] / secondGames * 100 : 0),
    pct(secondGames ? bonusUseBuckets[1] / secondGames * 100 : 0),
    pct(secondGames ? bonusUseBuckets[2] / secondGames * 100 : 0),
    (firstEp / gamesPerSide).toFixed(2),
    (secondEp / gamesPerSide).toFixed(2),
    (firstSep / gamesPerSide).toFixed(2),
    (secondSep / gamesPerSide).toFixed(2)
  ].join(" | "));
}
