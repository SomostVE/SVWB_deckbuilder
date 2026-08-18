from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing anchor for {label}")
    return text.replace(old, new, 1)


engine = ENGINE.read_text(encoding="utf-8")

# -----------------------------------------------------------------------------
# Coverage declarations: all 14 previously-Partial Dragoncraft cards receive
# explicit Battle Sim behavior plus a permanent class regression.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  ["congregant of unkilling", "Recursive exact-copy entry chain with defense reduction is modeled"]
]);''',
    '''  ["congregant of unkilling", "Recursive exact-copy entry chain with defense reduction is modeled"],
  // [[battle-dragoncraft-full-overrides]]
  ["devotee of disdain", "Repeated surviving self-damage Dragoncraft-follower draw trigger is modeled"],
  ["jellyfish dancer", "Marine-entry Rush/Bane reaction and Megalorca generation are modeled"],
  ["mari, meg's bestie", "Base-3 Super-Evolve temporary hand cost and end-turn Super-Evolved buff are modeled"],
  ["spirit of wadatsumi", "Marine-entry +1/+1 Crest and Evolve Crest gain are modeled"],
  ["crescent tube ride", "Countdown 4 end-turn random allied +1/+1 Crest is modeled"],
  ["meg, girl next door", "Base-2 follower-entry Ward reaction and Skybound Super-Evolve are modeled"],
  ["ocean rider", "Marine-entry Ward reaction and Overflow Megalorca summons are modeled"],
  ["yube, crestpetal", "Marine attack buff, once-per-turn Megalorca Crest generation and Evolve Crest are modeled"],
  ["drache & aluzard, burning blood", "Match entry scaling, conditional evolution and Countdown Crest Last Words cost-2 regeneration are modeled"],
  ["stormy shamisen shredder", "Marine-entry leader healing reaction is modeled"],
  ["burnite, anathema of flame", "Discard-cost board damage and opponent start/heal-reactive Crest are modeled"],
  ["azurifrit, heir to disdain", "Three sequential all-follower damage events, repeated survivor trigger and Super-Evolve replay are modeled"],
  ["dragon's vale elder", "Vastwing summon, Countdown 2 end-turn summon Crest and Super-Evolve delay are modeled"],
  ["wise guardian dragon", "Persistent -3 hand cost per allied Super-Evolution and Vastwing summon are modeled"]
]);''',
    "Dragoncraft Full overrides",
)

engine = replace_once(
    engine,
    '''  /Whenever an allied follower evolves, restore 1 defense to your leader\\.?/gi
];''',
    '''  /Whenever an allied follower evolves, restore 1 defense to your leader\\.?/gi,
  // [[battle-dragoncraft-reactive-clauses]]
  /During your turn, whenever this follower takes damage but isn'?t destroyed, draw a Dragoncraft follower\\.?/gi,
  /Whenever an allied Marine follower enters the field, give this follower Rush and Bane\\.?/gi,
  /Activates in hand\\. Whenever a 3-base-cost allied follower super-evolves, set the cost of this card to 0 until the end of the turn\\.?/gi,
  /Whenever a 2-base-cost allied follower enters the field, give this follower Ward\\.?/gi,
  /Whenever an allied Marine follower enters the field, give it Ward\\.?/gi,
  /Whenever an allied Marine follower enters the field, restore 2 defense to your leader\\.?/gi,
  /During your turn, whenever this follower takes damage but isn'?t destroyed, deal 1 damage to the enemy leader\\.?/gi,
  /Activates in hand\\. Whenever an allied follower super-evolves, reduce the cost of this card by 3\\.?/gi
];''',
    "Dragon reactive sanitization",
)

# -----------------------------------------------------------------------------
# Match state for Drache entry scaling.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''    evolutionsThisMatch: 0, evolutionActionUsed: false,
    // [[battle-runecraft-state]]''',
    '''    evolutionsThisMatch: 0, evolutionActionUsed: false,
    // [[battle-dragoncraft-state]]
    dracheEntriesThisMatch: 0,
    // [[battle-runecraft-state]]''',
    "Dragoncraft player state",
)

# -----------------------------------------------------------------------------
# Class-specific resolver dispatch.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  // [[battle-forestcraft-resolve-text]]
  const forestcraft = resolveForestcraftCardText(text, ctx);''',
    '''  // [[battle-dragoncraft-resolve-text]]
  const dragoncraft = resolveDragoncraftCardText(text, ctx);
  text = dragoncraft.text;
  actions.push(...dragoncraft.actions);

  // [[battle-forestcraft-resolve-text]]
  const forestcraft = resolveForestcraftCardText(text, ctx);''',
    "Dragon resolver dispatch",
)

# -----------------------------------------------------------------------------
# Crest countdowns.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  if (normalized === "great hart of the glacial realm") return 3;
  // [[battle-runecraft-crest-countdowns]]''',
    '''  if (normalized === "great hart of the glacial realm") return 3;
  // [[battle-dragoncraft-crest-countdowns]]
  if (normalized === "crescent tube ride") return 4;
  if (normalized === "drache & aluzard, burning blood") return 2;
  if (normalized === "dragon's vale elder") return 2;
  // [[battle-runecraft-crest-countdowns]]''',
    "Dragon Crest countdowns",
)

