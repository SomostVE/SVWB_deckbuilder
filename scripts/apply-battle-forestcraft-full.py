from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
RULES = Path("js/battle-rules.js")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing anchor for {label}")
    return text.replace(old, new, 1)


engine = ENGINE.read_text(encoding="utf-8")
rules = RULES.read_text(encoding="utf-8")

# -----------------------------------------------------------------------------
# Coverage declarations. These are materialized only together with behavior
# implementations and a permanent class regression.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '  ["yurius, levin authority", "Enemy-entry attack lock, leader damage/heal and enemy Knight summons are modeled"]\n]);',
    '''  ["yurius, levin authority", "Enemy-entry attack lock, leader damage/heal and enemy Knight summons are modeled"],
  // [[battle-forestcraft-full-overrides]]
  ["magnified malice", "Combo Crest gain and Countdown Last Words reciprocal generation are modeled"],
  ["minimized anxiety", "Combo Crest gain and Countdown Last Words reciprocal generation are modeled"],
  ["sathanid, eld lance", "Forest Faith payment, evolution accumulation, granted evolution damage and Depths generation are modeled"],
  ["starry sky", "Combo Crest gain and Countdown Last Words leader damage/self-regeneration are modeled"],
  ["*** the fairy blade", "Pixie-entry permanent attack reaction is modeled"],
  ["fairy fencer", "In-hand cost set after allied Super-Evolution and Fairy generation are modeled"],
  ["wild profusion", "Countdown, Fairy generation and Pixie-entry random damage are modeled"],
  ["thestae, anathema of distortion", "Attack-scaled defense reduction, Combo increment and Countdown Crest deck buff are modeled"],
  ["titania, queen of fairies", "Fairy summon, start-turn Fairy Crest and Evolve transformation are modeled"],
  ["battledore woodsmaiden", "Pixie-entry leader damage and Evolve Fanfare replication are modeled"],
  ["floral offering", "Allied-evolution hand discount and draw are modeled"],
  ["merciful attendant", "Allied-evolution leader healing and Springbloom summon are modeled"],
  ["yuel & societte, dancing duo", "Countdown Crest once-per-turn played-follower evolution is modeled"],
  ["aria, lady of the woods", "Fairy summons and persistent Pixie-entry Storm Crest are modeled"],
  ["great hart of the glacial realm", "Attack-scaled end-turn split damage and Countdown Crest Deepwood generation are modeled"],
  ["macrobear", "Exact-copy Fanfare and per-instance damage cap are modeled"],
  ["congregant of unkilling", "Recursive exact-copy entry chain with defense reduction is modeled"]
]);''',
    "Forest Full overrides",
)

engine = replace_once(
    engine,
    '''  /Whenever an enemy follower enters the field, give it "Can'?t attack followers or leaders" until the end of your opponent'?s turn, deal 1 damage to the enemy leader, and restore 1 defense to your leader\\.?/gi
];''',
    '''  /Whenever an enemy follower enters the field, give it "Can'?t attack followers or leaders" until the end of your opponent'?s turn, deal 1 damage to the enemy leader, and restore 1 defense to your leader\\.?/gi,
  // [[battle-forestcraft-reactive-clauses]]
  /Whenever an allied Pixie follower enters the field, give this follower \\+1\\/\\+0\\.?/gi,
  /Whenever an allied Pixie follower enters the field, deal 1 damage to a random enemy follower\\.?/gi,
  /Whenever an allied Pixie follower enters the field, deal 1 damage to the enemy leader\\.?/gi,
  /Activates in hand\\. Whenever an allied follower super-evolves, set the cost of this card to 1\\.?/gi,
  /Activates in hand\\. Whenever an allied follower evolves, reduce the cost of this card by 1\\.?/gi,
  /Whenever an allied follower evolves, restore 1 defense to your leader\\.?/gi
];''',
    "Forest reactive sanitization",
)

# -----------------------------------------------------------------------------
# Player state and Forest Faith initialization.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '    shadows: 0, rally: 0, earthSigils: 0, faith: 0, faithActive: false, faithEnhanceBuffs: 0, crests: [], bonusPpAvailable: false, bonusPpUses: 0,',
    '    shadows: 0, rally: 0, earthSigils: 0, faith: 0, faithActive: false, faithEnhanceBuffs: 0, forestFaithActive: false, forestFaithEvolveDamage: 0, crests: [], bonusPpAvailable: false, bonusPpUses: 0,',
    "Forest Faith state",
)
engine = replace_once(
    engine,
    '''  player.faithActive = player.deck.some(item => has(item.card, "Faith")
    || ["yidmetra, eld sword", "calge-danthla, eld crystals"].includes(norm(item.card?.name)));
  shuffle(player.deck, rng);''',
    '''  player.faithActive = player.deck.some(item => has(item.card, "Faith")
    || ["yidmetra, eld sword", "calge-danthla, eld crystals"].includes(norm(item.card?.name)));
  // Sathanid's Faith uses evolution, not Enhanced-card events. Keep its
  // activation separate from the Runecraft Faith implementation while sharing
  // the public numeric Faith value.
  player.forestFaithActive = player.deck.some(item => norm(item.card?.name) === "sathanid, eld lance");
  shuffle(player.deck, rng);''',
    "Forest Faith initialization",
)

