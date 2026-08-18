from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
text = ENGINE.read_text(encoding="utf-8")

anchor = '''function resolveHighRiskGenericText(textValue, ctx) {
  let text = String(textValue ?? "");
  const actions = [];
'''
if anchor not in text:
    raise SystemExit("Missing high-risk resolver entry")

preflight = r'''function resolveHighRiskGenericText(textValue, ctx) {
  let text = String(textValue ?? "");
  const actions = [];

  // [[battle-high-risk-tail-preflight]]
  // These remaining clauses need the whole sentence intact, so resolve them
  // before broader generic fragments (damage, evolve, destroy, keyword, etc.).
  const cardName = norm(ctx.card?.name);

  // Generic article-bearing tutors that escaped the first tutor grammar.
  for (const match of [...text.matchAll(/Draw\s+(?:a|an|one|1)\s+(?:(Forestcraft|Swordcraft|Runecraft|Dragoncraft|Abysscraft|Havencraft|Portalcraft|Neutral)\s+)?follower\.?/gi)]) {
    const cls = match[1] ? norm(match[1]) : null;
    const item = drawMatchingCard(ctx.player, card => card.type === "Follower" && (!cls || norm(card.class) === cls), ctx.stats, ctx.playerIndex, ctx.rng);
    actions.push(`draw follower${item ? ` ${item.card.name}` : " unavailable"}`);
    text = text.replace(match[0], " ");
  }

  // --- Abysscraft ---------------------------------------------------------
  if (cardName === "baal, elemental resonance") {
    const effect = /Give this follower and another random allied follower on the field \+1\/\+1\.?/i;
    if (effect.test(text)) {
      if (ctx.sourceUnit) buff(ctx.sourceUnit, 1, 1);
      const pool = ctx.player.board.filter(unit => unit.type === "Follower" && unit.uid !== ctx.sourceUnit?.uid);
      const target = pool.length ? pool[Math.floor(ctx.rng() * pool.length)] : null;
      if (target) buff(target, 1, 1);
      actions.push(`Baal: self and ${target?.name ?? "no other ally"} +1/+1`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "deprived destroyer") {
    const effect = /Select another allied follower on the field\.\s*If you selected one, destroy it and evolve this follower\.?/i;
    if (effect.test(text)) {
      const target = ctx.player.board.filter(unit => unit.type === "Follower" && unit.uid !== ctx.sourceUnit?.uid)
        .sort((a,b) => (Number(a.attack)+Number(a.defense))-(Number(b.attack)+Number(b.defense)))[0] ?? null;
      if (target) {
        actions.push(...destroyObject(ctx.player, ctx.opponent, target, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true));
        if (ctx.sourceUnit) evolveUnitByAbility(ctx, ctx.sourceUnit, actions);
      }
      actions.push(`Deprived Destroyer: sacrifice ${target?.name ?? "unavailable"}`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "nezha, soaring war god") {
    const effect = /deal 4 damage to a random enemy follower, then deal 2 damage to a random enemy follower\.?/i;
    if (effect.test(text)) {
      for (const amount of [4, 2]) {
        const pool = ctx.opponent.board.filter(unit => unit.type === "Follower" && unit.defense > 0);
        const target = pool.length ? pool[Math.floor(ctx.rng() * pool.length)] : null;
        if (target) damageUnit(target, amount, ctx.opponent, ctx.player, ctx, actions);
      }
      actions.push("Nezha: sequential 4 then 2 random damage");
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "fediel, darkness personified") {
    const effect = /Necromancy\s*\(?\s*6\s*\)?\s*[-–—:]\s*Reanimate\s*\(?\s*2\s*\)?\s*,\s*Reanimate\s*\(?\s*1\s*\)?\s*,?\s*and evolve them\.?/i;
    if (effect.test(text)) {
      const summoned = [];
      if ((Number(ctx.player.shadows) || 0) >= 6) {
        ctx.player.shadows -= 6;
        for (const cost of [2, 1]) {
          const unit = reanimate(ctx.player, cost, ctx.playerIndex, ctx.cardMap, ctx.rng);
          if (!unit || ctx.player.board.length >= 5) continue;
          ctx.player.board.push(unit);
          ctx.player.rally += 1;
          actions.push(`Fediel: Reanimate ${cost} ${unit.name}`, ...applyEntryEvents(ctx, unit));
          summoned.push(unit);
        }
        for (const unit of summoned) evolveUnitByAbility(ctx, unit, actions);
      }
      actions.push(`Fediel: Necromancy 6 · ${summoned.length} evolved reanimates`);
      text = text.replace(effect, " ");
    }
  }

  // --- Conditional auto-evolution must precede plain "evolve this" grammar.
  const maxPpAuto = /If you have 10 max play points, evolve this follower\.?/i;
  if (maxPpAuto.test(text)) {
    if ((Number(ctx.player.maxPp) || 0) >= 10 && ctx.sourceUnit) evolveUnitByAbility(ctx, ctx.sourceUnit, actions);
    text = text.replace(maxPpAuto, " ");
  }
  const overflowAuto = /If you'?re in Overflow, evolve this follower\.?/i;
  if (overflowAuto.test(text)) {
    if ((Number(ctx.player.maxPp) || 0) >= 7 && ctx.sourceUnit) evolveUnitByAbility(ctx, ctx.sourceUnit, actions);
    text = text.replace(overflowAuto, " ");
  }
  const evolvedAllyAuto = /If there'?s an evolved allied follower on the field, evolve this follower\.?/i;
  if (evolvedAllyAuto.test(text)) {
    if (ctx.player.board.some(unit => unit.type === "Follower" && unit.uid !== ctx.sourceUnit?.uid && (unit.evolved || unit.superEvolved)) && ctx.sourceUnit) {
      evolveUnitByAbility(ctx, ctx.sourceUnit, actions);
    }
    text = text.replace(evolvedAllyAuto, " ");
  }

  // --- Dragoncraft --------------------------------------------------------
  if (cardName === "springwell steward") {
    const effect = /select 2 instead\.?/i;
    if (effect.test(text)) {
      const targets = [...ctx.opponent.board].filter(unit => unit.type === "Follower")
        .sort((a,b) => followerThreatValue(b)-followerThreatValue(a)).slice(0, 2);
      for (const target of targets) damageUnit(target, 5, ctx.opponent, ctx.player, ctx, actions);
      actions.push(`Springwell Steward: 5 damage to ${targets.length} targets`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "vorlalai, eld blades") {
    const effect = /add 3 copies instead\.?/i;
    if (effect.test(text)) {
      const token = findByName(ctx.cardMap, "Depths of the Eld Blades") ?? related(ctx.card, ctx.cardMap).find(card => norm(card.name) === "depths of the eld blades");
      const added = token ? addHand(ctx.player, token, 3, ctx.playerIndex, ctx.stats) : 0;
      if (added) ctx.stats.cardsGenerated[ctx.playerIndex] += added;
      actions.push(`Vorlalai: add ${added} Depths`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "draconic berserker") {
    const effect = /deal damage to all enemy followers instead\.?/i;
    if (effect.test(text)) {
      for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, 4, ctx.opponent, ctx.player, ctx, actions);
      actions.push("Draconic Berserker: 4 damage to all enemy followers");
      text = text.replace(effect, " ");
    }
  }

  const giveSelfKeyword = text.match(/Give this follower\s+(Ambush|Aura|Bane|Barrier|Drain|Intimidate|Rush|Storm|Ward)\.?/i);
  if (giveSelfKeyword && ctx.sourceUnit) {
    const keyword = giveSelfKeyword[1][0].toUpperCase() + giveSelfKeyword[1].slice(1).toLowerCase();
    highRiskGrantKeyword(ctx.sourceUnit, keyword);
    actions.push(`${ctx.sourceUnit.name}: gain ${keyword}`);
    text = text.replace(giveSelfKeyword[0], " ");
  }

  if (cardName === "congregant of disdain") {
    const effect = /if this follower'?s defense is 3 or less, give all Dragoncraft followers in your hand \+1\/\+1\.?/i;
    if (effect.test(text)) {
      let count = 0;
      if ((Number(ctx.sourceUnit?.defense) || 0) <= 3) {
        for (const item of ctx.player.hand) {
          if (item.card?.type !== "Follower" || norm(item.card?.class) !== "dragoncraft") continue;
          item.attackBonus = (Number(item.attackBonus) || 0) + 1;
          item.defenseBonus = (Number(item.defenseBonus) || 0) + 1;
          count += 1;
        }
      }
      actions.push(`Congregant of Disdain: hand buff ×${count}`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "ruinbringer") {
    const effect = /banish all 1-, 3-, 5-, 7-, and 9-cost cards from your deck\.\s*deal x damage split between all enemy followers\.\s*x is the number of cards you banished\.?/i;
    if (effect.test(text)) {
      const odd = new Set([1,3,5,7,9]);
      const banished = ctx.player.deck.filter(item => odd.has(Number(item.card?.cost) || 0));
      ctx.player.deck = ctx.player.deck.filter(item => !odd.has(Number(item.card?.cost) || 0));
      ctx.player.banished.push(...banished.map(item => ({ uid: item.uid, card: item.card })));
      let remaining = banished.length;
      const total = remaining;
      while (remaining > 0) {
        const pool = ctx.opponent.board.filter(unit => unit.type === "Follower" && unit.defense > 0);
        if (!pool.length) break;
        const target = pool[Math.floor(ctx.rng() * pool.length)];
        damageUnit(target, 1, ctx.opponent, ctx.player, ctx, actions);
        remaining -= 1;
      }
      actions.push(`Ruinbringer: banish ${total} odd-cost deck cards · split ${total}`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "garyu, fabled dragonkin") {
    for (const [tokenName, keyword] of [["Supreme Golden Dragon", "Storm"], ["Supreme Silver Dragon", "Barrier"]]) {
      const regex = new RegExp(`Give all allied copies of ${tokenName} on the field ${keyword}\\.?`, "i");
      if (!regex.test(text)) continue;
      let count = 0;
      for (const unit of ctx.player.board.filter(unit => unit.type === "Follower" && norm(unit.name) === norm(tokenName))) { highRiskGrantKeyword(unit, keyword); count += 1; }
      actions.push(`Garyu: ${tokenName} ${keyword} ×${count}`);
      text = text.replace(regex, " ");
    }
  }

  if (cardName === "lumiore & argente, shining wings") {
    const effect = /Select 2 cards in your hand and discard them\.\s*Deal 4 damage to all enemies\.?/i;
    if (effect.test(text)) {
      const discarded = highRiskDiscardItems(ctx, ctx.player.hand.slice(0,2), actions);
      for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, 4, ctx.opponent, ctx.player, ctx, actions);
      const dealt = damageLeader(ctx.opponent, 4); ctx.stats.damageDealt[ctx.playerIndex] += dealt;
      actions.push(`Lumiore & Argente: discard ${discarded} · 4 damage all enemies`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "mugen, steel-bodied honesty") {
    const effect = /Super Skybound Art\s*:\s*Give this follower Storm\.?/i;
    if (effect.test(text)) {
      if (skyboundCountForInstance(ctx) >= 15 && ctx.sourceUnit) highRiskGrantKeyword(ctx.sourceUnit, "Storm");
      actions.push(`Mugen: Super Skybound ${skyboundCountForInstance(ctx) >= 15 ? "active" : "inactive"}`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "erntz, governing justice") {
    const effect = /remove ward from this follower\.\s*give it intimidate\.?/i;
    if (effect.test(text) && ctx.sourceUnit) {
      ctx.sourceUnit.keywords = ctx.sourceUnit.keywords.filter(keyword => norm(keyword) !== "ward");
      highRiskGrantKeyword(ctx.sourceUnit, "Intimidate");
      actions.push("Erntz: remove Ward · gain Intimidate");
      text = text.replace(effect, " ");
    }
  }

  // --- Forestcraft --------------------------------------------------------
  if (cardName === "lymaga, untamed wild") {
    const lock = /Select 2 enemy followers on the field and give them ["“]Can'?t attack followers or leaders["”] until the end of your opponent'?s turn\.?/i;
    if (lock.test(text)) {
      const targets = [...ctx.opponent.board].filter(unit => unit.type === "Follower")
        .sort((a,b) => followerThreatValue(b)-followerThreatValue(a)).slice(0,2);
      for (const target of targets) { target.yuriusAttackLocked = true; target.canAttackLeader = false; target.canAttackFollower = false; }
      actions.push(`Lymaga: lock ${targets.length} enemies`);
      text = text.replace(lock, " ");
    }
    const curse = /select 2 enemy followers on the field and give them ["“]at the end of each turn, deal 1 damage to your leader and 2 damage to this follower\.["”]/i;
    if (curse.test(text)) {
      const targets = [...ctx.opponent.board].filter(unit => unit.type === "Follower")
        .sort((a,b) => followerThreatValue(b)-followerThreatValue(a)).slice(0,2);
      for (const target of targets) target.highRiskLymagaEndTurnCurse = true;
      actions.push(`Lymaga: curse ${targets.length} enemies`);
      text = text.replace(curse, " ");
    }
  }

  const bareAttackCount = text.match(/Can attack\s*(\d+)\s*times per turn\.?/i);
  if (bareAttackCount && ctx.sourceUnit) {
    const count = Number(bareAttackCount[1]) || 1;
    ctx.sourceUnit.baseMaxAttacks = Math.max(count, Number(ctx.sourceUnit.baseMaxAttacks) || 1);
    ctx.sourceUnit.maxAttacks = Math.max(count, Number(ctx.sourceUnit.maxAttacks) || 1);
    actions.push(`${ctx.sourceUnit.name}: attack ×${count}`);
    text = text.replace(bareAttackCount[0], " ");
  }

  // --- Havencraft ---------------------------------------------------------
  if (cardName === "damus, oracle of malice") {
    const effect = /Select an enemy follower on the field and give it ["“]At the end of your turn, destroy this card\.["”]/i;
    if (effect.test(text)) {
      const target = choosePlannedTarget(ctx, ctx.opponent.board.filter(unit => unit.type === "Follower"));
      if (target) target.highRiskDestroyAtOwnTurnEnd = true;
      actions.push(`Damus: mark ${target?.name ?? "no target"} for owner-turn destruction`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "lamretta, sisterly shepherd") {
    const effect = /if this follower is evolved, deal 2 damage to all followers\.?/i;
    if (effect.test(text)) {
      if (ctx.sourceUnit?.evolved || ctx.sourceUnit?.superEvolved) {
        for (const unit of ctx.player.board.filter(unit => unit.type === "Follower")) damageUnit(unit, 2, ctx.player, ctx.opponent, ctx, actions);
        for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, 2, ctx.opponent, ctx.player, ctx, actions);
      }
      actions.push("Lamretta: evolved all-follower damage check");
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "unholy vessel") {
    const effect = /Destroy this card and all followers\.?/i;
    if (effect.test(text)) {
      if (ctx.sourceUnit) actions.push(...destroyObject(ctx.player, ctx.opponent, ctx.sourceUnit, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true));
      for (const unit of [...ctx.player.board].filter(unit => unit.type === "Follower")) destroyUnit(ctx.player, unit);
      for (const unit of [...ctx.opponent.board].filter(unit => unit.type === "Follower")) destroyUnit(ctx.opponent, unit);
      actions.push("Unholy Vessel: destroy self and all followers");
      text = text.replace(effect, " ");
    }
  }

  // --- Neutral ------------------------------------------------------------
  if (cardName === "inspirational one" || cardName === "dogged one") {
    const reactive = /Activates in hand\.\s*When an enemy follower super-evolves, give this follower (Bane|Storm)\.?/i;
    if (reactive.test(text)) {
      actions.push(`${ctx.card.name}: enemy Super-Evolve hand trigger registered`);
      text = text.replace(reactive, " ");
    }
  }

  if (cardName === "arriet, luxminstrel") {
    const effect = /restore 4 defense instead\.?/i;
    if (effect.test(text)) {
      const healed = healPlayer(ctx.player, 4, ctx.stats, ctx.playerIndex);
      actions.push(`Arriet: restore ${healed}/4 leader defense`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "dark dimensions") {
    const effect = /deal 2 damage to all non-Encroacher followers\.?/i;
    if (effect.test(text)) {
      const isEncroacher = unit => (unit.card?.traits ?? []).some(trait => norm(trait) === "encroacher");
      for (const unit of ctx.player.board.filter(unit => unit.type === "Follower" && !isEncroacher(unit))) damageUnit(unit, 2, ctx.player, ctx.opponent, ctx, actions);
      for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower" && !isEncroacher(unit))) damageUnit(unit, 2, ctx.opponent, ctx.player, ctx, actions);
      actions.push("Dark Dimensions: 2 damage to all non-Encroacher followers");
      text = text.replace(effect, " ");
    }
  }

  // --- Portalcraft --------------------------------------------------------
  if (cardName === "axia, heir to destruction") {
    const effect = /deal x damage to the enemy leader\.\s*x is the number of other allied cards on the field\.\s*destroy all other allied cards on the field\.?/i;
    if (effect.test(text)) {
      const others = [...ctx.player.board].filter(unit => unit.uid !== ctx.sourceUnit?.uid);
      const dealt = damageLeader(ctx.opponent, others.length); ctx.stats.damageDealt[ctx.playerIndex] += dealt;
      for (const unit of others) actions.push(...destroyObject(ctx.player, ctx.opponent, unit, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true));
      actions.push(`Axia: ${dealt} leader damage · destroy ${others.length} allied cards`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "the journey ahead") {
    const effect = /Select an enemy follower on the field and deal it 6 damage\.\s*If at least 3 differently named allied Artifact followers have entered the field this match, recover 1 evolution point\.?/i;
    if (effect.test(text)) {
      const target = choosePlannedTarget(ctx, ctx.opponent.board.filter(unit => unit.type === "Follower"));
      if (target) damageUnit(target, 6, ctx.opponent, ctx.player, ctx, actions);
      const history = new Set((ctx.player.artifactFollowerNamesEntered ?? []).map(norm)).size;
      if (history >= 3) ctx.player.ep = Math.min(2, (Number(ctx.player.ep) || 0) + 1);
      actions.push(`Journey Ahead: 6 damage · Artifact history ${history}`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "mecha cavalier") {
    const effect = /summon 2 instead\.?/i;
    if (effect.test(text)) {
      const summoned = summonWithEvents(ctx.player, ctx.card, 2, ctx.playerIndex, ctx);
      actions.push(`Mecha Cavalier: summon ${summoned}/2 copies`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "chaos legion") {
    const effect = /Deal 3 damage to all enemies\.\s*Super Skybound Art\s*:\s*Deal 6 damage instead\.?/i;
    if (effect.test(text)) {
      const amount = skyboundCountForInstance(ctx) >= 15 ? 6 : 3;
      for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, amount, ctx.opponent, ctx.player, ctx, actions);
      const dealt = damageLeader(ctx.opponent, amount); ctx.stats.damageDealt[ctx.playerIndex] += dealt;
      actions.push(`Chaos Legion: ${amount} damage to all enemies`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "sylvia, garden executioner") {
    const effect = /select 2 instead\.?/i;
    if (effect.test(text)) {
      const targets = [...ctx.opponent.board].filter(unit => unit.type === "Follower")
        .sort((a,b) => followerThreatValue(b)-followerThreatValue(a)).slice(0,2);
      for (const target of targets) actions.push(...destroyObject(ctx.opponent, ctx.player, target, ctx.enemyIndex, ctx.playerIndex, ctx.stats, ctx.rng, ctx.cardMap, true));
      actions.push(`Sylvia: destroy ${targets.length}/2 enemies`);
      text = text.replace(effect, " ");
    }
  }

  // --- Runecraft ----------------------------------------------------------
  if (cardName === "velharia, heir to truth") {
    const selectedBanish = /Select an enemy follower on the field and banish it\.?/i;
    if (selectedBanish.test(text)) {
      const target = choosePlannedTarget(ctx, ctx.opponent.board.filter(unit => unit.type === "Follower"));
      if (target) { if (ctx.sourceUnit) ctx.sourceUnit.highRiskLastSelectedEnemyName = norm(target.name); banish(ctx.opponent, target); }
      actions.push(`Velharia: banish selected ${target?.name ?? "none"}`);
      text = text.replace(selectedBanish, " ");
    }
    const copies = /banish all enemy copies of it from the field\.?/i;
    if (copies.test(text)) {
      const name = ctx.sourceUnit?.highRiskLastSelectedEnemyName;
      const targets = name ? [...ctx.opponent.board].filter(unit => unit.type === "Follower" && norm(unit.name) === name) : [];
      for (const target of targets) banish(ctx.opponent, target);
      actions.push(`Velharia: banish ${targets.length} matching enemy copies`);
      text = text.replace(copies, " ");
    }
  }

  // --- Swordcraft ---------------------------------------------------------
  if (cardName === "gelt, intrepid vice-captain") {
    const effect = /if there'?s a super-evolved allied follower on the field, give all allied followers on the field \+1\/\+1\.?/i;
    if (effect.test(text)) {
      let count = 0;
      if (ctx.player.board.some(unit => unit.type === "Follower" && unit.superEvolved)) {
        for (const unit of ctx.player.board.filter(unit => unit.type === "Follower")) { buff(unit, 1, 1); count += 1; }
      }
      actions.push(`Gelt: board +1/+1 ×${count}`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "rusty, luxcard trickster") {
    const effect = /draw all copies of rusty, luxcard trickster and give them storm\.?/i;
    if (effect.test(text)) {
      const copies = ctx.player.deck.filter(item => norm(item.card?.name) === cardName);
      ctx.player.deck = ctx.player.deck.filter(item => norm(item.card?.name) !== cardName);
      let drawn = 0;
      for (const item of copies) {
        item.grantedKeywords ??= [];
        if (!item.grantedKeywords.includes("Storm")) item.grantedKeywords.push("Storm");
        if (ctx.player.hand.length < 9) { ctx.player.hand.push(item); ctx.stats.draws[ctx.playerIndex] += 1; drawn += 1; }
        else { toCemetery(ctx.player, item, false); ctx.stats.cardsBurned[ctx.playerIndex] += 1; }
      }
      actions.push(`Rusty: draw ${drawn}/${copies.length} copies with Storm`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "seofon, leader of the eternals") {
    const effect = /Skybound Art\s*:\s*Evolve all unevolved allied followers on the field\.\s*Super Skybound Art\s*:\s*Super-evolve them instead\.?/i;
    if (effect.test(text)) {
      const gauge = skyboundCountForInstance(ctx);
      if (gauge >= 15) {
        for (const unit of [...ctx.player.board].filter(unit => unit.type === "Follower" && !unit.evolved && !unit.superEvolved)) superEvolveUnitByAbility(ctx, unit, actions);
      } else if (gauge >= 10) {
        for (const unit of [...ctx.player.board].filter(unit => unit.type === "Follower" && !unit.evolved && !unit.superEvolved)) evolveUnitByAbility(ctx, unit, actions);
      }
      actions.push(`Seofon: Skybound gauge ${gauge}`);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "golden knight, true king's blade") {
    const effect = /Super-evolve this follower\.?/i;
    if (effect.test(text)) {
      if (ctx.sourceUnit) superEvolveUnitByAbility(ctx, ctx.sourceUnit, actions);
      text = text.replace(effect, " ");
    }
  }

  if (cardName === "oluon, raging chariot") {
    const effect = /if this follower is unevolved, deal 7 damage to all enemy followers\.\s*If it'?s evolved, do this 3 times:\s*["“]Deal 7 damage to another random ally or enemy\.["”]/i;
    if (effect.test(text)) {
      if (ctx.sourceUnit?.evolved || ctx.sourceUnit?.superEvolved) {
        for (let i = 0; i < 3; i += 1) {
          const pool = [
            ...ctx.player.board.filter(unit => unit.type === "Follower" && unit.uid !== ctx.sourceUnit?.uid && unit.defense > 0).map(unit => ({ owner: ctx.player, unit })),
            ...ctx.opponent.board.filter(unit => unit.type === "Follower" && unit.defense > 0).map(unit => ({ owner: ctx.opponent, unit }))
          ];
          if (!pool.length) break;
          const picked = pool[Math.floor(ctx.rng() * pool.length)];
          damageUnit(picked.unit, 7, picked.owner, picked.owner === ctx.player ? ctx.opponent : ctx.player, ctx, actions);
        }
      } else {
        for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, 7, ctx.opponent, ctx.player, ctx, actions);
      }
      actions.push(`Oluon: ${ctx.sourceUnit?.evolved || ctx.sourceUnit?.superEvolved ? "3 random 7-damage hits" : "7 damage all enemies"}`);
      text = text.replace(effect, " ");
    }
  }

'''
text = text.replace(anchor, preflight, 1)