# -----------------------------------------------------------------------------
# Entry events, including match-history tracking and Marine reactions.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  // [[battle-runecraft-entry-events]]
  actions.push(...applyRunecraftEntryEvents(ctx, unit));

  if ((unit.card?.traits ?? []).some(trait => norm(trait) === "marine") && hasCrest(ctx.player, "Neptune, Arbiter of Tides")) {''',
    '''  // [[battle-runecraft-entry-events]]
  actions.push(...applyRunecraftEntryEvents(ctx, unit));
  // [[battle-dragoncraft-entry-events]]
  actions.push(...applyDragoncraftEntryEvents(ctx, unit));

  if ((unit.card?.traits ?? []).some(trait => norm(trait) === "marine") && hasCrest(ctx.player, "Neptune, Arbiter of Tides")) {''',
    "Dragon entry dispatch",
)

# -----------------------------------------------------------------------------
# Surviving damage events: Devotee and Azurifrit are true "whenever" effects,
# unlike the once-per-turn Galmieux effects.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  reactDamage(unit, owner, opponent, ctx, actions);
  if (!owner.isActive || unit.defense <= 0) return;
  const crest = (owner.crests ?? []).find(item => norm(item.name) === "galmieux, ardor manifest");''',
    '''  reactDamage(unit, owner, opponent, ctx, actions);
  if (!owner.isActive || unit.defense <= 0) return;
  // [[battle-dragoncraft-survivor-damage-events]]
  const dragonOwnerIndex = owner === ctx.player ? ctx.playerIndex : ctx.enemyIndex;
  const dragonEnemyIndex = owner === ctx.player ? ctx.enemyIndex : ctx.playerIndex;
  if (norm(unit.name) === "devotee of disdain") {
    const drawn = drawMatchingCard(owner, card => card.type === "Follower" && norm(card.class) === "dragoncraft", ctx.stats, dragonOwnerIndex, ctx.rng);
    actions.push(`Devotee of Disdain: draw ${drawn ? drawn.card.name : "no Dragoncraft follower"}`);
  }
  if (norm(unit.name) === "azurifrit, heir to disdain") {
    const targetLeader = owner === ctx.player ? ctx.opponent : ctx.player;
    const dealt = damageLeader(targetLeader, 1);
    ctx.stats.damageDealt[dragonOwnerIndex] += dealt;
    actions.push(`Azurifrit: ${dealt} damage to enemy leader`);
  }
  const crest = (owner.crests ?? []).find(item => norm(item.name) === "galmieux, ardor manifest");''',
    "Dragon surviving damage events",
)

# -----------------------------------------------------------------------------
# Burnite Flame's Q&A explicitly says restoring 0 still triggers the Crest.
# healPlayer applies that one mutation centrally so every heal attempt is seen.
# Existing afterLeaderHeal continues to own Ash and logging for positive heals.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''function healPlayer(player, amount, stats, index) {
  const healed = Math.max(0, Math.min(Number(amount) || 0, player.maxHp - player.hp));
  player.hp += healed;
  stats.healing[index] += healed;
  return healed;
}''',
    '''function healPlayer(player, amount, stats, index) {
  const healed = Math.max(0, Math.min(Number(amount) || 0, player.maxHp - player.hp));
  player.hp += healed;
  stats.healing[index] += healed;
  // [[battle-dragoncraft-burnite-flame-zero-heal]]
  if (player.isActive) {
    const crest = (player.crests ?? []).find(item => norm(item.name) === "burnite, anathema of flame");
    if (crest && crest.__healTriggerTurn !== player.personalTurn) {
      crest.__healTriggerTurn = player.personalTurn;
      player.hp -= 1;
      player.__burniteFlameHealActionTurn = player.personalTurn;
    }
  }
  return healed;
}''',
    "Burnite Flame heal attempt",
)
engine = replace_once(
    engine,
    '''function afterLeaderHeal(player, healed, stats, playerIndex) {
  if (!healed || !player.isActive) return [];
  const crest = (player.crests ?? []).find(item => norm(item.name) === "burnite, anathema of ash");
  if (!crest || crest.__healTriggerTurn === player.personalTurn) return [];
  crest.__healTriggerTurn = player.personalTurn;
  player.hp -= 1;
  return ["Burnite Crest: 1 damage to your leader after healing"];
}''',
    '''function afterLeaderHeal(player, healed, stats, playerIndex) {
  if (!player.isActive) return [];
  const actions = [];
  if (player.__burniteFlameHealActionTurn === player.personalTurn) {
    player.__burniteFlameHealActionTurn = -1;
    actions.push("Burnite Flame Crest: 1 damage to your leader after healing");
  }
  if (!healed) return actions;
  const crest = (player.crests ?? []).find(item => norm(item.name) === "burnite, anathema of ash");
  if (!crest || crest.__healTriggerTurn === player.personalTurn) return actions;
  crest.__healTriggerTurn = player.personalTurn;
  player.hp -= 1;
  actions.push("Burnite Ash Crest: 1 damage to your leader after healing");
  return actions;
}''',
    "Burnite heal reactions",
)

# -----------------------------------------------------------------------------
# Burnite Flame start-turn Crest.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  if (hasCrest(player, "Burnite, Anathema of Ash")) {
    player.hp -= 2;
    actions.push("Burnite Crest: 2 damage to your leader");
  }
''',
    '''  if (hasCrest(player, "Burnite, Anathema of Ash")) {
    player.hp -= 2;
    actions.push("Burnite Ash Crest: 2 damage to your leader");
  }
  // [[battle-dragoncraft-burnite-flame-start]]
  if (hasCrest(player, "Burnite, Anathema of Flame")) {
    player.hp -= 1;
    actions.push("Burnite Flame Crest: 1 damage to your leader");
  }
''',
    "Burnite Flame turn start",
)

