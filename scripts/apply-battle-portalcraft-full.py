from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
text = ENGINE.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str):
    global text
    if old not in text:
        raise SystemExit(f"Portalcraft materializer marker missing: {label}")
    text = text.replace(old, new, 1)


replace_once(
'''  ["macmillan, reaper of ceremonies", "Own-turn Departed-entry buff/Rush/Ward and leader damage are modeled"]
]);''',
'''  ["macmillan, reaper of ceremonies", "Own-turn Departed-entry buff/Rush/Ward and leader damage are modeled"],
  // [[battle-portalcraft-full-overrides]]
  ["eudie, maiden reborn", "Countdown 3 hand-size draw/heal Crest is modeled"],
  ["medical-grade assassin", "Once-per-own-turn Puppetry-entry Bane reaction is modeled"],
  ["slaus, revolving wheel of fortune", "Unique random start abilities, opponent Countdown Crest and self-banish are modeled"],
  ["unfeeling eld axe", "Base-5-entry temporary in-hand cost reduction and spell resolution are modeled"],
  ["brusque barkeep", "Artifact-entry leader healing reaction is modeled"],
  ["myuu, hot on his heels", "Artifact-entry damage, Artifact-history Storm and evolution summon are modeled"],
  ["flowering artisan", "Spell-play board damage reaction is modeled"],
  ["camiscilla, unfeeling heart", "Base-5-entry automatic evolution and Super-Evolve leader damage are modeled"]
]);''',
"full overrides"
)

replace_once(
'''  /Whenever you play a spell, if this follower is evolved, summon an Imari's Little Buddies\\.?/gi,
  /Whenever an allied follower with Ward is destroyed, give this follower \\+1\\/\\+1\\.?/gi,''',
'''  /Whenever you play a spell, if this follower is evolved, summon an Imari's Little Buddies\\.?/gi,
  // [[battle-portalcraft-reactive-clauses]]
  /Once on each of your turns, when an allied Puppetry follower enters the field, give it Bane\\.?/gi,
  /Activates in hand\\. Whenever an allied follower with a base cost of 5 or more enters the field, reduce the cost of this card by 1 until the end of the turn\\.?/gi,
  /Whenever an allied Artifact follower enters the field, restore 1 defense to your leader\\.?/gi,
  /Whenever an allied Artifact follower enters the field, deal 3 damage to a random enemy follower\\.?/gi,
  /Whenever you play a spell, deal 3 damage to all enemy followers\\.?/gi,
  /Whenever another allied follower with a base cost of 5 or more enters the field, evolve it\\.?/gi,
  /Whenever an allied follower with Ward is destroyed, give this follower \\+1\\/\\+1\\.?/gi,''',
"reactive clauses"
)

replace_once(
'''  // [[battle-runecraft-resolve-text]]
  const runecraft = resolveRunecraftCardText(text, ctx);''',
'''  // [[battle-portalcraft-resolve-text]]
  const portalcraft = resolvePortalcraftCardText(text, ctx);
  text = portalcraft.text;
  actions.push(...portalcraft.actions);

  // [[battle-runecraft-resolve-text]]
  const runecraft = resolveRunecraftCardText(text, ctx);''',
"resolveText hook"
)

replace_once(
'''  // [[battle-abysscraft-entry-events]]
  actions.push(...applyAbysscraftEntryEvents(ctx, unit));

  if ((unit.card?.traits ?? []).some(trait => norm(trait) === "marine")''',
'''  // [[battle-abysscraft-entry-events]]
  actions.push(...applyAbysscraftEntryEvents(ctx, unit));
  // [[battle-portalcraft-entry-events]]
  actions.push(...applyPortalcraftEntryEvents(ctx, unit));

  if ((unit.card?.traits ?? []).some(trait => norm(trait) === "marine")''',
"entry hook"
)

replace_once(
'''    // [[battle-swordcraft-spell-play-trigger]]
    actions.push(...applySwordcraftSpellPlayedTriggers(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap));
  }''',
'''    // [[battle-swordcraft-spell-play-trigger]]
    actions.push(...applySwordcraftSpellPlayedTriggers(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap));
    // [[battle-portalcraft-spell-play-trigger]]
    actions.push(...applyPortalcraftSpellPlayedTriggers({ card, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap }));
  }''',
"spell hook"
)