# -----------------------------------------------------------------------------
# Planner target recognition for Forest transformation/debuff effects.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  if (/select an enemy follower(?: on the field)? and banish it/i.test(text)) return { kind: "banish", amount: 0, selectedGrammar: true };
  return null;''',
    '''  if (/select an enemy follower(?: on the field)? and banish it/i.test(text)) return { kind: "banish", amount: 0, selectedGrammar: true };
  // [[battle-forestcraft-target-branches]]
  if (/select an enemy follower(?: on the field)? and transform it into/i.test(text)) return { kind: "transform", amount: 0, selectedGrammar: true };
  if (/select an enemy follower(?: on the field)? and give it -0\\/-X/i.test(text)) return { kind: "debuff", amount: 0, selectedGrammar: true };
  return null;''',
    "Forest target specs",
)
engine = replace_once(
    engine,
    '''  if (plan.kind === "return") return 5 + threat + Math.max(0, Number(unit.card?.cost) || 0) * .6 - (fanfare ? 3 : 0);
  if (plan.kind === "damage") {''',
    '''  if (plan.kind === "return") return 5 + threat + Math.max(0, Number(unit.card?.cost) || 0) * .6 - (fanfare ? 3 : 0);
  if (plan.kind === "transform") return 9 + threat + (lastWords ? 7 : 0);
  if (plan.kind === "debuff") return 5 + threat * .7;
  if (plan.kind === "damage") {''',
    "Forest target branch value",
)

# -----------------------------------------------------------------------------
# Evolution event dispatch: manual, ability evolution and ability super-evolve.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  // [[battle-swordcraft-manual-super-evolve-event]]
  if (superMode) actions.push(...applySwordcraftSuperEvolveHandTriggers(player));
  const evolveText = getUnitTriggeredText(unit, "evolve");''',
    '''  // [[battle-swordcraft-manual-super-evolve-event]]
  if (superMode) actions.push(...applySwordcraftSuperEvolveHandTriggers(player));
  // [[battle-forestcraft-manual-evolve-event]]
  actions.push(...applyForestEvolutionTriggers({ player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, unit, superMode));
  const evolveText = getUnitTriggeredText(unit, "evolve");''',
    "manual Forest evolution dispatch",
)
engine = replace_once(
    engine,
    '''  ctx.stats.evolutions[ctx.playerIndex] += 1;
  actions.push(`evolve ${unit.name} by ability`);
  const evolveText = getUnitTriggeredText(unit, "evolve");''',
    '''  ctx.stats.evolutions[ctx.playerIndex] += 1;
  actions.push(`evolve ${unit.name} by ability`);
  // [[battle-forestcraft-ability-evolve-event]]
  actions.push(...applyForestEvolutionTriggers(ctx, unit, false));
  const evolveText = getUnitTriggeredText(unit, "evolve");''',
    "ability Forest evolution dispatch",
)
engine = replace_once(
    engine,
    '''  // [[battle-swordcraft-ability-super-evolve-event]]
  actions.push(...applySwordcraftSuperEvolveHandTriggers(ctx.player));
  actions.push(`super-evolve ${unit.name}`);
  const evolveText = getUnitTriggeredText(unit, "evolve");''',
    '''  // [[battle-swordcraft-ability-super-evolve-event]]
  actions.push(...applySwordcraftSuperEvolveHandTriggers(ctx.player));
  actions.push(`super-evolve ${unit.name}`);
  // [[battle-forestcraft-ability-super-evolve-event]]
  actions.push(...applyForestEvolutionTriggers(ctx, unit, true));
  const evolveText = getUnitTriggeredText(unit, "evolve");''',
    "ability Forest super-evolution dispatch",
)

# -----------------------------------------------------------------------------
# Resolve Forest-specific card text before generic parsing.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  // [[battle-runecraft-resolve-text]]
  const runecraft = resolveRunecraftCardText(text, ctx);''',
    '''  // [[battle-forestcraft-resolve-text]]
  const forestcraft = resolveForestcraftCardText(text, ctx);
  text = forestcraft.text;
  actions.push(...forestcraft.actions);

  // [[battle-runecraft-resolve-text]]
  const runecraft = resolveRunecraftCardText(text, ctx);''',
    "Forest resolveText dispatch",
)

# -----------------------------------------------------------------------------
# Played-follower Yuel Crest trigger after Fanfare resolution.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  // [[battle-runecraft-institute-trigger]]
  applyInstituteChangedCostTrigger(player, opponent, card, playedWithChangedCost, playerIndex, enemyIndex, stats, rng, cardMap, actions);

  if (card.type === "Spell" || mode.kind === "accelerate") {''',
    '''  // [[battle-runecraft-institute-trigger]]
  applyInstituteChangedCostTrigger(player, opponent, card, playedWithChangedCost, playerIndex, enemyIndex, stats, rng, cardMap, actions);

  // [[battle-forestcraft-yuel-play-trigger]]
  if (source?.type === "Follower" && mode.kind !== "accelerate" && mode.kind !== "crystallize") {
    actions.push(...applyForestFollowerPlayedCrest({ card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap }));
  }

  if (card.type === "Spell" || mode.kind === "accelerate") {''',
    "Yuel follower-play Crest trigger",
)