# -----------------------------------------------------------------------------
# Dragon Crest Last Words (Drache regeneration).
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''    // [[battle-runecraft-crest-last-words]]
    if (runecraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;
    if (norm(crest.name) !== "lapis, shining seraph") continue;''',
    '''    // [[battle-runecraft-crest-last-words]]
    if (runecraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;
    // [[battle-dragoncraft-crest-last-words]]
    if (dragoncraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;
    if (norm(crest.name) !== "lapis, shining seraph") continue;''',
    "Dragon Crest Last Words dispatch",
)

# -----------------------------------------------------------------------------
# End-turn Dragon Crest effects and temporary cost restoration.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  actions.push(...applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  // [[battle-runecraft-opponent-turn-end-crest]]''',
    '''  actions.push(...applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  // [[battle-dragoncraft-temp-cost-expiry]]
  restoreDragoncraftTemporaryCosts(player);
  // [[battle-runecraft-opponent-turn-end-crest]]''',
    "Dragon temporary cost expiry",
)
engine = replace_once(
    engine,
    '''  // [[battle-runecraft-crest-turn-end]]
  actions.push(...applyRunecraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  for (const crest of player.crests ?? []) {''',
    '''  // [[battle-runecraft-crest-turn-end]]
  actions.push(...applyRunecraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  // [[battle-dragoncraft-crest-turn-end]]
  actions.push(...applyDragoncraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  for (const crest of player.crests ?? []) {''',
    "Dragon Crest end-turn dispatch",
)

# -----------------------------------------------------------------------------
# Super-Evolution hand reactions: manual and ability-driven paths.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  // [[battle-swordcraft-manual-super-evolve-event]]
  if (superMode) actions.push(...applySwordcraftSuperEvolveHandTriggers(player));
  // [[battle-forestcraft-manual-evolve-event]]''',
    '''  // [[battle-swordcraft-manual-super-evolve-event]]
  if (superMode) actions.push(...applySwordcraftSuperEvolveHandTriggers(player));
  // [[battle-dragoncraft-manual-super-evolve-event]]
  if (superMode) actions.push(...applyDragoncraftSuperEvolveHandTriggers(player, unit));
  // [[battle-forestcraft-manual-evolve-event]]''',
    "manual Dragon super-evolve trigger",
)
engine = replace_once(
    engine,
    '''  // [[battle-swordcraft-ability-super-evolve-event]]
  actions.push(...applySwordcraftSuperEvolveHandTriggers(ctx.player));
  actions.push(`super-evolve ${unit.name}`);''',
    '''  // [[battle-swordcraft-ability-super-evolve-event]]
  actions.push(...applySwordcraftSuperEvolveHandTriggers(ctx.player));
  // [[battle-dragoncraft-ability-super-evolve-event]]
  actions.push(...applyDragoncraftSuperEvolveHandTriggers(ctx.player, unit));
  actions.push(`super-evolve ${unit.name}`);''',
    "ability Dragon super-evolve trigger",
)

# -----------------------------------------------------------------------------
# Yube Crest attack declaration and temporary attack restoration.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''      // [[battle-runecraft-shymm-attack-real]]
      applyRunecraftAttackDeclaration(player, attacker, actions);

      if (leader) {''',
    '''      // [[battle-runecraft-shymm-attack-real]]
      applyRunecraftAttackDeclaration(player, attacker, actions);
      // [[battle-dragoncraft-yube-attack-real]]
      applyDragoncraftAttackDeclaration({ player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, attacker, actions);

      if (leader) {''',
    "Yube attack declaration",
)
engine = replace_once(
    engine,
    '''    if (unit.swordcraftTempAttackBonus) {
      unit.attack = Math.max(0, unit.attack - unit.swordcraftTempAttackBonus);
      unit.swordcraftTempAttackBonus = 0;
    }
  }
}''',
    '''    if (unit.swordcraftTempAttackBonus) {
      unit.attack = Math.max(0, unit.attack - unit.swordcraftTempAttackBonus);
      unit.swordcraftTempAttackBonus = 0;
    }
    if (unit.dragoncraftTempAttackBonus) {
      unit.attack = Math.max(0, unit.attack - unit.dragoncraftTempAttackBonus);
      unit.dragoncraftTempAttackBonus = 0;
    }
  }
}''',
    "Dragon temporary attack restoration",
)

# -----------------------------------------------------------------------------
# Dragoncraft exact mechanics block.
# -----------------------------------------------------------------------------
dragon_rules = r'''
// [[battle-dragoncraft-full-rules]]
function isMarineFollower(unit) {
  return unit?.type === "Follower" && (unit.card?.traits ?? []).some(trait => norm(trait) === "marine");
}