replace_once(
'''  applySwordcraftTurnStartLocks(player);

  tickCrests(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);''',
'''  applySwordcraftTurnStartLocks(player);

  // Slaus's opponent Crest has a start-of-turn ability at the same timing as
  // Countdown. Resolve the ability before ticking so all three Countdown turns
  // receive one of the three unique effects, including the expiring turn.
  actions.push(...applyPortalcraftPreTickCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  tickCrests(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);''',
"pre-tick crest hook"
)

replace_once(
'''  // [[battle-abysscraft-crest-turn-end]]
  actions.push(...applyAbysscraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  for (const crest of player.crests ?? []) {''',
'''  // [[battle-abysscraft-crest-turn-end]]
  actions.push(...applyAbysscraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  // [[battle-portalcraft-crest-turn-end]]
  actions.push(...applyPortalcraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  for (const crest of player.crests ?? []) {''',
"crest turn end hook"
)

replace_once(
'''  actions.push(...applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  // [[battle-dragoncraft-temp-cost-expiry]]
  restoreDragoncraftTemporaryCosts(player);''',
'''  actions.push(...applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  // [[battle-portalcraft-temp-cost-expiry]]
  restorePortalcraftTemporaryCosts(player);
  // [[battle-dragoncraft-temp-cost-expiry]]
  restoreDragoncraftTemporaryCosts(player);''',
"temp cost expiry"
)

replace_once(
'''  if (normalized === "corruption") return 4;''',
'''  if (normalized === "corruption") return 4;
  // [[battle-portalcraft-crest-countdowns]]
  if (normalized === "eudie, maiden reborn") return 3;
  if (normalized === "slaus, revolving wheel of fortune") return 3;''',
"crest countdowns"
)