# -----------------------------------------------------------------------------
# Crest countdowns / lifecycle integration.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  if (normalized === "unkei, goldbloom") return 4;
  // [[battle-runecraft-crest-countdowns]]''',
    '''  if (normalized === "unkei, goldbloom") return 4;
  // [[battle-forestcraft-crest-countdowns]]
  if (normalized === "magnified malice") return 1;
  if (normalized === "minimized anxiety") return 1;
  if (normalized === "starry sky") return 1;
  if (normalized === "thestae, anathema of distortion") return 3;
  if (normalized === "yuel & societte, dancing duo") return 4;
  if (normalized === "great hart of the glacial realm") return 3;
  // [[battle-runecraft-crest-countdowns]]''',
    "Forest Crest countdowns",
)
engine = replace_once(
    engine,
    '''  // [[battle-swordcraft-enemy-entry-events]]
  actions.push(...applySwordcraftEnemyEntryEvents(ctx, unit));
  // [[battle-runecraft-entry-events]]''',
    '''  // [[battle-swordcraft-enemy-entry-events]]
  actions.push(...applySwordcraftEnemyEntryEvents(ctx, unit));
  // [[battle-forestcraft-entry-events]]
  actions.push(...applyForestEntryEvents(ctx, unit));
  // [[battle-runecraft-entry-events]]''',
    "Forest entry dispatch",
)
engine = replace_once(
    engine,
    '''  const selfEntry = String(unit.card?.text ?? "").match(/\\bwhen this (?:card|follower) enters the field,\\s*([^.]*)\\.?/i);
  if (selfEntry) {''',
    '''  const selfEntry = String(unit.card?.text ?? "").match(/\\bwhen this (?:card|follower) enters the field,\\s*([^.]*)\\.?/i);
  // Congregant's exact-copy entry is resolved recursively by the Forest entry
  // primitive so each copy can become the source of the next exact copy.
  if (selfEntry && norm(unit.name) !== "congregant of unkilling") {''',
    "Congregant generic self-entry suppression",
)
engine = replace_once(
    engine,
    '''  tickCrests(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);
  // [[battle-runecraft-crest-turn-start]]''',
    '''  tickCrests(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);
  // [[battle-forestcraft-crest-turn-start]]
  actions.push(...applyForestCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  // [[battle-runecraft-crest-turn-start]]''',
    "Forest Crest start lifecycle",
)
engine = replace_once(
    engine,
    '''  for (const crest of expired) {
    // [[battle-swordcraft-crest-last-words]]''',
    '''  for (const crest of expired) {
    // [[battle-forestcraft-crest-last-words]]
    if (forestcraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;
    // [[battle-swordcraft-crest-last-words]]''',
    "Forest Crest Last Words lifecycle",
)
engine = replace_once(
    engine,
    '''function applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  // [[battle-swordcraft-crest-turn-end]]''',
    '''function applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  // [[battle-forestcraft-crest-turn-end]]
  actions.push(...applyForestCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  // [[battle-swordcraft-crest-turn-end]]''',
    "Forest Crest end lifecycle",
)

# -----------------------------------------------------------------------------
# Context methods needed by shared battle-rules entry hooks.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''    healPlayer: (player, amount, index = ctx.playerIndex) => healPlayer(player, amount, ctx.stats, index),
    damageEnemyFollower: (unit, amount, actionBuffer = []) => damageUnit(unit, amount, ctx.opponent, ctx.player, ctx, actionBuffer),
    chooseEnemyFollower: board => choosePlannedTarget(ctx, board),''',
    '''    healPlayer: (player, amount, index = ctx.playerIndex) => healPlayer(player, amount, ctx.stats, index),
    damageEnemyFollower: (unit, amount, actionBuffer = []) => damageUnit(unit, amount, ctx.opponent, ctx.player, ctx, actionBuffer),
    damageEnemyLeader: amount => {
      const dealt = damageLeader(ctx.opponent, amount);
      ctx.stats.damageDealt[ctx.playerIndex] += dealt;
      return dealt;
    },
    chooseRandomEnemyFollower: () => chooseRandomTarget(ctx.opponent.board, ctx.rng),
    chooseEnemyFollower: board => choosePlannedTarget(ctx, board),''',
    "Forest entry context",
)

# -----------------------------------------------------------------------------
# Forest rules implementation. Inserted before Runecraft exact rules so each
# class keeps a clearly separated block.
# -----------------------------------------------------------------------------
forest_rules = r'''
// [[battle-forestcraft-full-rules]]
function isPixieFollower(value) {
  return value?.type === "Follower" && (value.card?.traits ?? []).some(trait => norm(trait) === "pixie");
}

function applyForestSuperEvolveHandTriggers(player) {
  const actions = [];
  for (const item of player.hand ?? []) {
    if (norm(item.card?.name) !== "fairy fencer") continue;
    const base = Math.max(0, Number(item.card?.cost) || 0);
    item.costDelta = 1 - base;
    actions.push("Fairy Fencer: cost set to 1");
  }
  return actions;
}

function applyForestEvolutionTriggers(ctx, unit, superMode = false) {
  const actions = [];
  if (!unit || unit.type !== "Follower") return actions;

  if (ctx.player.forestFaithActive) {
    ctx.player.faith = (Number(ctx.player.faith) || 0) + 1;
    actions.push(`Forest Faith +1 (${ctx.player.faith})`);
    const stacks = Math.max(0, Number(ctx.player.forestFaithEvolveDamage) || 0);
    for (let index = 0; index < stacks; index += 1) {
      const dealt = damageLeader(ctx.opponent, 1);
      ctx.stats.damageDealt[ctx.playerIndex] += dealt;
      actions.push(`Sathanid Faith: ${dealt} damage to enemy leader`);
    }
  }

  for (const item of ctx.player.hand ?? []) {
    if (norm(item.card?.name) !== "floral offering") continue;
    item.costDelta = (Number(item.costDelta) || 0) - 1;
    actions.push("Floral Offering: cost -1");
  }

  for (const source of ctx.player.board.filter(source => source.type === "Follower" && norm(source.name) === "merciful attendant")) {
    const healed = healPlayer(ctx.player, 1, ctx.stats, ctx.playerIndex);
    actions.push(`Merciful Attendant: restore ${healed} leader defense`);
    if (healed) actions.push(...afterLeaderHeal(ctx.player, healed, ctx.stats, ctx.playerIndex));
  }

  if (superMode) actions.push(...applyForestSuperEvolveHandTriggers(ctx.player));
  return uniq(actions);
}

function summonExactFollowerCopy(ctx, source, defenseDelta = 0) {
  if (!source || source.type !== "Follower" || ctx.player.board.length >= 5) return null;
  const inst = instance(ctx.player, source.card);
  const copy = boardFollower(inst);
  copy.attack = Number(source.attack) || 0;
  copy.defense = (Number(source.defense) || 0) + Number(defenseDelta || 0);
  copy.maxDefense = (Number(source.maxDefense) || Number(source.defense) || 0) + Number(defenseDelta || 0);
  copy.keywords = [...(source.keywords ?? [])];
  copy.barrier = Number(source.barrier) || 0;
  copy.ambush = Boolean(source.ambush);
  copy.aura = Boolean(source.aura);
  copy.intimidate = Boolean(source.intimidate);
  copy.permanentAttackLock = Boolean(source.permanentAttackLock);
  copy.baseMaxAttacks = Number(source.baseMaxAttacks) || 1;
  copy.maxAttacks = copy.baseMaxAttacks;
  copy.canAttackLeader = hasU(copy, "Storm") && !copy.permanentAttackLock;
  copy.canAttackFollower = (hasU(copy, "Storm") || hasU(copy, "Rush")) && !copy.permanentAttackLock;
  ctx.player.board.push(copy);
  ctx.player.rally += 1;
  return copy;
}