function drawMatchingCard(player, predicate, stats, index, rng) {
  const candidates = player.deck.filter(item => predicate(item.card));
  if (!candidates.length) return null;
  const item = candidates[Math.floor(rng() * candidates.length)];
  player.deck = player.deck.filter(entry => entry.uid !== item.uid);
  stats.draws[index] += 1;
  if (player.hand.length >= 9) {
    toCemetery(player, item, false);
    stats.cardsBurned[index] += 1;
    return item;
  }
  player.hand.push(item);
  return item;
}

function applyDragoncraftEntryEvents(ctx, unit) {
  const actions = [];
  if (!unit || unit.type !== "Follower") return actions;

  if (norm(unit.name) === "drache & aluzard, burning blood") {
    ctx.player.dracheEntriesThisMatch = (Number(ctx.player.dracheEntriesThisMatch) || 0) + 1;
    actions.push(`Drache & Aluzard entries this match: ${ctx.player.dracheEntriesThisMatch}`);
  }

  const marine = isMarineFollower(unit);
  if (marine && hasCrest(ctx.player, "Spirit of Wadatsumi")) {
    unit.attack += 1;
    unit.defense += 1;
    unit.maxDefense += 1;
    actions.push(`Spirit of Wadatsumi Crest: +1/+1 ${unit.name}`);
  }

  for (const source of ctx.player.board.filter(source => source.type === "Follower")) {
    const sourceName = norm(source.name);
    if (marine && sourceName === "jellyfish dancer") {
      giveKeyword(source, "Rush");
      giveKeyword(source, "Bane");
      actions.push(`Jellyfish Dancer: gains Rush and Bane after ${unit.name} enters`);
    }
    if (marine && sourceName === "ocean rider") {
      giveKeyword(unit, "Ward");
      actions.push(`Ocean Rider: ${unit.name} gains Ward`);
    }
    if (marine && sourceName === "stormy shamisen shredder") {
      const healed = healPlayer(ctx.player, 2, ctx.stats, ctx.playerIndex);
      actions.push(`Stormy Shamisen Shredder: restore ${healed} leader defense`);
      actions.push(...afterLeaderHeal(ctx.player, healed, ctx.stats, ctx.playerIndex));
    }
    if (sourceName === "meg, girl next door" && Number(unit.card?.cost) === 2) {
      giveKeyword(source, "Ward");
      actions.push(`Meg, Girl Next Door: gains Ward after base-2 ${unit.name} enters`);
    }
  }
  return uniq(actions);
}

function applyDragoncraftSuperEvolveHandTriggers(player, evolvedUnit) {
  const actions = [];
  for (const item of player.hand ?? []) {
    const name = norm(item.card?.name);
    if (name === "wise guardian dragon") {
      item.costDelta = (Number(item.costDelta) || 0) - 3;
      actions.push(`Wise Guardian Dragon: cost -3 (${costOf(item)})`);
    }
    if (name === "mari, meg's bestie" && Number(evolvedUnit?.card?.cost) === 3) {
      if (item.dragonMariOriginalCostDelta == null) item.dragonMariOriginalCostDelta = Number(item.costDelta) || 0;
      item.costDelta = -(Number(item.card?.cost) || 0);
      actions.push("Mari, Meg's Bestie: cost set to 0 until turn end");
    }
  }
  return actions;
}

function restoreDragoncraftTemporaryCosts(player) {
  for (const item of player.hand ?? []) {
    if (item.dragonMariOriginalCostDelta == null) continue;
    item.costDelta = Number(item.dragonMariOriginalCostDelta) || 0;
    delete item.dragonMariOriginalCostDelta;
  }
}

function applyDragoncraftAttackDeclaration(ctx, attacker, actions) {
  if (!isMarineFollower(attacker)) return;
  const crest = (ctx.player.crests ?? []).find(item => norm(item.name) === "yube, crestpetal");
  if (!crest) return;

  attacker.attack += 1;
  attacker.dragoncraftTempAttackBonus = (Number(attacker.dragoncraftTempAttackBonus) || 0) + 1;
  actions.push(`Yube Crest: ${attacker.name} +1/+0 until turn end`);

  if (crest.__marineAttackTurn === ctx.player.personalTurn) return;
  crest.__marineAttackTurn = ctx.player.personalTurn;
  const token = findByName(ctx.cardMap, "Majestic Megalorca") ?? related(crest.card, ctx.cardMap).find(card => norm(card.name) === "majestic megalorca");
  const added = token ? addHand(ctx.player, token, 1, ctx.playerIndex, ctx.stats) : 0;
  if (added) ctx.stats.cardsGenerated[ctx.playerIndex] += added;
  actions.push(`Yube Crest: add ${added ? "Majestic Megalorca" : "no card"}`);
}

function dragoncraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions) {
  if (norm(crest?.name) !== "drache & aluzard, burning blood") return false;
  const card = crest.card ?? findByName(map, "Drache & Aluzard, Burning Blood");
  if (!card) return true;
  const item = instance(player, card);
  item.costDelta = 2 - (Number(card.cost) || 0);
  if (player.hand.length >= 9) {
    toCemetery(player, item, false);
    stats.cardsBurned[playerIndex] += 1;
    actions.push("Drache & Aluzard Crest Last Words: generated card burned");
    return true;
  }
  player.hand.push(item);
  stats.cardsGenerated[playerIndex] += 1;
  actions.push("Drache & Aluzard Crest Last Words: add cost-2 Drache & Aluzard");
  return true;
}

function applyDragoncraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  const ctx = { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map };
  for (const crest of player.crests ?? []) {
    const name = norm(crest.name);
    if (name === "crescent tube ride") {
      const candidates = player.board.filter(unit => unit.type === "Follower");
      if (candidates.length) {
        const unit = candidates[Math.floor(rng() * candidates.length)];
        unit.attack += 1;
        unit.defense += 1;
        unit.maxDefense += 1;
        actions.push(`Crescent Tube Ride Crest: +1/+1 ${unit.name}`);
      }
    }
    if (name === "dragon's vale elder") {
      const token = findByName(map, "Vastwing Dragon") ?? related(crest.card, map).find(card => norm(card.name) === "vastwing dragon");
      const count = token ? summonWithEvents(player, token, 1, playerIndex, ctx) : 0;
      actions.push(`Dragon's Vale Elder Crest: summon ${count ? "Vastwing Dragon" : "no follower"}`);
    }
  }
  return uniq(actions);
}

function triggerDiscardedCard(ctx, item, actions) {
  if (!item?.card) return;
  const raw = String(item.card.text ?? "");
  const match = raw.match(/When this card is discarded,\s*([\s\S]*?)(?=(?:\n\n|\bFanfare\s*:|\bEvolve\s*:|\bSuper-Evolve\s*:|\bLast Words\s*:|$))/i);
  if (!match?.[1]) return;
  const result = resolveText(match[1].trim(), { ...ctx, card: item.card, instance: item, sourceUnit: null });
  actions.push(...result.actions.map(action => `${item.card.name} discarded: ${action}`));
}

function discardDragoncraftCard(ctx, preferHighCost = false) {
  if (!ctx.player.hand.length) return { item: null, cost: 0, actions: [] };
  const ranked = [...ctx.player.hand].sort((a, b) => {
    const costA = costOf(a), costB = costOf(b);
    return preferHighCost ? costB - costA : costA - costB;
  });
  const item = ranked[0];
  const cost = costOf(item);
  ctx.player.hand = ctx.player.hand.filter(entry => entry.uid !== item.uid);
  toCemetery(ctx.player, item, false);
  const actions = [`discard ${item.card.name}`];
  triggerDiscardedCard(ctx, item, actions);
  return { item, cost, actions };
}

function applyAzurifritTripleDamage(ctx, sourceUnit, actions) {
  for (let repeat = 1; repeat <= 3; repeat += 1) {
    const allied = [...ctx.player.board.filter(unit => unit.type === "Follower")];
    const enemy = [...ctx.opponent.board.filter(unit => unit.type === "Follower")];
    for (const unit of allied) damageUnit(unit, 2, ctx.player, ctx.opponent, ctx, actions);
    for (const unit of enemy) damageUnit(unit, 2, ctx.opponent, ctx.player, ctx, actions);
    actions.push(`Azurifrit: all followers take 2 (${repeat}/3)`);
    actions.push(...cleanup(ctx.player, ctx.opponent, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap));
    actions.push(...cleanup(ctx.opponent, ctx.player, ctx.enemyIndex, ctx.playerIndex, ctx.stats, ctx.rng, ctx.cardMap));
    if (!ctx.player.board.includes(sourceUnit)) break;
  }
}

