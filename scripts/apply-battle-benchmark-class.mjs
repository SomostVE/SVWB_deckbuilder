import fs from "node:fs";

function patch(path, edits) {
  let src = fs.readFileSync(path, "utf8");
  for (const [before, after, label] of edits) {
    if (src.includes(after)) continue;
    if (!src.includes(before)) throw new Error(`${path}: missing ${label}`);
    src = src.replace(before, after);
  }
  fs.writeFileSync(path, src);
}

patch("js/battle-benchmark-fast.js", [
  [
    'import { loadWorkspace, applyWorkspace } from "./storage.js";',
    'import { loadWorkspace, applyWorkspace } from "./storage.js";\nimport { resolveDeckClass } from "./battle-class-mechanics.js";',
    "class import"
  ],
  [
`  const invalidCompare = compare && (deckSize(compare.deck) !== 40 || deckFingerprint(compare.deck) === deckFingerprint(player.deck));
  const invalid = deckSize(player.deck) !== 40 || invalidCompare || opponents.length === 0;`,
`  let classError = "";
  try {
    resolveDeckClass(player.deck, state.cardMap, player.class);
    if (compare) resolveDeckClass(compare.deck, state.cardMap, compare.class);
    for (const opponent of opponents) resolveDeckClass(resolveReferenceDeck(opponent), state.cardMap, opponent.class);
  } catch (error) {
    classError = error.message;
  }
  const invalidCompare = compare && (deckSize(compare.deck) !== 40 || deckFingerprint(compare.deck) === deckFingerprint(player.deck));
  const invalid = deckSize(player.deck) !== 40 || invalidCompare || opponents.length === 0 || Boolean(classError);`,
    "benchmark class validation"
  ],
  [
`      els.status.dataset.type = "warn";
      els.status.textContent = deckSize(player.deck) !== 40 ? "A 40-card deck is required." : invalidCompare ? "Choose a different comparison deck." : "No valid opponent.";`,
`      els.status.dataset.type = classError ? "error" : "warn";
      els.status.textContent = classError || (deckSize(player.deck) !== 40 ? "A 40-card deck is required." : invalidCompare ? "Choose a different comparison deck." : "No valid opponent.");`,
    "benchmark class error message"
  ],
  [
`  const variants = [{ key: "primary", name: player.name, deck: player.deck, strategy: primaryStrategy }];
  if (compare) variants.push({ key: "compare", name: compare.name, deck: compare.deck, strategy: compareStrategy });`,
`  const variants = [{ key: "primary", name: player.name, class: player.class, deck: player.deck, strategy: primaryStrategy }];
  if (compare) variants.push({ key: "compare", name: compare.name, class: compare.class, deck: compare.deck, strategy: compareStrategy });`,
    "benchmark variants class"
  ],
  [
`          playerDeck: variant.deck,
          playerStrategy: variant.strategy,
          opponentDeck,`,
`          playerDeck: variant.deck,
          playerClass: variant.class,
          playerStrategy: variant.strategy,
          opponentDeck,`,
    "benchmark job player class"
  ],
  [
`      playerDeck: job.playerDeck,
      opponentDeck: job.opponentDeck,
      playerStrategy: job.playerStrategy,`,
`      playerDeck: job.playerDeck,
      opponentDeck: job.opponentDeck,
      playerClass: job.playerClass,
      opponentClass: job.opponentClass,
      playerStrategy: job.playerStrategy,`,
    "worker payload classes"
  ],
  [
`function getDeckByKey(key) {
  if (key === "__current__") return { key, name: "Current deck", deck: mainDeckFrom(state.deck) };
  const variant = state.savedDecks?.[key];
  return { key, name: key || "Saved deck", deck: mainDeckFrom(new Map((variant?.deck ?? []).map(([id, qty]) => [Number(id), Number(qty)]))) };
}`,
`function getDeckByKey(key) {
  if (key === "__current__") return { key, name: "Current deck", class: state.selectedClass, deck: mainDeckFrom(state.deck) };
  const variant = state.savedDecks?.[key];
  return { key, name: key || "Saved deck", class: variant?.class ?? state.selectedClass, deck: mainDeckFrom(new Map((variant?.deck ?? []).map(([id, qty]) => [Number(id), Number(qty)]))) };
}`,
    "benchmark deck class"
  ]
]);

patch("js/battle-benchmark-fast-worker.js", [
  [
`        cardMap,
        playerStrategy: payload.playerStrategy ?? {},
        opponentStrategy: payload.opponentStrategy ?? {},`,
`        cardMap,
        playerStrategy: payload.playerStrategy ?? {},
        opponentStrategy: payload.opponentStrategy ?? {},
        playerClass: payload.playerClass,
        opponentClass: payload.opponentClass,`,
    "worker simulate classes"
  ]
]);

console.log("Benchmark class boundaries materialized");