# Persistent marked-unit lifecycle processing. Lymaga curses trigger at every
# turn end on either board; Damus only at the marked unit owner's turn end.
turn_anchor = '''function turnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];'''
turn_new = '''function turnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  // [[battle-high-risk-marked-turn-end]]
  for (const [owner, other, ownerIndex, otherIndex] of [[player, opponent, playerIndex, enemyIndex], [opponent, player, enemyIndex, playerIndex]]) {
    for (const unit of [...owner.board].filter(unit => unit.type === "Follower" && unit.highRiskLymagaEndTurnCurse)) {
      damageLeader(owner, 1);
      damageUnit(unit, 2, owner, other, { player: other, opponent: owner, playerIndex: otherIndex, enemyIndex: ownerIndex, stats, rng, cardMap: map }, actions);
      actions.push(`Lymaga curse: 1 leader + 2 ${unit.name}`);
    }
  }
  for (const unit of [...player.board].filter(unit => unit.type === "Follower" && unit.highRiskDestroyAtOwnTurnEnd)) {
    actions.push(...destroyObject(player, opponent, unit, playerIndex, enemyIndex, stats, rng, map, true));
    actions.push(`delayed own-turn destroy ${unit.name}`);
  }'''
if turn_anchor not in text:
    raise SystemExit("Missing turnEnd anchor")
text = text.replace(turn_anchor, turn_new, 1)

ENGINE.write_text(text, encoding="utf-8")
print("Materialized remaining generic high-risk card rules.")