portal_rules = r'''

// [[battle-portalcraft-full-rules]]
function isPortalArtifactFollower(unit) {
  return unit?.type === "Follower" && hasTrait(unit.card, "Artifact");
}

function isPortalPuppetryFollower(unit) {
  return unit?.type === "Follower" && hasTrait(unit.card, "Puppetry");
}

function isBaseCostAtLeast(unit, amount) {
  return unit?.type === "Follower" && (Number(unit.card?.cost) || 0) >= Number(amount);
}

function applyPortalTemporaryCost(item, delta) {
  if (!item) return;
  item.costDelta = (Number(item.costDelta) || 0) + Number(delta || 0);
  item.portalcraftTempCostDelta = (Number(item.portalcraftTempCostDelta) || 0) + Number(delta || 0);
}

function applyPortalTemporaryCostToHand(player, delta) {
  for (const item of player.hand ?? []) applyPortalTemporaryCost(item, delta);
}

function restorePortalcraftTemporaryCosts(player) {
  for (const item of player.hand ?? []) {
    const delta = Number(item.portalcraftTempCostDelta) || 0;
    if (!delta) continue;
    item.costDelta = (Number(item.costDelta) || 0) - delta;
    delete item.portalcraftTempCostDelta;
  }
}

function applyPortalcraftEntryEvents(ctx, unit) {
  const actions = [];
  if (!unit || unit.type !== "Follower") return actions;

  if (isPortalPuppetryFollower(unit) && ctx.player.isActive) {
    for (const source of ctx.player.board.filter(source => source.type === "Follower" && norm(source.name) === "medical-grade assassin")) {
      if (source.__medicalPuppetryTriggerTurn === ctx.player.personalTurn) continue;
      source.__medicalPuppetryTriggerTurn = ctx.player.personalTurn;
      giveKeyword(unit, "Bane");
      actions.push(`Medical-Grade Assassin: ${unit.name} gains Bane`);
    }
  }

  if (isPortalArtifactFollower(unit)) {
    for (const source of ctx.player.board.filter(source => source.type === "Follower")) {
      const sourceName = norm(source.name);
      if (sourceName === "brusque barkeep") {
        const healed = healPlayer(ctx.player, 1, ctx.stats, ctx.playerIndex);
        actions.push(`Brusque Barkeep: restore ${healed} leader defense`);
        if (healed) actions.push(...afterLeaderHeal(ctx.player, healed, ctx.stats, ctx.playerIndex));
      }
      if (sourceName === "myuu, hot on his heels") {
        const target = chooseRandomTarget(ctx.opponent.board, ctx.rng);
        if (target) {
          damageUnit(target, 3, ctx.opponent, ctx.player, ctx, actions);
          actions.push(`Myuu: 3 damage to ${target.name}`);
        }
      }
    }
  }

  if (isBaseCostAtLeast(unit, 5)) {
    for (const item of ctx.player.hand ?? []) {
      if (norm(item.card?.name) !== "unfeeling eld axe") continue;
      applyPortalTemporaryCost(item, -1);
      actions.push(`Unfeeling Eld Axe: cost -1 (${costOf(item)})`);
    }

    for (const source of ctx.player.board.filter(source => source.type === "Follower" && source !== unit && norm(source.name) === "camiscilla, unfeeling heart")) {
      if (unit.evolved || unit.superEvolved) break;
      evolveUnitByAbility(ctx, unit, actions);
      actions.push(`Camiscilla: evolve ${unit.name}`);
    }
  }

  return uniq(actions);
}

function applyPortalcraftSpellPlayedTriggers(ctx) {
  const actions = [];
  for (const source of ctx.player.board.filter(unit => unit.type === "Follower" && norm(unit.name) === "flowering artisan")) {
    const targets = [...ctx.opponent.board].filter(unit => unit.type === "Follower");
    for (const target of targets) damageUnit(target, 3, ctx.opponent, ctx.player, ctx, actions);
    actions.push(`Flowering Artisan: 3 damage to ${targets.length} enemy follower${targets.length === 1 ? "" : "s"}`);
  }
  return uniq(actions);
}

function chooseUnusedPortalMode(container, key, rng) {
  const used = new Set((container?.[key] ?? []).map(Number));
  const remaining = [1, 2, 3].filter(value => !used.has(value));
  if (!remaining.length) return null;
  const mode = remaining[Math.floor(rng() * remaining.length)];
  container[key] = [...used, mode];
  return mode;
}

function applyPortalcraftSlausMode(owner, opponent, ownerIndex, enemyIndex, stats, rng, map, mode, positive, actions) {
  if (mode === 1) {
    const delta = positive ? -1 : 1;
    applyPortalTemporaryCostToHand(owner, delta);
    actions.push(`Slaus: hand costs ${delta > 0 ? "+1" : "-1"} until turn end`);
    return;
  }
  if (mode === 2) {
    const delta = positive ? 2 : -2;
    for (const unit of owner.board.filter(unit => unit.type === "Follower")) {
      unit.attack = Math.max(0, (Number(unit.attack) || 0) + delta);
      unit.defense += delta;
      unit.maxDefense += delta;
    }
    actions.push(`Slaus: allied followers ${delta > 0 ? "+2/+2" : "-2/-2"}`);
    return;
  }
  if (mode === 3) {
    if (positive) {
      const healed = healPlayer(owner, 3, stats, ownerIndex);
      actions.push(`Slaus: restore ${healed} leader defense`);
      if (healed) actions.push(...afterLeaderHeal(owner, healed, stats, ownerIndex));
    } else {
      const dealt = damageLeader(owner, 3);
      stats.damageDealt[enemyIndex] += dealt;
      actions.push(`Slaus Crest: ${dealt} damage to leader`);
    }
  }
}

function applyPortalcraftPreTickCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  const crest = (player.crests ?? []).find(item => norm(item.name) === "slaus, revolving wheel of fortune");
  if (!crest || (Number(crest.gainedTurn) || 0) >= player.personalTurn) return actions;
  const mode = chooseUnusedPortalMode(crest, "portalSlausUsedModes", rng);
  if (mode == null) return actions;
  applyPortalcraftSlausMode(player, opponent, playerIndex, enemyIndex, stats, rng, map, mode, false, actions);
  return uniq(actions);
}

function applyPortalcraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  if (!hasCrest(player, "Eudie, Maiden Reborn")) return actions;
  if ((player.hand?.length ?? 0) <= 5) {
    const drawn = drawCards(player, 1, stats, playerIndex);
    actions.push(`Eudie Crest: draw ${drawn}`);
  } else {
    const healed = healPlayer(player, 1, stats, playerIndex);
    actions.push(`Eudie Crest: restore ${healed} leader defense`);
    if (healed) actions.push(...afterLeaderHeal(player, healed, stats, playerIndex));
  }
  return uniq(actions);
}

function resolvePortalcraftCardText(raw, ctx) {
  let text = String(raw ?? "").trim();
  const actions = [];
  const name = norm(ctx.card?.name);

  if (name === "slaus, revolving wheel of fortune" && ctx.sourceUnit) {
    if (/activate a random ability that hasn'?t been activated yet/i.test(text)) {
      const mode = chooseUnusedPortalMode(ctx.sourceUnit, "portalSlausUsedStartModes", ctx.rng);
      if (mode != null) applyPortalcraftSlausMode(ctx.player, ctx.opponent, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, mode, true, actions);
      else actions.push("Slaus: all start-turn abilities already activated");
      text = "";
    }

    const endClause = /if this follower is evolved, give your opponent Crest\s*:\s*Slaus, Revolving Wheel of Fortune and banish this card\.?/i;
    if (endClause.test(text)) {
      if (ctx.sourceUnit.evolved || ctx.sourceUnit.superEvolved) {
        if (gainCrest(ctx.opponent, "Slaus, Revolving Wheel of Fortune", ctx.card)) actions.push("Opponent Crest: Slaus, Revolving Wheel of Fortune");
        banish(ctx.player, ctx.sourceUnit);
        actions.push("Slaus: banish this card");
      }
      text = text.replace(endClause, " ");
    }
  }

  if (name === "unfeeling eld axe") {
    const clause = /evolve a random unevolved allied follower on the field with a base cost of 5 or more\.\s*Deal 6 damage to a random enemy follower\.?/i;
    if (clause.test(text)) {
      const candidates = ctx.player.board.filter(unit => isBaseCostAtLeast(unit, 5) && !unit.evolved && !unit.superEvolved);
      if (candidates.length) {
        const unit = candidates[Math.floor(ctx.rng() * candidates.length)];
        evolveUnitByAbility(ctx, unit, actions);
      }
      const target = chooseRandomTarget(ctx.opponent.board, ctx.rng);
      if (target) damageUnit(target, 6, ctx.opponent, ctx.player, ctx, actions);
      actions.push(`Unfeeling Eld Axe: evolve ${candidates.length ? "base-5+ follower" : "none"} and deal ${target ? 6 : 0} damage`);
      text = text.replace(clause, " ");
    }
  }

  if (name === "myuu, hot on his heels") {
    const clause = /(?:Then,\s*)?if at least 3 differently named allied Artifact followers have entered the field this match, give this follower Storm\.?/i;
    if (clause.test(text)) {
      const count = new Set((ctx.player.artifactFollowerNamesEntered ?? []).map(norm)).size;
      if (count >= 3 && ctx.sourceUnit) giveKeyword(ctx.sourceUnit, "Storm");
      actions.push(`Myuu: Artifact history ${count}${count >= 3 ? " · gain Storm" : ""}`);
      text = text.replace(clause, " ");
    }
  }

  if (name === "camiscilla, unfeeling heart") {
    const clause = /deal X damage to the enemy leader\.\s*X is the number of allied followers on the field with a base cost of 5 or more\.?/i;
    if (clause.test(text)) {
      const x = ctx.player.board.filter(unit => isBaseCostAtLeast(unit, 5)).length;
      const dealt = damageLeader(ctx.opponent, x);
      ctx.stats.damageDealt[ctx.playerIndex] += dealt;
      actions.push(`Camiscilla: ${dealt} damage to enemy leader (X=${x})`);
      text = text.replace(clause, " ");
    }
  }

  return { text: text.replace(/\s+/g, " ").trim(), actions };
}
'''

