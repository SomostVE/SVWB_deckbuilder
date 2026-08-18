from pathlib import Path

path = Path("js/battle-engine-v5.js")
source = path.read_text(encoding="utf-8")


def replace_once(old, new, label):
    global source
    if new in source:
        return
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 anchor, found {count}")
    source = source.replace(old, new, 1)


# Mark only rules that are genuinely implemented below as fully modeled.
replace_once(
'''  ["lapis, shining seraph", "Countdown Crest Last Words resummon with Storm is modeled"]
]);''',
'''  ["lapis, shining seraph", "Countdown Crest Last Words resummon with Storm is modeled"],
  // [[battle-runecraft-full-overrides]]
  ["lhynkal, wandering fool", "Crest max-defense reduction and Super-Evolve deck injection are modeled"],
  ["pascale's dance", "Earth Sigil gain and Countdown Crest draw/Earth Rite doubling are modeled"],
  ["institute of truth", "Engage hand modification and changed-cost play reaction are modeled"],
  ["elmott, remembrance aflame", "Fanfare silence/damage and start-turn damage Crest are modeled"],
  ["shymm, love bewitched", "Crystalspawn generation and attack-buff Crest are modeled"],
  ["tico, mysterian spellcrafter", "Mysteria hand discount and spell-damage Crest are modeled"],
  ["cagliostro, genius alchemist", "Earth Sigils, Ars Magna generation and start-turn Earth Rite Crest are modeled"],
  ["insomniac witch", "Countdown Crest, Crest destruction and all-follower Last Words damage are modeled"],
  ["bottomless gluttony", "Earth Rite-reactive hand cost reduction and spell effects are modeled"],
  ["crystal gazing", "Countdown Crest Last Words draw and board damage are modeled"],
  ["heel, my dearie", "Earth Rite-reactive hand cost reduction, draw and Earth Sigil gain are modeled"],
  ["bergent, rejected artes", "Onion Patch summons and persistent start-turn summon Crest are modeled"],
  ["enraptured student", "Crystalspawn-entry healing reaction is modeled"],
  ["juno, visionary alchemist", "Earth-Sigil-scaled Fanfare and Countdown Earth Rite Crest are modeled"],
  ["depths of the eld crystals", "Faith multinomial X/Y/Z resolution and Crystalspawn effects are modeled"],
  ["emperor of elements", "Golem-entry Earth Rite evolution is modeled"],
  ["ginger, disastrous word", "Follower-entry Rush and Spellboost reaction is modeled"],
  ["lilanthim, anathema of predation", "Earth Rite effects and opponent-end Countdown Crest summon/evolution are modeled"],
  ["grandeur of the dawnblossom", "Random deck-follower exact-copy field transformation is modeled"],
  ["calge-danthla, eld crystals", "Faith, Crystalspawn hand discount, Storm summons and Evolve generation are modeled"],
  ["noble shikigami", "Destroyed-this-turn Shikigami base-stat entry scaling is modeled"]
]);''',
"Runecraft full overrides")

# Runecraft needs per-turn destroyed Shikigami totals.
replace_once(
'''      p.followersAttackedThisTurn = false;
      // Fuse is usable once per turn per current Fuse card.''',
'''      p.followersAttackedThisTurn = false;
      // [[battle-runecraft-turn-state]]
      p.shikigamiDestroyedBaseAttackThisTurn = 0;
      p.shikigamiDestroyedBaseDefenseThisTurn = 0;
      // Fuse is usable once per turn per current Fuse card.''',
"real turn Runecraft reset")

replace_once(
'''    leaderDamageCap: null, leaderDamageCapUntilOpponentTurnEnd: false,
    goingFirst: false, goingSecond: false, personalTurn: 0, cardsPlayedThisTurn: 0, spellsPlayedThisTurn: 0, futureLookaheadUsedThisTurn: false,
    evolutionsThisMatch: 0, evolutionActionUsed: false, nextSerial: 0, deck: [], hand: [], board: [], cemetery: [],''',
'''    leaderDamageCap: null, leaderDamageCapUntilOpponentTurnEnd: false,
    goingFirst: false, goingSecond: false, personalTurn: 0, cardsPlayedThisTurn: 0, spellsPlayedThisTurn: 0, futureLookaheadUsedThisTurn: false,
    evolutionsThisMatch: 0, evolutionActionUsed: false,
    // [[battle-runecraft-state]]
    shikigamiDestroyedBaseAttackThisTurn: 0, shikigamiDestroyedBaseDefenseThisTurn: 0,
    nextSerial: 0, deck: [], hand: [], board: [], cemetery: [],''',
"player Runecraft state")

replace_once(
'''  // [[battle-faith-initialization]]
  player.faithActive = player.deck.some(item => norm(item.card?.name) === "yidmetra, eld sword");''',
'''  // [[battle-faith-initialization]]
  // Faith activates automatically when a Faith card is present in the starting deck.
  player.faithActive = player.deck.some(item => has(item.card, "Faith")
    || ["yidmetra, eld sword", "calge-danthla, eld crystals"].includes(norm(item.card?.name)));''',
"Faith initialization")