function applyForestEntryEvents(ctx, unit) {
  const actions = [];
  if (!unit || unit.type !== "Follower") return actions;
  if (norm(unit.name) === "congregant of unkilling" && ctx.player.board.length < 5) {
    const copy = summonExactFollowerCopy(ctx, unit, -1);
    if (copy) {
      actions.push(`Congregant of Unkilling: exact copy ${copy.attack}/${copy.defense}`);
      actions.push(...applyEntryEvents(ctx, copy));
    }
  }
  return uniq(actions);
}

function forestcraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions) {
  const name = norm(crest?.name);
  if (name === "magnified malice" || name === "minimized anxiety") {
    const nextName = name === "magnified malice" ? "Minimized Anxiety" : "Magnified Malice";
    const token = findByName(map, nextName);
    const added = token ? addHand(player, token, 1, playerIndex, stats) : 0;
    if (added) stats.cardsGenerated[playerIndex] += added;
    actions.push(`${crest.name} Crest Last Words: add ${added ? nextName : "no card"}`);
    return true;
  }
  if (name === "starry sky") {
    const dealt = damageLeader(opponent, 1);
    stats.damageDealt[playerIndex] += dealt;
    const token = findByName(map, "Starry Sky") ?? crest.card;
    const added = token ? addHand(player, token, 1, playerIndex, stats) : 0;
    if (added) stats.cardsGenerated[playerIndex] += added;
    actions.push(`Starry Sky Crest Last Words: ${dealt} damage to enemy leader · add ${added ? "Starry Sky" : "no card"}`);
    return true;
  }
  return false;
}

function applyForestCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  if (hasCrest(player, "Titania, Queen of Fairies")) {
    const fairy = findByName(map, "Fairy");
    const added = fairy ? addHand(player, fairy, 1, playerIndex, stats) : 0;
    if (added) stats.cardsGenerated[playerIndex] += added;
    actions.push(`Titania Crest: add ${added ? "Fairy" : "no card"}`);
  }
  return actions;
}

function applyForestCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  const combo = Math.max(0, Number(player.cardsPlayedThisTurn) || 0);
  for (const crest of player.crests ?? []) {
    const name = norm(crest.name);
    if (name === "thestae, anathema of distortion" && combo >= 3) {
      let count = 0;
      for (const item of player.deck) {
        if (item.card?.type !== "Follower") continue;
        item.attackBonus = (Number(item.attackBonus) || 0) + 1;
        item.defenseBonus = (Number(item.defenseBonus) || 0) + 1;
        count += 1;
      }
      actions.push(`Thestae Crest: +1/+1 to ${count} deck follower${count === 1 ? "" : "s"}`);
    }
    if (name === "great hart of the glacial realm" && combo >= 3) {
      const token = findByName(map, "Deepwood Bounty") ?? related(crest.card, map).find(card => norm(card.name) === "deepwood bounty");
      const added = token ? addHand(player, token, 1, playerIndex, stats) : 0;
      if (added) stats.cardsGenerated[playerIndex] += added;
      actions.push(`Great Hart Crest: add ${added ? "Deepwood Bounty" : "no card"}`);
    }
  }
  return uniq(actions);
}

function applyForestFollowerPlayedCrest(ctx) {
  const actions = [];
  const crest = (ctx.player.crests ?? []).find(item => norm(item.name) === "yuel & societte, dancing duo");
  if (!crest || crest.__forestPlayedEvolveTurn === ctx.player.personalTurn || !ctx.sourceUnit || ctx.sourceUnit.evolved || ctx.sourceUnit.superEvolved) return actions;
  crest.__forestPlayedEvolveTurn = ctx.player.personalTurn;
  if (evolveUnitByAbility(ctx, ctx.sourceUnit, actions)) actions.push(`Yuel & Societte Crest: evolve ${ctx.sourceUnit.name}`);
  return uniq(actions);
}

function transformEnemyFollowerInto(ctx, target, card, actions) {
  if (!target || !card) return null;
  const index = ctx.opponent.board.indexOf(target);
  if (index < 0) return null;
  notifyFollowerLeavesField(ctx.opponent, target);
  const replacement = boardFollower(instance(ctx.opponent, card));
  replacement.summonedThisTurn = target.summonedThisTurn;
  replacement.attacksMade = Number(target.attacksMade) || 0;
  replacement.attacked = Boolean(target.attacked);
  if (!replacement.summonedThisTurn) {
    replacement.canAttackLeader = !/can't attack followers or leaders/i.test(String(replacement.card?.text ?? ""));
    replacement.canAttackFollower = !/can't attack followers or leaders/i.test(String(replacement.card?.text ?? ""));
  }
  ctx.opponent.board[index] = replacement;
  actions.push(`${target.name} transforms into ${replacement.name}`);
  return replacement;
}

