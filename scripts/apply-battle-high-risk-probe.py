from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
text = ENGINE.read_text(encoding="utf-8")
anchor = "function prepareSimulationCardMap(cardMap) {"
if anchor not in text:
    raise SystemExit("Missing prepareSimulationCardMap anchor")

probe = r'''
// [[battle-high-risk-runtime-probe]]
export function inspectHighRiskCandidateResolution({ cards = [], cardIds = [] } = {}) {
  const rawMap = new Map(cards.map(card => [Number(card.id), card]));
  const map = prepareSimulationCardMap(rawMap);
  const requested = new Set(cardIds.map(Number));
  const selected = [...map.values()].filter(card => !requested.size || requested.has(Number(card.id)));

  const synthetic = (id, name, type = "Follower", cost = 2, attack = 2, defense = 8, traits = []) => ({
    id, name, class: "Neutral", type, cost,
    attack: type === "Follower" ? attack : null,
    defense: type === "Follower" ? defense : null,
    text: type === "Amulet" ? "Last Words: Draw a card." : "",
    keywords: [], traits, relatedCards: []
  });
  const allyA = synthetic(-981001, "Probe Ally Artifact", "Follower", 5, 3, 8, ["Artifact"]);
  const allyB = synthetic(-981002, "Probe Ally Pixie", "Follower", 4, 2, 8, ["Pixie"]);
  const allyC = synthetic(-981003, "Probe Ally", "Follower", 3, 2, 8, []);
  const enemyA = synthetic(-981011, "Probe Enemy A", "Follower", 5, 4, 20, []);
  const enemyB = synthetic(-981012, "Probe Enemy B", "Follower", 4, 3, 20, []);
  const enemyC = synthetic(-981013, "Probe Enemy C", "Follower", 2, 2, 20, []);
  const amuletA = synthetic(-981021, "Probe Amulet A", "Amulet", 1);
  const amuletB = synthetic(-981022, "Probe Amulet B", "Amulet", 2);
  const amuletC = synthetic(-981023, "Probe Amulet C", "Amulet", 4);

  const makePair = seed => {
    const rng = createRng(`high-risk-probe:${seed}`);
    const stats = createStats();
    const player = makePlayer("You", [], { style: "midrange" }, map, rng);
    const opponent = makePlayer("Opponent", [], { style: "midrange" }, map, rng);
    player.isActive = true; opponent.isActive = false;
    player.personalTurn = 20; opponent.personalTurn = 19;
    player.maxPp = player.pp = 10; opponent.maxPp = opponent.pp = 10;
    player.ep = player.sep = opponent.ep = opponent.sep = 2;
    player.shadows = 30; player.rally = 30; player.earthSigils = 30; player.faith = 30;
    player.cardsPlayedThisTurn = 10; player.spellsPlayedThisTurn = 5; player.evolutionsThisMatch = 10;
    player.artifactFollowerNamesEntered = ["analyzing artifact", "ancient artifact", "mystic artifact"];
    player.destroyedFollowers = [
      { card: allyA }, { card: allyB }, { card: allyC },
      { card: map.get(90071110) ?? allyA }, { card: map.get(90072110) ?? allyA }
    ];
    player.destroyedAmulets = [{ card: amuletA }, { card: amuletB }, { card: amuletC }];
    player.hand = [
      instance(player, map.get(90071110) ?? allyA),
      instance(player, map.get(90072110) ?? allyA),
      instance(player, allyA), instance(player, allyB), instance(player, allyC)
    ];
    opponent.hand = [instance(opponent, enemyA), instance(opponent, enemyB), instance(opponent, enemyC)];
    player.deck = [instance(player, allyA), instance(player, allyB), instance(player, allyC), instance(player, amuletA), instance(player, enemyA), instance(player, enemyB)];
    opponent.deck = [instance(opponent, enemyA), instance(opponent, enemyB), instance(opponent, enemyC), instance(opponent, allyA), instance(opponent, allyB), instance(opponent, allyC)];
    return { rng, stats, player, opponent };
  };

  const labels = [
    ["base", "base", null],
    ["evolve", "trigger", "evolve"],
    ["super-evolve", "trigger", "superEvolve"],
    ["last-words", "trigger", "lastWords"],
    ["engage", "section", "engage"],
    ["strike", "trigger", "strike"],
    ["turn-start", "trigger", "turnStart"],
    ["turn-end", "trigger", "turnEnd"]
  ];
  const results = [];

  for (const card of selected) {
    for (const [event, kind, key] of labels) {
      const raw = kind === "base" ? baseText(card.text)
        : kind === "trigger" ? getTriggeredText(card, key)
        : section(card.text, key);
      if (!raw) continue;
      const basePair = makePair(`${card.id}:${event}`);
      const choices = expandModes(raw, basePair.player);
      for (let modeIndex = 0; modeIndex < choices.length; modeIndex += 1) {
        const q = makePair(`${card.id}:${event}:${modeIndex}`);
        const preparedCard = map.get(Number(card.id));
        const inst = instance(q.player, preparedCard);
        let sourceUnit = null;
        if (preparedCard.type === "Follower") {
          sourceUnit = boardFollower(inst);
          q.player.board.push(sourceUnit);
        } else if (preparedCard.type === "Amulet") {
          sourceUnit = boardAmulet(inst);
          q.player.board.push(sourceUnit);
        }
        for (const extraCard of [allyA, allyB, amuletA]) {
          if (q.player.board.length >= 5) break;
          q.player.board.push(extraCard.type === "Amulet" ? boardAmulet(instance(q.player, extraCard)) : boardFollower(instance(q.player, extraCard)));
        }
        q.opponent.board = [enemyA, enemyB, enemyC].map(value => boardFollower(instance(q.opponent, value)));
        const ctx = { card: preparedCard, instance: inst, sourceUnit, player: q.player, opponent: q.opponent, playerIndex: 0, enemyIndex: 1, stats: q.stats, rng: q.rng, cardMap: map };
        const choice = expandModes(raw, q.player)[modeIndex] ?? { text: raw, i: 0 };
        const resolved = resolveText(choice.text, ctx);
        results.push({
          id: Number(preparedCard.id), name: preparedCard.name, className: preparedCard.class,
          event, modeIndex, raw: choice.text, unresolved: Boolean(resolved.unresolved), actions: resolved.actions
        });
      }
    }
  }
  return results;
}

'''
text = text.replace(anchor, probe + anchor, 1)
ENGINE.write_text(text, encoding="utf-8")
print("Materialized Battle Sim high-risk runtime probe.")