function resolveDragoncraftCardText(textValue, ctx) {
  let text = String(textValue ?? "");
  const actions = [];
  const name = norm(ctx.card?.name);

  if (name === "mari, meg's bestie") {
    const endBuff = /give a random super-evolved allied follower on the field \+1\/\+1\.?/i;
    if (endBuff.test(text)) {
      const candidates = ctx.player.board.filter(unit => unit.type === "Follower" && unit.superEvolved);
      if (candidates.length) {
        const unit = candidates[Math.floor(ctx.rng() * candidates.length)];
        unit.attack += 1; unit.defense += 1; unit.maxDefense += 1;
        actions.push(`Mari: +1/+1 ${unit.name}`);
      }
      text = text.replace(endBuff, " ");
    }
  }

  if (name === "drache & aluzard, burning blood") {
    const fanfare = /Give this follower \+X\/\+X\.\s*If X is at least 2, evolve this follower\.\s*X is the number of other allied copies of Drache & Aluzard, Burning Blood that have entered the field this match\.?/i;
    if (fanfare.test(text) && ctx.sourceUnit) {
      const x = Math.max(0, (Number(ctx.player.dracheEntriesThisMatch) || 0) - 1);
      ctx.sourceUnit.attack += x;
      ctx.sourceUnit.defense += x;
      ctx.sourceUnit.maxDefense += x;
      actions.push(`Drache & Aluzard: +${x}/+${x}`);
      if (x >= 2) evolveUnitByAbility(ctx, ctx.sourceUnit, actions);
      text = text.replace(fanfare, " ");
    }
  }

  if (name === "burnite, anathema of flame") {
    const fanfare = /Select a card in your hand and discard it\.\s*Deal X damage to all enemy followers\.\s*X is the cost of the selected card\.?/i;
    if (fanfare.test(text)) {
      const discarded = discardDragoncraftCard(ctx, true);
      actions.push(...discarded.actions);
      const x = discarded.cost;
      for (const unit of [...ctx.opponent.board.filter(unit => unit.type === "Follower")]) damageUnit(unit, x, ctx.opponent, ctx.player, ctx, actions);
      actions.push(`Burnite, Anathema of Flame: ${x} damage to all enemy followers`);
      text = text.replace(fanfare, " ");
    }
  }

  if (name === "azurifrit, heir to disdain") {
    const triple = /Do this 3 times:\s*["“]Deal 2 damage to all followers\.["”]/i;
    if (triple.test(text) && ctx.sourceUnit) {
      applyAzurifritTripleDamage(ctx, ctx.sourceUnit, actions);
      text = text.replace(triple, " ");
    }
    const restore = /Fully restore the defense of this follower\.?/i;
    if (restore.test(text) && ctx.sourceUnit) {
      ctx.sourceUnit.defense = ctx.sourceUnit.maxDefense;
      actions.push(`Azurifrit: fully restore defense to ${ctx.sourceUnit.defense}`);
      text = text.replace(restore, " ");
    }
  }

  if (name === "dragon's vale elder") {
    const delay = /Delay the count of your Crest:\s*Dragon's Vale Elder by 2\.?/i;
    if (delay.test(text)) {
      const crest = (ctx.player.crests ?? []).find(item => norm(item.name) === "dragon's vale elder");
      if (crest && Number.isFinite(crest.countdown)) {
        crest.countdown += 2;
        actions.push(`Dragon's Vale Elder Crest: countdown +2 (${crest.countdown})`);
      }
      text = text.replace(delay, " ");
    }
  }

  return { text: text.replace(/\s+/g, " ").trim(), actions: uniq(actions) };
}