function resolveForestcraftCardText(textValue, ctx) {
  let text = String(textValue ?? "");
  const actions = [];
  const name = norm(ctx.card?.name);

  if (["magnified malice", "minimized anxiety", "starry sky"].includes(name)) {
    const comboCrest = /Combo\s*\(?\s*(\d+)\s*\)?\s*-\s*Gain Crest\s*:\s*([^.;]+)\.?/i;
    const match = text.match(comboCrest);
    if (match) {
      const need = Number(match[1]) || 0;
      if ((Number(ctx.player.cardsPlayedThisTurn) || 0) >= need) {
        if (gainCrest(ctx.player, match[2].trim(), ctx.card)) actions.push(`Crest: ${match[2].trim()}`);
      } else actions.push(`Combo ${ctx.player.cardsPlayedThisTurn}/${need}`);
      text = text.replace(match[0], " ");
    }
  }

  if (name === "sathanid, eld lance") {
    const fanfare = /Reduce your faith'?s value by 10 to add a Depths of the Eld Lance to your hand and give your faith ["“]Whenever an allied follower evolves, deal 1 damage to the enemy leader\.["”]/i;
    if (fanfare.test(text)) {
      if ((Number(ctx.player.faith) || 0) >= 10) {
        ctx.player.faith -= 10;
        const token = findByName(ctx.cardMap, "Depths of the Eld Lance") ?? related(ctx.card, ctx.cardMap).find(card => norm(card.name) === "depths of the eld lance");
        const added = token ? addHand(ctx.player, token, 1, ctx.playerIndex, ctx.stats) : 0;
        if (added) ctx.stats.cardsGenerated[ctx.playerIndex] += added;
        ctx.player.forestFaithEvolveDamage = (Number(ctx.player.forestFaithEvolveDamage) || 0) + 1;
        actions.push(`Sathanid: Faith -10 · add ${added ? "Depths of the Eld Lance" : "no card"} · evolution damage ×${ctx.player.forestFaithEvolveDamage}`);
      } else actions.push(`Sathanid: Faith ${ctx.player.faith}/10`);
      text = text.replace(fanfare, " ");
    }
  }

  if (name === "depths of the eld lance") {
    const evolve = /Select an unevolved allied follower on the field and evolve it\.?/i;
    if (evolve.test(text)) {
      const target = ctx.player.board.filter(unit => unit.type === "Follower" && !unit.evolved && !unit.superEvolved)
        .sort((a, b) => (Number(b.attack) + Number(b.defense)) - (Number(a.attack) + Number(a.defense)))[0] ?? null;
      if (target) evolveUnitByAbility(ctx, target, actions);
      text = text.replace(evolve, " ");
    }
  }

  if (name === "thestae, anathema of distortion") {
    const fanfare = /Select an enemy follower on the field and give it -0\/-X\.\s*X is this follower'?s attack\.\s*Increase your Combo by 1\.?/i;
    if (fanfare.test(text)) {
      const target = choosePlannedTarget(ctx, ctx.opponent.board);
      const amount = Math.max(0, Number(ctx.sourceUnit?.attack) || 0);
      if (target) {
        target.defense -= amount;
        target.maxDefense -= amount;
        actions.push(`Thestae: -0/-${amount} ${target.name}`);
      }
      ctx.player.cardsPlayedThisTurn += 1;
      actions.push(`Thestae: Combo +1 (${ctx.player.cardsPlayedThisTurn})`);
      text = text.replace(fanfare, " ");
    }
  }

  if (name === "titania, queen of fairies") {
    const transform = /Select an enemy follower on the field and transform it into a Fairy\.?/i;
    if (transform.test(text)) {
      const target = choosePlannedTarget(ctx, ctx.opponent.board);
      const fairy = findByName(ctx.cardMap, "Fairy") ?? related(ctx.card, ctx.cardMap).find(card => norm(card.name) === "fairy");
      if (target && fairy) transformEnemyFollowerInto(ctx, target, fairy, actions);
      text = text.replace(transform, " ");
    }
  }

  if (name === "battledore woodsmaiden") {
    const replicate = /Replicate the effects of this card'?s Fanfare ability\.?/i;
    if (replicate.test(text)) {
      const fairy = findByName(ctx.cardMap, "Fairy") ?? related(ctx.card, ctx.cardMap).find(card => norm(card.name) === "fairy");
      const count = fairy ? summonWithEvents(ctx.player, fairy, 1, ctx.playerIndex, ctx) : 0;
      actions.push(`Battledore Woodsmaiden: replicate Fanfare · summon ${count} Fairy`);
      text = text.replace(replicate, " ");
    }
  }

  if (name === "great hart of the glacial realm") {
    const split = /deal X damage split between all enemy followers\.\s*X is this follower'?s attack\.?/i;
    if (split.test(text)) {
      let left = Math.max(0, Number(ctx.sourceUnit?.attack) || 0);
      const original = left;
      const targets = ctx.opponent.board.filter(unit => unit.type === "Follower");
      while (left > 0 && targets.length) {
        const target = targets[Math.floor(ctx.rng() * targets.length)];
        damageUnit(target, 1, ctx.opponent, ctx.player, ctx, actions);
        left -= 1;
      }
      actions.push(`Great Hart: ${original} split damage`);
      text = text.replace(split, " ");
    }
  }

  if (name === "macrobear") {
    const copyText = /Summon an exact copy of this card\.?/i;
    if (copyText.test(text) && ctx.sourceUnit) {
      const copy = summonExactFollowerCopy(ctx, ctx.sourceUnit, 0);
      if (copy) {
        actions.push(`Macrobear: summon exact copy ${copy.attack}/${copy.defense}`);
        actions.push(...applyEntryEvents(ctx, copy));
      }
      text = text.replace(copyText, " ");
    }
  }

  return { text: text.replace(/\s+/g, " ").trim(), actions: uniq(actions) };
}