# Planner turn clones need the same per-turn counters reset as real turns.
replace_once(
'''function resetPlanningTurnState(player) {
  player.cardsPlayedThisTurn = 0;
  player.spellsPlayedThisTurn = 0;
  player.evolutionActionUsed = false;
  player.followersAttackedThisTurn = false;''',
'''function resetPlanningTurnState(player) {
  player.cardsPlayedThisTurn = 0;
  player.spellsPlayedThisTurn = 0;
  player.evolutionActionUsed = false;
  player.followersAttackedThisTurn = false;
  // [[battle-runecraft-planner-turn-state]]
  player.shikigamiDestroyedBaseAttackThisTurn = 0;
  player.shikigamiDestroyedBaseDefenseThisTurn = 0;''',
"planner Runecraft reset")

# Exact Runecraft helpers live beside board construction / text resolution.
anchor = '''function resolveText(raw, ctx) {
  let text = String(raw ?? "").trim();
  const actions = [];
  if (!text) return { actions, applied: false, unresolved: false };
'''
if "[[battle-runecraft-exact-rules]]" not in source:
    helpers = r'''
// [[battle-runecraft-exact-rules]]
function runecraftTrait(card, trait) {
  return (card?.traits ?? []).some(value => norm(value) === norm(trait));
}

function isCrystalspawn(value) {
  return norm(value?.name ?? value?.card?.name) === "crystalspawn";
}

function isGolemFollower(unit) {
  return unit?.type === "Follower" && runecraftTrait(unit.card, "Golem");
}

function recordDestroyedShikigami(player, unit) {
  if (!unit || unit.type !== "Follower" || !runecraftTrait(unit.card, "Shikigami")) return;
  player.shikigamiDestroyedBaseAttackThisTurn = (Number(player.shikigamiDestroyedBaseAttackThisTurn) || 0) + Math.max(0, Number(unit.card?.attack) || 0);
  player.shikigamiDestroyedBaseDefenseThisTurn = (Number(player.shikigamiDestroyedBaseDefenseThisTurn) || 0) + Math.max(0, Number(unit.card?.defense) || 0);
}

function performEarthRite(player, amountValue, actions = []) {
  const amount = Math.max(1, Number(amountValue) || 1);
  if ((Number(player.earthSigils) || 0) < amount) return false;
  player.earthSigils -= amount;
  for (const item of player.hand ?? []) {
    const name = norm(item.card?.name);
    if (name !== "bottomless gluttony" && name !== "heel, my dearie") continue;
    item.costDelta = (Number(item.costDelta) || 0) - 1;
  }
  actions.push(`Earth Rite ${amount}`);
  return true;
}

function silenceFollower(unit) {
  if (!unit) return;
  unit.overrideText = " ";
  unit.keywords = [];
  unit.barrier = 0;
  unit.aura = false;
  unit.ambush = false;
  unit.intimidate = false;
  unit.permanentAttackLock = false;
  unit.baseMaxAttacks = 1;
  unit.maxAttacks = 1;
}

function runecraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions) {
  const name = norm(crest?.name);
  const ctx = { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map };
  if (name === "insomniac witch") {
    for (const unit of player.board.filter(unit => unit.type === "Follower")) damageUnit(unit, 3, player, opponent, ctx, actions);
    for (const unit of opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, 3, opponent, player, ctx, actions);
    actions.push("Insomniac Crest Last Words: 3 damage to all followers");
    actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map), ...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map));
    return true;
  }
  if (name === "crystal gazing") {
    const drawn = drawCards(player, 2, stats, playerIndex);
    for (const unit of opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, 4, opponent, player, ctx, actions);
    actions.push(`Crystal Gazing Crest Last Words: draw ${drawn} · 4 damage to enemy followers`);
    actions.push(...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map));
    return true;
  }
  return false;
}

function destroyRunecraftCrest(player, name, opponent, playerIndex, enemyIndex, stats, rng, map, actions) {
  const crest = (player.crests ?? []).find(item => norm(item.name) === norm(name));
  if (!crest) return false;
  player.crests = player.crests.filter(item => item !== crest);
  runecraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);
  return true;
}

function applyRunecraftEntryEvents(ctx, unit) {
  if (!unit || unit.type !== "Follower") return [];
  const actions = [];
  const name = norm(unit.name);

  if (name === "lhynkal, wandering fool" && hasCrest(ctx.player, "Lhynkal, Wandering Fool")) {
    const before = Math.max(0, Number(ctx.opponent.maxHp) || 0);
    ctx.opponent.maxHp = Math.max(0, before - 2);
    ctx.opponent.hp = Math.min(ctx.opponent.hp, ctx.opponent.maxHp);
    actions.push(`Lhynkal Crest: enemy max defense ${before} → ${ctx.opponent.maxHp}`);
  }

  if (isCrystalspawn(unit)) {
    if (ctx.player.faithActive) {
      ctx.player.faith = (Number(ctx.player.faith) || 0) + 1;
      actions.push(`Faith +1 (${ctx.player.faith})`);
    }
    for (const item of ctx.player.hand ?? []) {
      if (norm(item.card?.name) !== "calge-danthla, eld crystals") continue;
      item.costDelta = (Number(item.costDelta) || 0) - 1;
    }
    for (const source of ctx.player.board.filter(source => source.type === "Follower" && norm(source.name) === "enraptured student")) {
      const healed = healPlayer(ctx.player, 1, ctx.stats, ctx.playerIndex);
      actions.push(`Enraptured Student: restore ${healed} leader defense`);
      if (healed) actions.push(...afterLeaderHeal(ctx.player, healed, ctx.stats, ctx.playerIndex));
    }
  }

  if (name === "noble shikigami") {
    const attack = Math.max(0, Number(ctx.player.shikigamiDestroyedBaseAttackThisTurn) || 0);
    const defense = Math.max(0, Number(ctx.player.shikigamiDestroyedBaseDefenseThisTurn) || 0);
    if (attack || defense) {
      unit.attack += attack;
      unit.defense += defense;
      unit.maxDefense += defense;
      actions.push(`Noble Shikigami: +${attack}/+${defense}`);
    }
  }

  for (const source of [...ctx.player.board]) {
    if (source === unit || source.type !== "Follower") continue;
    const sourceName = norm(source.name);
    if (sourceName === "emperor of elements" && isGolemFollower(unit) && !unit.evolved && !unit.superEvolved) {
      if (performEarthRite(ctx.player, 1, actions)) {
        evolveUnitByAbility(ctx, unit, actions);
        actions.push(`Emperor of Elements: evolve ${unit.name}`);
      }
    }
    if (sourceName === "ginger, disastrous word") {
      giveKeyword(unit, "Rush");
      spellboostHand(ctx.player, 1, ctx.cardMap, actions);
      actions.push(`Ginger: ${unit.name} gains Rush · Spellboost`);
    }
  }
  return uniq(actions);
}

function applyRunecraftCardPlayedTriggers(player, opponent, card, playerIndex, stats, actions) {
  if (!card || card.type !== "Spell" || !hasCrest(player, "Tico, Mysterian Spellcrafter")) return;
  const mysterian = runecraftTrait(card, "Mysteria") || /mysterian|mysteria/i.test(String(card.name ?? ""));
  if (!mysterian) return;
  const dealt = damageLeader(opponent, 1);
  stats.damageDealt[playerIndex] += dealt;
  actions.push(`Tico Crest: ${dealt} damage to enemy leader`);
}

function applyInstituteChangedCostTrigger(player, opponent, playedCard, changed, playerIndex, enemyIndex, stats, rng, map, actions) {
  if (!changed || playedCard?.type !== "Follower") return;
  for (const institute of [...player.board].filter(unit => unit.type === "Amulet" && norm(unit.name) === "institute of truth")) {
    const drawn = drawCards(player, 1, stats, playerIndex);
    if (Number.isFinite(institute.countdown)) institute.countdown = Math.max(0, institute.countdown - 1);
    actions.push(`Institute of Truth: draw ${drawn} · advance countdown by 1`);
    if (Number.isFinite(institute.countdown) && institute.countdown <= 0) {
      actions.push(...destroyObject(player, opponent, institute, playerIndex, enemyIndex, stats, rng, map, true));
    }
  }
}

function applyRunecraftAttackDeclaration(player, attacker, actions) {
  if (!isCrystalspawn(attacker) || !hasCrest(player, "Shymm, Love Bewitched")) return;
  attacker.attack += 1;
  actions.push(`Shymm Crest: ${attacker.name} +1/+0`);
}

function applyRunecraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  for (const crest of [...(player.crests ?? [])]) {
    const name = norm(crest.name);
    if (name === "elmott, remembrance aflame") {
      const dealt = damageLeader(opponent, 1);
      stats.damageDealt[playerIndex] += dealt;
      actions.push(`Elmott Crest: ${dealt} damage to enemy leader`);
    }
    if (name === "cagliostro, genius alchemist" && performEarthRite(player, 1, actions)) {
      const token = findByName(map, "Ars Magna");
      const added = token ? addHand(player, token, 1, playerIndex, stats) : 0;
      if (added) stats.cardsGenerated[playerIndex] += added;
      actions.push(`Cagliostro Crest: add ${added ? "Ars Magna" : "no card"}`);
    }
    if (name === "bergent, rejected artes") {
      const token = findByName(map, "Onion Patch");
      if (token && player.board.length < 5) {
        const unit = boardFollower(instance(player, token));
        player.board.push(unit);
        player.rally += 1;
        stats.cardsGenerated[playerIndex] += 1;
        actions.push("Bergent Crest: summon Onion Patch", ...applyEntryEvents({ player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, unit));
      }
    }
  }
  return uniq(actions);
}

function applyRunecraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  for (const crest of [...(player.crests ?? [])]) {
    const name = norm(crest.name);
    if (name === "pascale's dance") {
      const drawn = drawCards(player, 1, stats, playerIndex);
      actions.push(`Pascale Crest: draw ${drawn}`);
      if (performEarthRite(player, 10, actions)) {
        const ctx = { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map };
        for (const unit of player.board.filter(unit => unit.type === "Follower")) {
          const attack = Math.max(0, Number(unit.attack) || 0);
          const defense = Math.max(0, Number(unit.defense) || 0);
          const context = effectContext(ctx);
          context.buffUnit(unit, attack, defense);
        }
        actions.push("Pascale Crest: double allied follower attack/defense");
      }
    }
    if (name === "juno, visionary alchemist" && performEarthRite(player, 1, actions)) {
      const token = findByName(map, "Guardian Golem");
      if (token && player.board.length < 5) {
        const unit = boardFollower(instance(player, token));
        player.board.push(unit);
        player.rally += 1;
        stats.cardsGenerated[playerIndex] += 1;
        actions.push("Juno Crest: summon Guardian Golem", ...applyEntryEvents({ player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, unit));
      }
    }
  }
  return uniq(actions);
}

function applyRunecraftOpponentTurnEndCrests(owner, endingPlayer, ownerIndex, endingIndex, stats, rng, map) {
  const actions = [];
  if (!hasCrest(owner, "Lilanthim, Anathema of Predation") || owner.board.length >= 5) return actions;
  const crest = owner.crests.find(item => norm(item.name) === "lilanthim, anathema of predation");
  const card = crest?.card ?? findByName(map, "Lilanthim, Anathema of Predation");
  if (!card) return actions;
  const unit = boardFollower(instance(owner, card));
  owner.board.push(unit);
  owner.rally += 1;
  actions.push("Lilanthim Crest: summon Lilanthim", ...applyEntryEvents({ player: owner, opponent: endingPlayer, playerIndex: ownerIndex, enemyIndex: endingIndex, stats, rng, cardMap: map }, unit));
  const ctx = { card, sourceUnit: unit, player: owner, opponent: endingPlayer, playerIndex: ownerIndex, enemyIndex: endingIndex, stats, rng, cardMap: map };
  if (evolveUnitByAbility(ctx, unit, actions)) actions.push("Lilanthim Crest: evolve Lilanthim");
  actions.push(...cleanup(endingPlayer, owner, endingIndex, ownerIndex, stats, rng, map));
  return uniq(actions);
}

function transformAlliedFollowersFromDeck(ctx, actions) {
  const pool = ctx.player.deck.filter(item => item.card?.type === "Follower");
  if (!pool.length) return 0;
  let transformed = 0;
  for (const old of [...ctx.player.board].filter(unit => unit.type === "Follower")) {
    const index = ctx.player.board.indexOf(old);
    if (index < 0) continue;
    const chosen = pool[Math.floor(ctx.rng() * pool.length)];
    const replacement = boardFollower({ ...chosen, uid: old.uid });
    replacement.summonedThisTurn = old.summonedThisTurn;
    replacement.attacksMade = Number(old.attacksMade) || 0;
    replacement.attacked = Boolean(old.attacked);
    if (!replacement.summonedThisTurn) {
      const locked = /can'?t attack followers or leaders/i.test(String(replacement.card?.text ?? ""));
      replacement.canAttackLeader = !locked;
      replacement.canAttackFollower = !locked;
    }
    notifyFollowerLeavesField(ctx.player, old);
    ctx.player.board[index] = replacement;
    transformed += 1;
    actions.push(`${old.name} transforms into ${replacement.name}`);
  }
  return transformed;
}

function resolveRunecraftCardText(textValue, ctx) {
  let text = String(textValue ?? "");
  const actions = [];
  const name = norm(ctx.card?.name);

  if (name === "lhynkal, wandering fool") {
    const inject = /add 10 copies of Lhynkal, Wandering Fool to your deck\.?/i;
    if (inject.test(text)) {
      for (let index = 0; index < 10; index += 1) ctx.player.deck.push(instance(ctx.player, ctx.card));
      shuffle(ctx.player.deck, ctx.rng);
      actions.push("Lhynkal: add 10 copies to deck");
      text = text.replace(inject, " ");
    }
  }

  if (name === "institute of truth") {
    const engage = /select a follower in your hand, increase its cost by 1, and give it \+1\/\+1\.?/i;
    if (engage.test(text)) {
      const target = ctx.player.hand.filter(item => item.card?.type === "Follower")
        .sort((a, b) => ((Number(b.card?.attack) || 0) + (Number(b.card?.defense) || 0)) - ((Number(a.card?.attack) || 0) + (Number(a.card?.defense) || 0)))[0] ?? null;
      if (target) {
        target.costDelta = (Number(target.costDelta) || 0) + 1;
        target.attackBonus = (Number(target.attackBonus) || 0) + 1;
        target.defenseBonus = (Number(target.defenseBonus) || 0) + 1;
        actions.push(`Institute of Truth: ${target.card.name} cost +1 and +1/+1`);
      }
      text = text.replace(engage, " ");
    }
  }

  if (name === "elmott, remembrance aflame") {
    const fanfare = /select an enemy follower on the field, remove all abilities from it, and deal it 3 damage\.?/i;
    if (fanfare.test(text)) {
      const target = choosePlannedTarget(ctx, ctx.opponent.board);
      if (target) {
        silenceFollower(target);
        damageUnit(target, 3, ctx.opponent, ctx.player, ctx, actions);
        actions.push(`Elmott: remove abilities and deal 3 to ${target.name}`);
      }
      text = text.replace(fanfare, " ");
    }
  }

  if (name === "tico, mysterian spellcrafter") {
    const discount = /reduce the cost of all Mysteria spells in your hand by 1\.?/i;
    if (discount.test(text)) {
      let count = 0;
      for (const item of ctx.player.hand.filter(item => item.card?.type === "Spell" && runecraftTrait(item.card, "Mysteria"))) {
        item.costDelta = (Number(item.costDelta) || 0) - 1;
        count += 1;
      }
      actions.push(`Tico: reduce ${count} Mysteria spell cost${count === 1 ? "" : "s"} by 1`);
      text = text.replace(discount, " ");
    }
  }

  if (name === "insomniac witch") {
    const destroy = /destroy your Crest\s*:\s*Insomniac Witch\.?/i;
    if (destroy.test(text)) {
      destroyRunecraftCrest(ctx.player, "Insomniac Witch", ctx.opponent, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, actions);
      actions.push("Insomniac Witch: destroy Crest");
      text = text.replace(destroy, " ");
    }
  }

  if (name === "juno, visionary alchemist") {
    const fanfare = /select an enemy follower on the field and deal it X damage\.\s*X is the number of earth sigils you have\.?/i;
    if (fanfare.test(text)) {
      const target = choosePlannedTarget(ctx, ctx.opponent.board);
      const amount = Math.max(0, Number(ctx.player.earthSigils) || 0);
      if (target) {
        damageUnit(target, amount, ctx.opponent, ctx.player, ctx, actions);
        actions.push(`Juno: ${amount} damage to ${target.name}`);
      }
      text = text.replace(fanfare, " ");
    }
  }

  if (name === "depths of the eld crystals") {
    const exact = /summon a Crystalspawn and give it \+X\/\+X\.\s*Restore Y defense to your leader\.\s*Deal Z damage to the enemy leader\.\s*X, Y, and Z are determined randomly and add up to your faith'?s value\.?/i;
    if (exact.test(text)) {
      const faith = Math.max(0, Number(ctx.player.faith) || 0);
      let x = 0, y = 0, z = 0;
      // Official Q&A: each Faith point independently rolls X, Y or Z with equal probability.
      for (let index = 0; index < faith; index += 1) {
        const roll = Math.floor(ctx.rng() * 3);
        if (roll === 0) x += 1;
        else if (roll === 1) y += 1;
        else z += 1;
      }
      const token = findByName(ctx.cardMap, "Crystalspawn") ?? related(ctx.card, ctx.cardMap).find(card => norm(card.name) === "crystalspawn");
      let summoned = null;
      if (token && ctx.player.board.length < 5) {
        const before = new Set(ctx.player.board.map(unit => unit.uid));
        summonWithEvents(ctx.player, token, 1, ctx.playerIndex, ctx);
        summoned = ctx.player.board.find(unit => !before.has(unit.uid) && isCrystalspawn(unit)) ?? null;
        if (summoned) {
          summoned.attack += x;
          summoned.defense += x;
          summoned.maxDefense += x;
        }
      }
      const healed = healPlayer(ctx.player, y, ctx.stats, ctx.playerIndex);
      if (healed) actions.push(...afterLeaderHeal(ctx.player, healed, ctx.stats, ctx.playerIndex));
      const dealt = damageLeader(ctx.opponent, z);
      ctx.stats.damageDealt[ctx.playerIndex] += dealt;
      actions.push(`Depths: X=${x} · Y=${y} · Z=${z}${summoned ? " · summon Crystalspawn" : ""}`);
      text = text.replace(exact, " ");
    }
  }

  if (name === "grandeur of the dawnblossom") {
    const transform = /transform all allied followers on the field into exact copies of random followers in your deck\.?/i;
    if (transform.test(text)) {
      const count = transformAlliedFollowersFromDeck(ctx, actions);
      actions.push(`Grandeur: transform ${count} allied follower${count === 1 ? "" : "s"}`);
      text = text.replace(transform, " ");
    }
  }

  if (name === "calge-danthla, eld crystals") {
    const fanfare = /summon 2 copies of Crystalspawn and give them Storm\.?/i;
    if (fanfare.test(text)) {
      const token = findByName(ctx.cardMap, "Crystalspawn") ?? related(ctx.card, ctx.cardMap).find(card => norm(card.name) === "crystalspawn");
      const before = new Set(ctx.player.board.map(unit => unit.uid));
      if (token) summonWithEvents(ctx.player, token, 2, ctx.playerIndex, ctx);
      const summoned = ctx.player.board.filter(unit => !before.has(unit.uid) && isCrystalspawn(unit));
      for (const unit of summoned) giveKeyword(unit, "Storm");
      actions.push(`Calge-Danthla: summon ${summoned.length} Crystalspawn with Storm`);
      text = text.replace(fanfare, " ");
    }
  }

  return { text: text.replace(/\s+/g, " ").trim(), actions };
}

'''
    if anchor not in source:
        raise RuntimeError("resolveText anchor missing")
    source = source.replace(anchor, helpers + anchor, 1)