replace_once(
'''function boardFollower(inst) {''',
portal_rules + '''\n\nfunction boardFollower(inst) {''',
"portal rules block"
)

portal_qa = r'''

// [[battle-portalcraft-full-qa]]
export function inspectPortalcraftFullRules({ cards = [] } = {}) {
  const rawMap = new Map(cards.map(card => [Number(card.id), card]));
  const map = prepareSimulationCardMap(rawMap);
  const byName = name => findByName(map, name);
  const makePair = seed => {
    const rng = createRng(`portalcraft-full-qa:${seed}`);
    const stats = createStats();
    const player = makePlayer("You", [], { style: "puppetry-tempo" }, map, rng);
    const opponent = makePlayer("Opponent", [], {}, map, rng);
    player.isActive = true;
    opponent.isActive = false;
    player.personalTurn = 7;
    opponent.personalTurn = 6;
    player.maxPp = player.pp = 10;
    opponent.maxPp = opponent.pp = 10;
    return { rng, stats, player, opponent };
  };
  const dummy = (name, cost = 1, attack = 1, defense = 5, traits = [], className = "Portalcraft") => ({
    id: -970000 - name.length * 7 - cost, name, class: className, type: "Follower", cost,
    attack, defense, text: "", keywords: [], traits, relatedCards: []
  });
  const ctxOf = q => ({ player: q.player, opponent: q.opponent, playerIndex: 0, enemyIndex: 1, stats: q.stats, rng: q.rng, cardMap: map });

  const eudie = makePair("eudie");
  eudie.player.deck = [instance(eudie.player, dummy("Eudie Draw", 1, 0, 1, [], "Neutral"))];
  eudie.player.hp = 10;
  gainCrest(eudie.player, "Eudie, Maiden Reborn", byName("Eudie, Maiden Reborn"));
  const eudieCrest = eudie.player.crests.find(crest => norm(crest.name) === "eudie, maiden reborn");
  applyPortalcraftCrestTurnEnd(eudie.player, eudie.opponent, 0, 1, eudie.stats, eudie.rng, map);
  const eudieDraw = eudie.player.hand.length;
  while (eudie.player.hand.length < 6) eudie.player.hand.push(instance(eudie.player, dummy(`Eudie Hand ${eudie.player.hand.length}`, 1, 0, 1, [], "Neutral")));
  applyPortalcraftCrestTurnEnd(eudie.player, eudie.opponent, 0, 1, eudie.stats, eudie.rng, map);
  const eudieResult = { countdown: eudieCrest?.countdown ?? null, drawn: eudieDraw, healed: eudie.player.hp - 10 };

  const medical = makePair("medical");
  const assassin = boardFollower(instance(medical.player, byName("Medical-Grade Assassin")));
  const puppetA = boardFollower(instance(medical.player, byName("Enhanced Puppet")));
  medical.player.board = [assassin, puppetA];
  applyEntryEvents(ctxOf(medical), puppetA);
  const firstBane = hasU(puppetA, "Bane");
  const puppetB = boardFollower(instance(medical.player, byName("Puppet")));
  medical.player.board.push(puppetB);
  applyEntryEvents(ctxOf(medical), puppetB);
  const medicalResult = { firstBane, secondSameTurnBane: hasU(puppetB, "Bane") };

  const slaus = makePair("slaus");
  const slausUnit = boardFollower(instance(slaus.player, byName("Slaus, Revolving Wheel of Fortune")));
  slausUnit.evolved = true;
  slaus.player.board = [slausUnit, boardFollower(instance(slaus.player, dummy("Slaus Ally", 2, 2, 4)))];
  for (let i = 0; i < 3; i += 1) {
    resolvePortalcraftCardText("Activate a random ability that hasn't been activated yet from the following. 1. Reduce the cost of all cards in your hand by 1 until the end of the turn. 2. Give all allied followers on the field +2/+2. 3. Restore 3 defense to your leader.", { ...ctxOf(slaus), card: slausUnit.card, sourceUnit: slausUnit });
  }
  resolvePortalcraftCardText("If this follower is evolved, give your opponent Crest: Slaus, Revolving Wheel of Fortune and banish this card.", { ...ctxOf(slaus), card: slausUnit.card, sourceUnit: slausUnit });
  const opponentSlausCrest = slaus.opponent.crests.find(crest => norm(crest.name) === "slaus, revolving wheel of fortune");
  const slausResult = { ownModes: (slausUnit.portalSlausUsedStartModes ?? []).length, banished: !slaus.player.board.includes(slausUnit), opponentCountdown: opponentSlausCrest?.countdown ?? null };

  const curse = makePair("slaus-crest");
  gainCrest(curse.player, "Slaus, Revolving Wheel of Fortune", byName("Slaus, Revolving Wheel of Fortune"));
  const curseCrest = curse.player.crests[0];
  curseCrest.gainedTurn = 0;
  for (let turn = 1; turn <= 3; turn += 1) {
    curse.player.personalTurn = turn;
    applyPortalcraftPreTickCrestTurnStart(curse.player, curse.opponent, 0, 1, curse.stats, curse.rng, map);
    tickCrests(curse.player, curse.opponent, 0, 1, curse.stats, curse.rng, map, []);
  }
  const slausCrestResult = { modes: (curseCrest.portalSlausUsedModes ?? []).length, expired: !curse.player.crests.includes(curseCrest) };

  const axe = makePair("axe");
  const axeInst = instance(axe.player, byName("Unfeeling Eld Axe"));
  axe.player.hand = [axeInst];
  const highA = boardFollower(instance(axe.player, dummy("High A", 5, 2, 5)));
  axe.player.board = [highA];
  applyEntryEvents(ctxOf(axe), highA);
  const afterOne = costOf(axeInst);
  const highB = boardFollower(instance(axe.player, dummy("High B", 6, 2, 5)));
  axe.player.board.push(highB);
  applyEntryEvents(ctxOf(axe), highB);
  const afterTwo = costOf(axeInst);
  restorePortalcraftTemporaryCosts(axe.player);
  const axeResult = { afterOne, afterTwo, restored: costOf(axeInst) };

  const barkeep = makePair("barkeep");
  barkeep.player.hp = 10;
  const barkeepUnit = boardFollower(instance(barkeep.player, byName("Brusque Barkeep")));
  const barkeepArtifact = boardFollower(instance(barkeep.player, byName("Ancient Artifact")));
  barkeep.player.board = [barkeepUnit, barkeepArtifact];
  applyEntryEvents(ctxOf(barkeep), barkeepArtifact);
  const barkeepHeal = barkeep.player.hp - 10;

  const myuu = makePair("myuu");
  const myuuUnit = boardFollower(instance(myuu.player, byName("Myuu, Hot on His Heels")));
  const myuuArtifact = boardFollower(instance(myuu.player, byName("Ancient Artifact")));
  const myuuEnemy = boardFollower(instance(myuu.opponent, dummy("Myuu Enemy", 2, 1, 10, [], "Neutral")));
  myuu.player.board = [myuuUnit, myuuArtifact];
  myuu.opponent.board = [myuuEnemy];
  applyEntryEvents(ctxOf(myuu), myuuArtifact);
  myuu.player.artifactFollowerNamesEntered = ["analyzing artifact", "ancient artifact", "mystic artifact"];
  resolvePortalcraftCardText("Then, if at least 3 differently named allied Artifact followers have entered the field this match, give this follower Storm.", { ...ctxOf(myuu), card: myuuUnit.card, sourceUnit: myuuUnit });
  const myuuResult = { enemyDefense: myuuEnemy.defense, storm: hasU(myuuUnit, "Storm") };

  const artisan = makePair("artisan");
  const artisanUnit = boardFollower(instance(artisan.player, byName("Flowering Artisan")));
  const artisanEnemy = boardFollower(instance(artisan.opponent, dummy("Artisan Enemy", 2, 1, 10, [], "Neutral")));
  artisan.player.board = [artisanUnit];
  artisan.opponent.board = [artisanEnemy];
  applyPortalcraftSpellPlayedTriggers(ctxOf(artisan));
  const artisanDefense = artisanEnemy.defense;

  const cami = makePair("camiscilla");
  const camiUnit = boardFollower(instance(cami.player, byName("Camiscilla, Unfeeling Heart")));
  const camiHigh = boardFollower(instance(cami.player, dummy("Camiscilla High", 5, 2, 5)));
  cami.player.board = [camiUnit, camiHigh];
  applyEntryEvents(ctxOf(cami), camiHigh);
  const camiAutoEvolve = camiHigh.evolved;
  const hpBeforeCami = cami.opponent.hp;
  resolvePortalcraftCardText("Deal X damage to the enemy leader. X is the number of allied followers on the field with a base cost of 5 or more.", { ...ctxOf(cami), card: camiUnit.card, sourceUnit: camiUnit });
  const camiscillaResult = { autoEvolve: camiAutoEvolve, leaderDamage: hpBeforeCami - cami.opponent.hp };

  return { eudieResult, medicalResult, slausResult, slausCrestResult, axeResult, barkeepHeal, myuuResult, artisanDefense, camiscillaResult };
}
'''

replace_once(
'''// [[battle-dragoncraft-full-qa]]
export function inspectDragoncraftFullRules''',
portal_qa + '''\n\n// [[battle-dragoncraft-full-qa]]\nexport function inspectDragoncraftFullRules''',
"portal QA"
)

ENGINE.write_text(text, encoding="utf-8")
print("Portalcraft Battle Sim rules materialized.")