'''
engine = replace_once(
    engine,
    '// [[battle-runecraft-exact-rules]]\n',
    forest_rules + '// [[battle-runecraft-exact-rules]]\n',
    "Forest exact rule block",
)

# -----------------------------------------------------------------------------
# Permanent QA hook covering every Forest Partial card plus generated Depths.
# -----------------------------------------------------------------------------
qa = r'''
// [[battle-forestcraft-full-qa]]
export function inspectForestcraftFullRules({ cards = [] } = {}) {
  const rawMap = new Map(cards.map(card => [Number(card.id), card]));
  const map = prepareSimulationCardMap(rawMap);
  const byName = name => findByName(map, name);
  const makePair = seed => {
    const rng = createRng(`forestcraft-full-qa:${seed}`);
    const stats = createStats();
    const player = makePlayer("You", [], { style: "buff-tempo" }, map, rng);
    const opponent = makePlayer("Opponent", [], {}, map, rng);
    player.isActive = true;
    opponent.isActive = false;
    player.personalTurn = 6;
    opponent.personalTurn = 5;
    player.maxPp = player.pp = 10;
    opponent.maxPp = opponent.pp = 10;
    return { rng, stats, player, opponent };
  };
  const dummy = (name, attack = 1, defense = 3, traits = []) => ({
    id: -910000 - name.length, name, class: "Forestcraft", type: "Follower", cost: 0,
    attack, defense, text: "", keywords: [], traits, relatedCards: []
  });
  const playNamed = (q, name, text = null) => {
    const card = byName(name);
    const inst = instance(q.player, card);
    q.player.hand.push(inst);
    const mode = { kind: "base", cost: Math.max(0, Number(card.cost) || 0), text: text ?? baseText(card.text), modeIndex: 0, scoreBonus: 0 };
    return playCard(inst, mode, q.player, q.opponent, 0, 1, q.stats, q.rng, map);
  };

  const mag = makePair("magnified");
  mag.player.cardsPlayedThisTurn = 2;
  mag.opponent.board = [boardFollower(instance(mag.opponent, dummy("Malice Target", 1, 5)))];
  playNamed(mag, "Magnified Malice");
  const magCrest = mag.player.crests.find(crest => norm(crest.name) === "magnified malice");
  if (magCrest) { magCrest.countdown = 1; magCrest.gainedTurn = 0; }
  tickCrests(mag.player, mag.opponent, 0, 1, mag.stats, mag.rng, map, []);
  const magnified = { gained: Boolean(magCrest), minimized: mag.player.hand.filter(item => norm(item.card.name) === "minimized anxiety").length };

  const min = makePair("minimized");
  min.player.hp = 10;
  min.player.cardsPlayedThisTurn = 2;
  playNamed(min, "Minimized Anxiety");
  const minHeal = min.player.hp;
  const minCrest = min.player.crests.find(crest => norm(crest.name) === "minimized anxiety");
  if (minCrest) { minCrest.countdown = 1; minCrest.gainedTurn = 0; }
  tickCrests(min.player, min.opponent, 0, 1, min.stats, min.rng, map, []);
  const minimized = { healedHp: minHeal, magnified: min.player.hand.filter(item => norm(item.card.name) === "magnified malice").length };

  const star = makePair("starry");
  star.player.cardsPlayedThisTurn = 4;
  star.opponent.hp = 20;
  star.opponent.board = [boardFollower(instance(star.opponent, dummy("Starry Target", 1, 5)))];
  playNamed(star, "Starry Sky");
  const starCrest = star.player.crests.find(crest => norm(crest.name) === "starry sky");
  if (starCrest) { starCrest.countdown = 1; starCrest.gainedTurn = 0; }
  tickCrests(star.player, star.opponent, 0, 1, star.stats, star.rng, map, []);
  const starry = { leaderDamage: 20 - star.opponent.hp, regenerated: star.player.hand.filter(item => norm(item.card.name) === "starry sky").length };

  const sat = makePair("sathanid");
  sat.player.forestFaithActive = true;
  sat.player.faith = 10;
  playNamed(sat, "Sathanid, Eld Lance");
  const depths = sat.player.hand.find(item => norm(item.card.name) === "depths of the eld lance");
  const depthTarget = boardFollower(instance(sat.player, dummy("Depths Target", 2, 2)));
  sat.player.board.push(depthTarget);
  const hpBeforeDepths = sat.opponent.hp;
  if (depths) playCard(depths, { kind: "base", cost: 1, text: depths.card.text, modeIndex: 0, scoreBonus: 0 }, sat.player, sat.opponent, 0, 1, sat.stats, sat.rng, map);
  const sathanid = { faith: sat.player.faith, granted: sat.player.forestFaithEvolveDamage, depths: Boolean(depths), evolved: depthTarget.evolved, damage: hpBeforeDepths - sat.opponent.hp };

  const blade = makePair("blade");
  const bladeSource = boardFollower(instance(blade.player, byName("*** the Fairy Blade")));
  const bladeFairy = boardFollower(instance(blade.player, byName("Fairy")));
  blade.player.board = [bladeSource, bladeFairy];
  applyEntryEvents({ player: blade.player, opponent: blade.opponent, playerIndex: 0, enemyIndex: 1, stats: blade.stats, rng: blade.rng, cardMap: map }, bladeFairy);
  const fairyBladeAttack = bladeSource.attack;

  const fencer = makePair("fencer");
  const fencerInst = instance(fencer.player, byName("Fairy Fencer"));
  fencer.player.hand = [fencerInst];
  const fencerDummy = boardFollower(instance(fencer.player, dummy("Super Dummy")));
  fencer.player.board = [fencerDummy];
  superEvolveUnitByAbility({ player: fencer.player, opponent: fencer.opponent, playerIndex: 0, enemyIndex: 1, stats: fencer.stats, rng: fencer.rng, cardMap: map }, fencerDummy, []);
  const fairyFencerCost = costOf(fencerInst);

  const prof = makePair("profusion");
  const profusion = boardAmulet(instance(prof.player, byName("Wild Profusion")));
  const profFairy = boardFollower(instance(prof.player, byName("Fairy")));
  const profEnemy = boardFollower(instance(prof.opponent, dummy("Profusion Enemy", 1, 4)));
  prof.player.board = [profusion, profFairy]; prof.opponent.board = [profEnemy];
  applyEntryEvents({ player: prof.player, opponent: prof.opponent, playerIndex: 0, enemyIndex: 1, stats: prof.stats, rng: prof.rng, cardMap: map }, profFairy);
  const wildProfusionDamage = 4 - profEnemy.defense;

  const th = makePair("thestae");
  const thEnemy = boardFollower(instance(th.opponent, dummy("Thestae Enemy", 2, 8)));
  th.opponent.board = [thEnemy];
  playNamed(th, "Thestae, Anathema of Distortion");
  const thUnit = th.player.board.find(unit => norm(unit.name) === "thestae, anathema of distortion");
  const thestaeFanfare = { defense: thEnemy.defense, combo: th.player.cardsPlayedThisTurn };
  if (thUnit) evolveUnitByAbility({ player: th.player, opponent: th.opponent, playerIndex: 0, enemyIndex: 1, stats: th.stats, rng: th.rng, cardMap: map }, thUnit, []);
  th.player.cardsPlayedThisTurn = 3;
  const deckBuffTarget = instance(th.player, dummy("Deck Buff Target", 1, 1));
  th.player.deck = [deckBuffTarget];
  applyForestCrestTurnEnd(th.player, th.opponent, 0, 1, th.stats, th.rng, map);
  const thestaeCrest = { attackBonus: deckBuffTarget.attackBonus, defenseBonus: deckBuffTarget.defenseBonus };

  const tit = makePair("titania");
  gainCrest(tit.player, "Titania, Queen of Fairies", byName("Titania, Queen of Fairies"));
  applyForestCrestTurnStart(tit.player, tit.opponent, 0, 1, tit.stats, tit.rng, map);
  const titaniaStartFairy = tit.player.hand.filter(item => norm(item.card.name) === "fairy").length;
  const titania = boardFollower(instance(tit.player, byName("Titania, Queen of Fairies")));
  const titEnemy = boardFollower(instance(tit.opponent, dummy("Titania Enemy", 7, 7)));
  tit.player.board = [titania]; tit.opponent.board = [titEnemy];
  evolveUnitByAbility({ player: tit.player, opponent: tit.opponent, playerIndex: 0, enemyIndex: 1, stats: tit.stats, rng: tit.rng, cardMap: map }, titania, []);
  const titaniaTransform = tit.opponent.board[0]?.name ?? null;

  const bat = makePair("battledore");
  const woodsmaiden = boardFollower(instance(bat.player, byName("Battledore Woodsmaiden")));
  const batFairy = boardFollower(instance(bat.player, byName("Fairy")));
  bat.player.board = [woodsmaiden, batFairy];
  const batHp = bat.opponent.hp;
  applyEntryEvents({ player: bat.player, opponent: bat.opponent, playerIndex: 0, enemyIndex: 1, stats: bat.stats, rng: bat.rng, cardMap: map }, batFairy);
  const battledoreLeaderDamage = batHp - bat.opponent.hp;
  const boardBeforeEvolve = bat.player.board.length;
  evolveUnitByAbility({ player: bat.player, opponent: bat.opponent, playerIndex: 0, enemyIndex: 1, stats: bat.stats, rng: bat.rng, cardMap: map }, woodsmaiden, []);
  const battledoreEvolveSummons = bat.player.board.length - boardBeforeEvolve;

  const floral = makePair("floral");
  const floralInst = instance(floral.player, byName("Floral Offering"));
  floral.player.hand = [floralInst];
  const floralUnit = boardFollower(instance(floral.player, dummy("Floral Evolve")));
  floral.player.board = [floralUnit];
  evolveUnitByAbility({ player: floral.player, opponent: floral.opponent, playerIndex: 0, enemyIndex: 1, stats: floral.stats, rng: floral.rng, cardMap: map }, floralUnit, []);
  const floralCost = costOf(floralInst);

  const mercy = makePair("merciful");
  mercy.player.hp = 10;
  const attendant = boardFollower(instance(mercy.player, byName("Merciful Attendant")));
  const mercyUnit = boardFollower(instance(mercy.player, dummy("Mercy Evolve")));
  mercy.player.board = [attendant, mercyUnit];
  evolveUnitByAbility({ player: mercy.player, opponent: mercy.opponent, playerIndex: 0, enemyIndex: 1, stats: mercy.stats, rng: mercy.rng, cardMap: map }, mercyUnit, []);
  const mercifulHeal = mercy.player.hp - 10;

  const yuel = makePair("yuel");
  gainCrest(yuel.player, "Yuel & Societte, Dancing Duo", byName("Yuel & Societte, Dancing Duo"));
  const y1 = instance(yuel.player, dummy("Yuel First"));
  const y2 = instance(yuel.player, dummy("Yuel Second"));
  yuel.player.hand = [y1, y2];
  playCard(y1, { kind: "base", cost: 0, text: "", modeIndex: 0, scoreBonus: 0 }, yuel.player, yuel.opponent, 0, 1, yuel.stats, yuel.rng, map);
  playCard(y2, { kind: "base", cost: 0, text: "", modeIndex: 0, scoreBonus: 0 }, yuel.player, yuel.opponent, 0, 1, yuel.stats, yuel.rng, map);
  const yuelCrest = { first: yuel.player.board.find(unit => unit.name === "Yuel First")?.evolved ?? false, second: yuel.player.board.find(unit => unit.name === "Yuel Second")?.evolved ?? false };

  const aria = makePair("aria");
  gainCrest(aria.player, "Aria, Lady of the Woods", byName("Aria, Lady of the Woods"));
  const ariaFairy = boardFollower(instance(aria.player, byName("Fairy")));
  aria.player.board = [ariaFairy];
  applyEntryEvents({ player: aria.player, opponent: aria.opponent, playerIndex: 0, enemyIndex: 1, stats: aria.stats, rng: aria.rng, cardMap: map }, ariaFairy);
  const ariaStorm = hasU(ariaFairy, "Storm");
  const ariaUnit = boardFollower(instance(aria.player, byName("Aria, Lady of the Woods")));
  aria.player.board = [ariaUnit];
  evolveUnitByAbility({ player: aria.player, opponent: aria.opponent, playerIndex: 0, enemyIndex: 1, stats: aria.stats, rng: aria.rng, cardMap: map }, ariaUnit, []);
  const ariaFairies = aria.player.board.filter(unit => norm(unit.name) === "fairy").length;
  const ariaFairyStorms = aria.player.board.filter(unit => norm(unit.name) === "fairy" && hasU(unit, "Storm")).length;

  const hart = makePair("hart");
  const hartUnit = boardFollower(instance(hart.player, byName("Great Hart of the Glacial Realm")));
  hart.player.board = [hartUnit];
  hart.opponent.board = [boardFollower(instance(hart.opponent, dummy("Hart A", 1, 10))), boardFollower(instance(hart.opponent, dummy("Hart B", 1, 10)))];
  const hartBefore = hart.opponent.board.reduce((sum, unit) => sum + unit.defense, 0);
  resolveForestcraftCardText("Deal X damage split between all enemy followers. X is this follower's attack.", { card: hartUnit.card, sourceUnit: hartUnit, player: hart.player, opponent: hart.opponent, playerIndex: 0, enemyIndex: 1, stats: hart.stats, rng: hart.rng, cardMap: map });
  const greatHartSplit = hartBefore - hart.opponent.board.reduce((sum, unit) => sum + unit.defense, 0);
  gainCrest(hart.player, "Great Hart of the Glacial Realm", hartUnit.card);
  hart.player.cardsPlayedThisTurn = 3;
  applyForestCrestTurnEnd(hart.player, hart.opponent, 0, 1, hart.stats, hart.rng, map);
  const greatHartBounty = hart.player.hand.filter(item => norm(item.card.name) === "deepwood bounty").length;

  const macro = makePair("macrobear");
  playNamed(macro, "Macrobear");
  const macroUnits = macro.player.board.filter(unit => norm(unit.name) === "macrobear");
  const macroTarget = macroUnits[0];
  const macroBefore = macroTarget?.defense ?? 0;
  if (macroTarget) damageUnit(macroTarget, 10, macro.player, macro.opponent, { player: macro.opponent, opponent: macro.player, playerIndex: 1, enemyIndex: 0, stats: macro.stats, rng: macro.rng, cardMap: map }, []);
  const macrobear = { copies: macroUnits.length, damageTaken: macroBefore - (macroTarget?.defense ?? macroBefore) };

  const cong = makePair("congregant");
  playNamed(cong, "Congregant of Unkilling");
  const congregants = cong.player.board.filter(unit => norm(unit.name) === "congregant of unkilling");
  const congregant = { count: congregants.length, defenses: congregants.map(unit => unit.defense) };

  return {
    magnified, minimized, starry, sathanid, fairyBladeAttack, fairyFencerCost,
    wildProfusionDamage, thestaeFanfare, thestaeCrest, titaniaStartFairy, titaniaTransform,
    battledoreLeaderDamage, battledoreEvolveSummons, floralCost, mercifulHeal, yuelCrest,
    ariaStorm, ariaFairies, ariaFairyStorms, greatHartSplit, greatHartBounty, macrobear, congregant
  };
}