# Run exact card text before the generic parser.
replace_once(
'''  const actions = [];
  if (!text) return { actions, applied: false, unresolved: false };

  // [[battle-fuse-play-effects]]''',
'''  const actions = [];
  if (!text) return { actions, applied: false, unresolved: false };

  // [[battle-runecraft-resolve-text]]
  const runecraft = resolveRunecraftCardText(text, ctx);
  text = runecraft.text;
  actions.push(...runecraft.actions);

  // Earth Sigils are a numeric field resource in the simulator. Spells and Engage
  // effects can create them directly without occupying an additional board slot.
  for (const match of [...text.matchAll(/gain\s+(an?|one|two|three|four|five|\\d+)\s+earth sigils?/gi)]) {
    const amount = word(match[1]) || 1;
    ctx.player.earthSigils += amount;
    actions.push(`Earth Sigils +${amount} (${ctx.player.earthSigils})`);
    text = text.replace(match[0], " ");
  }

  // [[battle-fuse-play-effects]]''',
"Runecraft resolveText dispatch")

# Every Earth Rite goes through one hook so hand-reactive cost reductions are exact.
replace_once(
'''    if (ctx.player.earthSigils < amount) return { actions: [`Earth Rite ${ctx.player.earthSigils}/${amount}`], applied: false, unresolved: false };
    ctx.player.earthSigils -= amount;
    text = text.replace(/Earth Rite\\s*\\(?\\s*\\d*\\s*\\)?\\s*:/i, "");
    actions.push(`Earth Rite ${amount}`);''',
'''    if (ctx.player.earthSigils < amount) return { actions: [`Earth Rite ${ctx.player.earthSigils}/${amount}`], applied: false, unresolved: false };
    performEarthRite(ctx.player, amount, actions);
    text = text.replace(/Earth Rite\\s*\\(?\\s*\\d*\\s*\\)?\\s*:/i, "");''',
"Earth Rite hook")