'''
engine = replace_once(
    engine,
    '// [[battle-forestcraft-full-rules]]\n',
    dragon_rules + '// [[battle-forestcraft-full-rules]]\n',
    "Dragoncraft exact rules block",
)

# -----------------------------------------------------------------------------
# Permanent QA hook: exercises all 14 formerly-Partial Dragoncraft cards and
# especially multi-event / base-cost / Crest timing edge cases.
# -----------------------------------------------------------------------------
qa = r'''
// [[battle-dragoncraft-full-qa]]
export function inspectDragoncraftFullRules({ cards = [] } = {}) {
  const rawMap = new Map(cards.map(card => [Number(card.id), card]));
  const map = prepareSimulationCardMap(rawMap);
  const byName = name => findByName(map, name);
  const makePair = seed => {
    const rng = createRng(`dragoncraft-full-qa:${seed}`);
    const stats = createStats();
    const player = makePlayer("You", [], { style: "ramp-midrange" }, map, rng);
    const opponent = makePlayer("Opponent", [], {}, map, rng);
    player.isActive = true;
    opponent.isActive = false;
    player.personalTurn = 7;
    opponent.personalTurn = 6;
    player.maxPp = player.pp = 10;
    opponent.maxPp = opponent.pp = 10;
    return { rng, stats, player, opponent };
  };
  const dummy = (name, cost = 1, attack = 1, defense = 5, traits = [], className = "Dragoncraft") => ({
    id: -930000 - name.length * 7 - cost, name, class: className, type: "Follower", cost,
    attack, defense, text: "", keywords: [], traits, relatedCards: []
  });
  const ctxOf = q => ({ player: q.player, opponent: q.opponent, playerIndex: 0, enemyIndex: 1, stats: q.stats, rng: q.rng, cardMap: map });
  const playNamed = (q, name, customText = null) => {
    const card = byName(name);
    const inst = instance(q.player, card);
    q.player.hand.push(inst);
    const mode = { kind: "base", cost: Math.min(q.player.pp, costOf(inst)), text: customText ?? baseText(card.text), modeIndex: 0, scoreBonus: 0 };
    return playCard(inst, mode, q.player, q.opponent, 0, 1, q.stats, q.rng, map);
  };

  const devotee = makePair("devotee");
  const devoteeUnit = boardFollower(instance(devotee.player, byName("Devotee of Disdain")));
  devotee.player.board = [devoteeUnit];
  devotee.player.deck = [instance(devotee.player, dummy("Dragon Draw A")), instance(devotee.player, dummy("Dragon Draw B"))];
  damageUnit(devoteeUnit, 1, devotee.player, devotee.opponent, ctxOf(devotee), []);
  damageUnit(devoteeUnit, 1, devotee.player, devotee.opponent, ctxOf(devotee), []);
  const devoteeDraws = devotee.player.hand.length;

  const jelly = makePair("jelly");
  const jellyUnit = boardFollower(instance(jelly.player, byName("Jellyfish Dancer")));
  const jellyMarine = boardFollower(instance(jelly.player, byName("Majestic Megalorca")));
  jelly.player.board = [jellyUnit, jellyMarine];
  applyEntryEvents(ctxOf(jelly), jellyMarine);
  const jellyfish = { rush: hasU(jellyUnit, "Rush"), bane: hasU(jellyUnit, "Bane") };

  const mari = makePair("mari");
  const mariInst = instance(mari.player, byName("Mari, Meg's Bestie"));
  mari.player.hand = [mariInst];
  const base3 = boardFollower(instance(mari.player, dummy("Base Three", 3, 2, 2)));
  mari.player.board = [base3];
  superEvolveUnitByAbility(ctxOf(mari), base3, []);
  const mariCostDuring = costOf(mariInst);
  const statsBeforeMari = [base3.attack, base3.defense];
  const mariTurnText = getUnitTriggeredText(boardFollower(instance(mari.player, byName("Mari, Meg's Bestie"))), "turnEnd");
  resolveText(mariTurnText, { ...ctxOf(mari), card: byName("Mari, Meg's Bestie"), sourceUnit: null });
  const mariBuff = [base3.attack - statsBeforeMari[0], base3.defense - statsBeforeMari[1]];
  restoreDragoncraftTemporaryCosts(mari.player);
  const mariCostAfter = costOf(mariInst);

  const spirit = makePair("spirit");
  gainCrest(spirit.player, "Spirit of Wadatsumi", byName("Spirit of Wadatsumi"));
  const spiritMarine = boardFollower(instance(spirit.player, byName("Majestic Megalorca")));
  spirit.player.board = [spiritMarine];
  const spiritBefore = [spiritMarine.attack, spiritMarine.defense];
  applyEntryEvents(ctxOf(spirit), spiritMarine);
  const spiritBuff = [spiritMarine.attack - spiritBefore[0], spiritMarine.defense - spiritBefore[1]];

  const crescent = makePair("crescent");
  gainCrest(crescent.player, "Crescent Tube Ride", byName("Crescent Tube Ride"));
  const crescentUnit = boardFollower(instance(crescent.player, dummy("Crescent Target", 2, 2, 3)));
  crescent.player.board = [crescentUnit];
  const crescentCrest = crescent.player.crests[0];
  const crescentBefore = [crescentUnit.attack, crescentUnit.defense];
  applyDragoncraftCrestTurnEnd(crescent.player, crescent.opponent, 0, 1, crescent.stats, crescent.rng, map);
  const crescentResult = { countdown: crescentCrest.countdown, buff: [crescentUnit.attack - crescentBefore[0], crescentUnit.defense - crescentBefore[1]] };

  const meg = makePair("meg");
  const megUnit = boardFollower(instance(meg.player, byName("Meg, Girl Next Door")));
  meg.player.board = [megUnit];
  const base2 = boardFollower(instance(meg.player, dummy("Base Two", 2)));
  meg.player.board.push(base2);
  applyEntryEvents(ctxOf(meg), base2);
  const megWardAfterBase2 = hasU(megUnit, "Ward");
  megUnit.keywords = megUnit.keywords.filter(keyword => keyword !== "Ward");
  const generatedDrache = instance(meg.player, byName("Drache & Aluzard, Burning Blood"));
  generatedDrache.costDelta = -2;
  const cost2Drache = boardFollower(generatedDrache);
  meg.player.board.push(cost2Drache);
  applyEntryEvents(ctxOf(meg), cost2Drache);
  const megIgnoresChangedCost = !hasU(megUnit, "Ward");

  const rider = makePair("rider");
  const riderUnit = boardFollower(instance(rider.player, byName("Ocean Rider")));
  const riderMarine = boardFollower(instance(rider.player, byName("Majestic Megalorca")));
  rider.player.board = [riderUnit, riderMarine];
  applyEntryEvents(ctxOf(rider), riderMarine);
  const oceanRiderWard = hasU(riderMarine, "Ward");

  const yube = makePair("yube");
  gainCrest(yube.player, "Yube, Crestpetal", byName("Yube, Crestpetal"));
  const yubeMarine = boardFollower(instance(yube.player, byName("Majestic Megalorca")));
  yube.player.board = [yubeMarine];
  const yubeBaseAttack = yubeMarine.attack;
  const yubeActions = [];
  applyDragoncraftAttackDeclaration(ctxOf(yube), yubeMarine, yubeActions);
  applyDragoncraftAttackDeclaration(ctxOf(yube), yubeMarine, yubeActions);
  const yubeResult = { attackGain: yubeMarine.attack - yubeBaseAttack, generated: yube.player.hand.filter(item => norm(item.card.name) === "majestic megalorca").length };

  const drache = makePair("drache");
  const dracheCard = byName("Drache & Aluzard, Burning Blood");
  const dracheStats = [];
  for (let n = 0; n < 3; n += 1) {
    const unit = boardFollower(instance(drache.player, dracheCard));
    drache.player.board.push(unit);
    applyEntryEvents(ctxOf(drache), unit);
    resolveDragoncraftCardText(baseText(dracheCard.text), { ...ctxOf(drache), card: dracheCard, sourceUnit: unit });
    dracheStats.push({ attack: unit.attack, defense: unit.defense, evolved: unit.evolved });
  }
  gainCrest(drache.player, "Drache & Aluzard, Burning Blood", dracheCard);
  const dracheCrest = drache.player.crests.find(crest => norm(crest.name) === "drache & aluzard, burning blood");
  dracheCrest.countdown = 1; dracheCrest.gainedTurn = 0;
  tickCrests(drache.player, drache.opponent, 0, 1, drache.stats, drache.rng, map, []);
  const dracheGenerated = drache.player.hand.find(item => norm(item.card.name) === "drache & aluzard, burning blood");
  const dracheResult = { stats: dracheStats, generatedCost: dracheGenerated ? costOf(dracheGenerated) : null, generatedBaseCost: dracheGenerated?.card?.cost ?? null };

  const shred = makePair("shredder");
  shred.player.hp = 10;
  const shredder = boardFollower(instance(shred.player, byName("Stormy Shamisen Shredder")));
  const shredMarine = boardFollower(instance(shred.player, byName("Majestic Megalorca")));
  shred.player.board = [shredder, shredMarine];
  applyEntryEvents(ctxOf(shred), shredMarine);
  const shredderHeal = shred.player.hp - 10;

  const flame = makePair("flame");
  const burnite = byName("Burnite, Anathema of Flame");
  const discard = instance(flame.player, dummy("Discard Four", 4));
  flame.player.hand = [discard];
  flame.opponent.board = [boardFollower(instance(flame.opponent, dummy("Flame Target", 2, 1, 8)))];
  resolveDragoncraftCardText(baseText(burnite.text), { ...ctxOf(flame), card: burnite, sourceUnit: boardFollower(instance(flame.player, burnite)) });
  const burniteBoardDamage = 8 - flame.opponent.board[0].defense;
  gainCrest(flame.player, "Burnite, Anathema of Flame", burnite);
  flame.player.hp = flame.player.maxHp;
  const hpBeforeZeroHeal = flame.player.hp;
  healPlayer(flame.player, 0, flame.stats, 0);
  const burniteZeroHealDamage = hpBeforeZeroHeal - flame.player.hp;
  const hpBeforeSecondHeal = flame.player.hp;
  healPlayer(flame.player, 1, flame.stats, 0);
  const burniteOncePerTurn = flame.player.hp - hpBeforeSecondHeal;
  flame.player.personalTurn += 1;
  const hpBeforeStart = flame.player.hp;
  turnStart(flame.player, flame.opponent, 0, 1, flame.stats, flame.rng, map);
  const burniteStartDamage = hpBeforeStart - flame.player.hp;

  const az = makePair("azurifrit");
  const azCard = byName("Azurifrit, Heir to Disdain");
  const azUnit = boardFollower(instance(az.player, azCard));
  az.player.board = [azUnit];
  az.opponent.board = [boardFollower(instance(az.opponent, dummy("Azurifrit Enemy", 2, 1, 10)))];
  const azEnemyHp = az.opponent.hp;
  resolveDragoncraftCardText(baseText(azCard.text), { ...ctxOf(az), card: azCard, sourceUnit: azUnit });
  const azurifrit = { leaderDamage: azEnemyHp - az.opponent.hp, ownDefense: azUnit.defense, enemyDefense: az.opponent.board[0]?.defense ?? 0 };

  const elder = makePair("elder");
  const elderCard = byName("Dragon's Vale Elder");
  gainCrest(elder.player, "Dragon's Vale Elder", elderCard);
  const elderCrest = elder.player.crests[0];
  const elderEndBefore = elder.player.board.length;
  applyDragoncraftCrestTurnEnd(elder.player, elder.opponent, 0, 1, elder.stats, elder.rng, map);
  const elderEndSummons = elder.player.board.length - elderEndBefore;
  resolveDragoncraftCardText("Delay the count of your Crest: Dragon's Vale Elder by 2.", { ...ctxOf(elder), card: elderCard, sourceUnit: null });
  const elderResult = { initialCountdown: 2, afterDelay: elderCrest.countdown, endSummons: elderEndSummons };

  const wise = makePair("wise");
  const wiseInst = instance(wise.player, byName("Wise Guardian Dragon"));
  wise.player.hand = [wiseInst];
  const wiseSuperA = boardFollower(instance(wise.player, dummy("Wise Super A", 4)));
  const wiseSuperB = boardFollower(instance(wise.player, dummy("Wise Super B", 4)));
  wise.player.board = [wiseSuperA, wiseSuperB];
  superEvolveUnitByAbility(ctxOf(wise), wiseSuperA, []);
  superEvolveUnitByAbility(ctxOf(wise), wiseSuperB, []);
  const wiseCost = costOf(wiseInst);

  return {
    devoteeDraws, jellyfish, mariCostDuring, mariCostAfter, mariBuff, spiritBuff, crescentResult,
    megWardAfterBase2, megIgnoresChangedCost, oceanRiderWard, yubeResult, dracheResult, shredderHeal,
    burniteBoardDamage, burniteZeroHealDamage, burniteOncePerTurn, burniteStartDamage, azurifrit,
    elderResult, wiseCost
  };
}

'''
engine = replace_once(
    engine,
    '// [[battle-forestcraft-full-qa]]\n',
    qa + '// [[battle-forestcraft-full-qa]]\n',
    "Dragoncraft QA hook",
)

ENGINE.write_text(engine, encoding="utf-8")
print("Materialized Dragoncraft Battle Sim full-class rules.")