'''
engine = replace_once(
    engine,
    '// [[battle-swordcraft-full-qa]]\n',
    qa + '// [[battle-swordcraft-full-qa]]\n',
    "Forest QA hook",
)

# -----------------------------------------------------------------------------
# Centralized entry hooks in battle-rules.js.
# -----------------------------------------------------------------------------
rules = replace_once(
    rules,
    '''    if (name === "wilbert, desolate paladin" && hasKeyword(unit, "Ward")) {
      const before = { attack: Number(unit.attack) || 0, defense: Number(unit.defense) || 0 };
      context.buffUnit(unit, 1, 2);
      actions.push(`Wilbert Crest: +1/+2 ${unit.name}`);
      actions.push(...applyBuffedFollowerEffects(context, unit, before));
    }
  }

  // [[battle-swordcraft-amulet-entry-rules]]''',
    '''    if (name === "wilbert, desolate paladin" && hasKeyword(unit, "Ward")) {
      const before = { attack: Number(unit.attack) || 0, defense: Number(unit.defense) || 0 };
      context.buffUnit(unit, 1, 2);
      actions.push(`Wilbert Crest: +1/+2 ${unit.name}`);
      actions.push(...applyBuffedFollowerEffects(context, unit, before));
    }
    // [[battle-forestcraft-entry-crests]]
    if (name === "aria, lady of the woods" && traits.has("pixie")) {
      if (giveUnitKeyword(unit, "Storm")) actions.push(`Aria Crest: ${unit.name} gains Storm`);
    }
  }

  // [[battle-forestcraft-amulet-entry-rules]]
  if (traits.has("pixie")) {
    for (const source of context.player.board ?? []) {
      if (source.type !== "Amulet" || normalize(source.name) !== "wild profusion") continue;
      const target = context.chooseRandomEnemyFollower?.();
      if (!target) continue;
      const buffer = [];
      context.damageEnemyFollower?.(target, 1, buffer);
      actions.push(`Wild Profusion: 1 damage to ${target.name}`, ...buffer);
    }
  }

  // [[battle-swordcraft-amulet-entry-rules]]''',
    "Forest Crest/amulet entry hooks",
)
rules = replace_once(
    rules,
    '''    const isOfficer = unitTraits.has("officer");
    const isAbysscraft = normalize(unit.card?.class) === "abysscraft";

    if (name === "aryll, moonstruck vampire" && isBat) {''',
    '''    const isOfficer = unitTraits.has("officer");
    const isPixie = unitTraits.has("pixie");
    const isAbysscraft = normalize(unit.card?.class) === "abysscraft";

    // [[battle-forestcraft-allied-entry-rules]]
    if (isPixie && /Whenever an allied Pixie follower enters the field, give this follower \\+1\\/\\+0/i.test(String(source.card?.text ?? ""))) {
      context.buffUnit(source, 1, 0);
      actions.push(`${source.name}: +1/+0 after Pixie entry`);
    }
    if (name === "battledore woodsmaiden" && isPixie) {
      const dealt = context.damageEnemyLeader?.(1) ?? 0;
      actions.push(`Battledore Woodsmaiden: ${dealt} damage to enemy leader`);
    }

    if (name === "aryll, moonstruck vampire" && isBat) {''',
    "Forest follower entry hooks",
)

ENGINE.write_text(engine, encoding="utf-8")
RULES.write_text(rules, encoding="utf-8")
print("Materialized Forestcraft Battle Sim full-class rules.")