# Entry events: Faith, Lhynkal, Crystalspawn, Golem, Ginger and Shikigami reactions.
replace_once(
'''  if ((unit.card?.traits ?? []).some(trait => norm(trait) === "marine") && hasCrest(ctx.player, "Neptune, Arbiter of Tides")) {''',
'''  // [[battle-runecraft-entry-events]]
  actions.push(...applyRunecraftEntryEvents(ctx, unit));

  if ((unit.card?.traits ?? []).some(trait => norm(trait) === "marine") && hasCrest(ctx.player, "Neptune, Arbiter of Tides")) {''',
"Runecraft entry events")

# Capture cost-change status before the card leaves hand; trigger Tico/Institute on play.
replace_once(
'''  const card = inst.card;
  const actions = [];
  let source = null;''',
'''  const card = inst.card;
  const playedWithChangedCost = card.type === "Follower" && costOf(inst) !== Math.max(0, Number(card.cost) || 0);
  const actions = [];
  let source = null;''',
"changed-cost capture")

replace_once(
'''  // "Whenever you play ... a Loot card" triggers from the play event itself.
  applyLootPlayedTrigger(player, opponent, card, playerIndex, enemyIndex, stats, rng, cardMap, actions);

  if (mode.kind !== "crystallize") {''',
'''  // "Whenever you play ..." triggers from the play event itself.
  applyLootPlayedTrigger(player, opponent, card, playerIndex, enemyIndex, stats, rng, cardMap, actions);
  // [[battle-runecraft-play-triggers]]
  applyRunecraftCardPlayedTriggers(player, opponent, card, playerIndex, stats, actions);

  if (mode.kind !== "crystallize") {''',
"Runecraft card-play triggers")

replace_once(
'''  if (card.type === "Spell" || mode.kind === "accelerate") {''',
'''  // [[battle-runecraft-institute-trigger]]
  applyInstituteChangedCostTrigger(player, opponent, card, playedWithChangedCost, playerIndex, enemyIndex, stats, rng, cardMap, actions);

  if (card.type === "Spell" || mode.kind === "accelerate") {''',
"Institute changed-cost trigger")

# Crest countdowns.
replace_once(
'''  if (normalized === "lapis, shining seraph") return 2;
  return null;''',
'''  if (normalized === "lapis, shining seraph") return 2;
  // [[battle-runecraft-crest-countdowns]]
  if (normalized === "pascale's dance") return 1;
  if (normalized === "insomniac witch") return 2;
  if (normalized === "crystal gazing") return 2;
  if (normalized === "juno, visionary alchemist") return 3;
  if (normalized === "lilanthim, anathema of predation") return 1;
  return null;''',
"Runecraft Crest countdowns")

# Start-turn Crest effects occur after countdown processing/removal.
replace_once(
'''  tickCrests(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);
  if (hasCrest(player, "Burnite, Anathema of Ash")) {''',
'''  tickCrests(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);
  // [[battle-runecraft-crest-turn-start]]
  actions.push(...applyRunecraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  if (hasCrest(player, "Burnite, Anathema of Ash")) {''',
"Runecraft Crest turn start")

# Countdown Crest Last Words for Rune.
replace_once(
'''  // [[battle-haven-lapis-crest-last-words]]
  for (const crest of expired) {
    if (norm(crest.name) !== "lapis, shining seraph") continue;''',
'''  // [[battle-haven-lapis-crest-last-words]]
  for (const crest of expired) {
    // [[battle-runecraft-crest-last-words]]
    if (runecraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;
    if (norm(crest.name) !== "lapis, shining seraph") continue;''',
"Runecraft Crest Last Words")

# Own-end and opponent-end Crest timing.
replace_once(
'''  actions.push(...applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  restoreTemporaryAttack(player);''',
'''  actions.push(...applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  // [[battle-runecraft-opponent-turn-end-crest]]
  actions.push(...applyRunecraftOpponentTurnEndCrests(opponent, player, enemyIndex, playerIndex, stats, rng, map));
  restoreTemporaryAttack(player);''',
"Runecraft opponent turn-end Crest")

replace_once(
'''function applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  for (const crest of player.crests ?? []) {''',
'''function applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  // [[battle-runecraft-crest-turn-end]]
  actions.push(...applyRunecraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  for (const crest of player.crests ?? []) {''',
"Runecraft Crest turn end")

# Ability removal must survive readying on later turns.
replace_once(
'''      const permanentlyLocked = /can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));''',
'''      const permanentlyLocked = /can't attack followers or leaders/i.test(String(unit.overrideText ?? unit.card?.text ?? ""));''',
"silenced follower readying")

# Shymm's attack trigger must exist in both real and planner attack executors.
attack_anchor = '''  if (action.leader && hasU(attacker, "Storm") && hasCrest(opponent, "Lu Woh, Light Personified")) {'''
if source.count(attack_anchor) != 1 and "[[battle-runecraft-shymm-attack-planner]]" not in source:
    raise RuntimeError(f"planner attack anchor expected once, found {source.count(attack_anchor)}")
if "[[battle-runecraft-shymm-attack-planner]]" not in source:
    source = source.replace(attack_anchor,
'''  // [[battle-runecraft-shymm-attack-planner]]
  applyRunecraftAttackDeclaration(player, attacker, actions);
  if (action.leader && hasU(attacker, "Storm") && hasCrest(opponent, "Lu Woh, Light Personified")) {''', 1)

real_attack_anchor = '''      if (leader) {
        // [[battle-strike-precombat-v5]] Attack/Strike abilities resolve before combat damage.'''
if "[[battle-runecraft-shymm-attack-real]]" not in source:
    if source.count(real_attack_anchor) != 1:
        raise RuntimeError(f"real attack anchor expected once, found {source.count(real_attack_anchor)}")
    source = source.replace(real_attack_anchor,
'''      // [[battle-runecraft-shymm-attack-real]]
      applyRunecraftAttackDeclaration(player, attacker, actions);

      if (leader) {
        // [[battle-strike-precombat-v5]] Attack/Strike abilities resolve before combat damage.''', 1)

# Track destroyed Shikigami in both destruction paths.
replace_once(
'''    for (const unit of dead) {
      player.board = player.board.filter(item => item.uid !== unit.uid);''',
'''    for (const unit of dead) {
      // [[battle-runecraft-shikigami-destroyed-cleanup]]
      recordDestroyedShikigami(player, unit);
      player.board = player.board.filter(item => item.uid !== unit.uid);''',
"Shikigami cleanup tracking")

replace_once(
'''function destroyObject(player, opponent, unit, playerIndex, enemyIndex, stats, rng, map, lastWordsEnabled) {
  // [[battle-destroy-object-leave-hook]]''',
'''function destroyObject(player, opponent, unit, playerIndex, enemyIndex, stats, rng, map, lastWordsEnabled) {
  // [[battle-runecraft-shikigami-destroyed-object]]
  if (unit.type === "Follower") recordDestroyedShikigami(player, unit);
  // [[battle-destroy-object-leave-hook]]''',
"Shikigami destroyObject tracking")

# QA inspector executes the new primitives directly so Full means behavior, not only classification.
if "export function inspectRunecraftFullRules" not in source:
    qa_anchor = '''export function inspectEffectiveCost(card, { spellboost = 0, costDelta = 0 } = {}) {'''
    if qa_anchor not in source:
        raise RuntimeError("QA insertion anchor missing")
    qa = r'''// [[battle-runecraft-full-qa]]
export function inspectRunecraftFullRules({ cards = [] } = {}) {
  const map = new Map(cards.map(card => [Number(card.id), card]));
  prepareOriginalCardMap(map);
  const byName = name => findByName(map, name);
  const rng = createRng("runecraft-full-qa");
  const stats = createStats();
  const player = makePlayer("You", [], { style: "spell-combo" }, map, rng);
  const opponent = makePlayer("Opponent", [], {}, map, rng);
  player.isActive = true;
  opponent.isActive = false;
  player.personalTurn = 7;
  player.maxPp = player.pp = 10;
  const actions = [];

  // Lhynkal Crest only starts reducing max defense on subsequent entries.
  gainCrest(player, "Lhynkal, Wandering Fool", byName("Lhynkal, Wandering Fool"));
  const lhynkal = boardFollower(instance(player, byName("Lhynkal, Wandering Fool")));
  player.board.push(lhynkal);
  applyEntryEvents({ player, opponent, playerIndex: 0, enemyIndex: 1, stats, rng, cardMap: map }, lhynkal);
  const lhynkalMaxDefense = opponent.maxHp;
  player.board = [];

  // Earth Rite must discount both reactive hand spells exactly once per Rite.
  const bottomless = instance(player, byName("Bottomless Gluttony"));
  const heel = instance(player, byName("Heel, My Dearie"));
  player.hand = [bottomless, heel];
  player.earthSigils = 2;
  performEarthRite(player, 2, actions);
  const earthRiteDiscounts = [bottomless.costDelta, heel.costDelta];

  // Crystalspawn increments Faith and discounts Calge-Danthla in hand.
  const calge = instance(player, byName("Calge-Danthla, Eld Crystals"));
  player.hand = [calge];
  player.faithActive = true;
  player.faith = 0;
  const crystal = boardFollower(instance(player, byName("Crystalspawn")));
  player.board = [crystal];
  applyEntryEvents({ player, opponent, playerIndex: 0, enemyIndex: 1, stats, rng, cardMap: map }, crystal);
  const faithAfterCrystal = player.faith;
  const calgeDiscount = calge.costDelta;

  // Tico Crest damages on Mysteria spell play.
  gainCrest(player, "Tico, Mysterian Spellcrafter", byName("Tico, Mysterian Spellcrafter"));
  opponent.hp = 20;
  applyRunecraftCardPlayedTriggers(player, opponent, byName("Mysterian Missile"), 0, stats, actions);
  const ticoDamage = 20 - opponent.hp;

  // Shymm Crest buffs Crystalspawn as the attack is declared.
  gainCrest(player, "Shymm, Love Bewitched", byName("Shymm, Love Bewitched"));
  const attackBefore = crystal.attack;
  applyRunecraftAttackDeclaration(player, crystal, actions);
  const shymmAttackBuff = crystal.attack - attackBefore;

  // Institute Engage changes cost and stats; playing a changed-cost follower draws and advances countdown.
  const instituteCard = byName("Institute of Truth");
  const institute = boardAmulet(instance(player, instituteCard));
  institute.countdown = 5;
  const targetHand = instance(player, byName("Lhynkal, Wandering Fool"));
  player.board = [institute];
  player.hand = [targetHand];
  resolveRunecraftCardText("Select a follower in your hand, increase its cost by 1, and give it +1/+1.", { card: instituteCard, sourceUnit: institute, player, opponent, playerIndex: 0, enemyIndex: 1, stats, rng, cardMap: map });
  const instituteEngage = { costDelta: targetHand.costDelta, attackBonus: targetHand.attackBonus, defenseBonus: targetHand.defenseBonus };
  player.deck = [instance(player, byName("Lhynkal, Wandering Fool"))];
  player.hand = [];
  applyInstituteChangedCostTrigger(player, opponent, targetHand.card, true, 0, 1, stats, rng, map, actions);
  const instituteReaction = { countdown: institute.countdown, hand: player.hand.length };

  // Depths uses one equal X/Y/Z roll per pre-summon Faith point.
  player.board = [];
  player.hand = [];
  player.faithActive = true;
  player.faith = 6;
  player.hp = 10;
  player.maxHp = 20;
  opponent.hp = 20;
  const depths = byName("Depths of the Eld Crystals");
  const beforeFaith = player.faith;
  const beforeHp = player.hp;
  const beforeEnemyHp = opponent.hp;
  resolveRunecraftCardText(depths.text, { card: depths, player, opponent, playerIndex: 0, enemyIndex: 1, stats, rng, cardMap: map });
  const depthCrystal = player.board.find(isCrystalspawn);
  const depthX = depthCrystal ? Math.max(0, depthCrystal.attack - (Number(depthCrystal.card?.attack) || 0)) : 0;
  const depthY = player.hp - beforeHp;
  const depthZ = beforeEnemyHp - opponent.hp;
  const depthPartition = { faith: beforeFaith, x: depthX, y: depthY, z: depthZ, sum: depthX + depthY + depthZ };

  // Grandeur copies followers from deck without removing them.
  const odin = byName("Odin, Twilit Fate");
  player.deck = odin ? [instance(player, odin)] : [];
  const dummyCard = { id: -88101, name: "QA Rune Body", class: "Runecraft", type: "Follower", cost: 1, attack: 1, defense: 1, text: "", keywords: [], traits: [] };
  player.board = [boardFollower(instance(player, dummyCard)), boardFollower(instance(player, dummyCard))];
  transformAlliedFollowersFromDeck({ player, opponent, playerIndex: 0, enemyIndex: 1, stats, rng, cardMap: map }, actions);
  const grandeurNames = player.board.map(unit => unit.name);

  // Countdown Crest Last Words.
  const enemyDummy = boardFollower(instance(opponent, { ...dummyCard, id: -88102, name: "QA Enemy", defense: 4 }));
  opponent.board = [enemyDummy];
  player.board = [];
  player.deck = [instance(player, dummyCard), instance(player, dummyCard)];
  player.hand = [];
  const crystalGazing = { name: "Crystal Gazing" };
  runecraftCrestLastWords(crystalGazing, player, opponent, 0, 1, stats, rng, map, actions);
  const crystalGazingResult = { drawn: player.hand.length, enemyBoard: opponent.board.length };

  return {
    lhynkalMaxDefense,
    earthRiteDiscounts,
    faithAfterCrystal,
    calgeDiscount,
    ticoDamage,
    shymmAttackBuff,
    instituteEngage,
    instituteReaction,
    depthPartition,
    grandeurNames,
    crystalGazingResult
  };
}

'''
    source = source.replace(qa_anchor, qa + qa_anchor, 1)

path.write_text(source, encoding="utf-8")
print("Runecraft class rules materialized.")
