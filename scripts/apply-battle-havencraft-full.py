from pathlib import Path

ENGINE = Path('js/battle-engine-v5.js')
text = ENGINE.read_text(encoding='utf-8')


def once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'Missing Havencraft anchor: {label}')
    text = text.replace(old, new, 1)

# 19 strict class-gap overrides, each backed by check-battle-havencraft-full.mjs.
once('''  ["astaroth's reckoning", "Enemy max-defense set-to-1 effect is modeled"]
]);''', '''  ["astaroth's reckoning", "Enemy max-defense set-to-1 effect is modeled"],
  // [[battle-havencraft-final-full-overrides]]
  ["bouquet believer", "Own-turn draw reaction granting Rush is modeled"],
  ["tikoh, asclepian surgeon", "Amulet-Engage leader healing reaction and Evolve damage are modeled"],
  ["devotee of repose", "Countdown 4 no-attack end-turn attack reduction/Ward Crest is modeled"],
  ["mainyu, darkdweller", "Amulet-Engage temporary attack reaction is modeled"],
  ["torrent of despair", "Random enemy banish and all-Crest delay are modeled"],
  ["temple of repose", "Crest-count Engage advance, Countdown and leader-Barrier Last Words are modeled"],
  ["troue, heroic visionary", "Amulet-Engage Drain reaction is modeled"],
  ["shining disenchantment", "Crest-count Engage advance and split-damage/heal Last Words are modeled"],
  ["skyfaring vessel", "Amulet-Engage hand discount and Engage self-destroy/evolution are modeled"],
  ["marwynn, despair manifest", "Persistent no-attack split-damage Crest and Torrent generation are modeled"],
  ["maddening benison", "Countdown 2 self-damage Last Words Crest is modeled"],
  ["congregant of repose", "Countdown 4 no-attack defense-4 follower draw Crest is modeled"],
  ["desperate shrinemouse", "Own-turn draw board-damage reaction and Evolve Fanfare replication are modeled"],
  ["saint of rehabilitation", "Leader-heal Fox summon reaction and Evolve/Super-Evolve replication are modeled"],
  ["zoe, dazzling hope", "Three Fanfare Modes and Countdown 1 resummon/evolve Crest are modeled"],
  ["himeka, heir to repose", "Countdown 4 board-lock Crest and Super-Evolve attack setting are modeled"],
  ["viche, abyssal researcher", "Permanent in-hand -3 cost per allied Super-Evolution is modeled"],
  ["kukishiro, mistbloom", "Draw-cost ally/enemy summon Crest and hand-return/draw Fanfare are modeled"],
  ["lyanthoth, eld tome", "Amulet-destruction Faith, three-card Fanfare and end-turn Faith payment are modeled"]
]);''', 'full overrides')

# Strip exact reactive clauses that are dispatched by events below.
once('''  /Whenever another allied follower with a base cost of 5 or more enters the field, evolve it\\.?/gi,
  // [[battle-neutral-reactive-clauses]]''', '''  /Whenever another allied follower with a base cost of 5 or more enters the field, evolve it\\.?/gi,
  // [[battle-havencraft-final-reactive-clauses]]
  /During your turn, whenever you draw a card, give this follower Rush\\.?/gi,
  /Whenever you Engage an amulet, restore 1 defense to your leader\\.?/gi,
  /Whenever you Engage an amulet, give this follower \\+1\\/\\+0 until the end of the turn\\.?/gi,
  /Whenever you Engage an amulet, give this follower Drain\\.?/gi,
  /Activates in hand\\. Whenever you Engage an amulet, reduce the cost of this card by 1\\.?/gi,
  /During your turn, whenever you draw a card, deal 1 damage to all enemy followers\\.?/gi,
  /During your turn, whenever your leader'?s defense is restored, summon a Fox of Purity\\.?/gi,
  /Activates in hand\\. Whenever an allied follower super-evolves, reduce the cost of this card by 3\\.?/gi,
  // [[battle-neutral-reactive-clauses]]''', 'reactive sanitization')

# Havencraft Faith is amulet-destruction based, not the generic Enhance Faith.
once('''    abyssFaithActive: false, abyssFaithModeBonus: 0, crests: [], bonusPpAvailable: false, bonusPpUses: 0,
    leaderDamageCap: null, leaderDamageCapUntilOpponentTurnEnd: false,''', '''    abyssFaithActive: false, abyssFaithModeBonus: 0, havenFaithActive: false, crests: [], bonusPpAvailable: false, bonusPpUses: 0,
    leaderDamageCap: null, leaderDamageCapUntilOpponentTurnEnd: false, leaderBarrier: 0,''', 'player state')
once('''  player.faithActive = player.deck.some(item => (has(item.card, "Faith") && norm(item.card?.class) !== "abysscraft")
    || ["yidmetra, eld sword", "calge-danthla, eld crystals"].includes(norm(item.card?.name)));
  // Abysscraft Faith counts Mode-selection events rather than Enhanced-card events.''', '''  player.faithActive = player.deck.some(item => (has(item.card, "Faith") && !["abysscraft", "havencraft"].includes(norm(item.card?.class)))
    || ["yidmetra, eld sword", "calge-danthla, eld crystals"].includes(norm(item.card?.name)));
  // Havencraft Lyanthoth Faith increments only when allied amulets are destroyed.
  player.havenFaithActive = player.deck.some(item => norm(item.card?.name) === "lyanthoth, eld tome");
  // Abysscraft Faith counts Mode-selection events rather than Enhanced-card events.''', 'faith init')

# Leader Barrier is a true one-instance guard, including direct self-damage.
once('''      if (next < value && Number.isFinite(player.leaderDamageCap)) {
        const requestedLoss = value - next;
        value -= Math.min(requestedLoss, Math.max(0, Number(player.leaderDamageCap) || 0));
        return;
      }
      value = next;''', '''      if (next < value && (Number(player.leaderBarrier) || 0) > 0) {
        player.leaderBarrier = 0;
        return;
      }
      if (next < value && Number.isFinite(player.leaderDamageCap)) {
        const requestedLoss = value - next;
        value -= Math.min(requestedLoss, Math.max(0, Number(player.leaderDamageCap) || 0));
        return;
      }
      value = next;''', 'leader barrier')

# Bind a non-enumerable active-turn context so every draw path can dispatch
# Kukishiro/Bouquet/Shrinemouse exactly, including natural turn draws.
once('''function turnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  for (const unit of player.board) if (unit.type === "Follower") unit.reactedThisTurn = false;''', '''function turnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  bindHavencraftRuntime(player, opponent, playerIndex, enemyIndex, stats, rng, map);
  for (const unit of player.board) if (unit.type === "Follower") unit.reactedThisTurn = false;''', 'turn runtime')

# Every successful draw, burned or not, is still a draw event.
once('''    if (player.hand.length >= 9) {
      toCemetery(player, item, false);
      stats.cardsBurned[index] += 1;
    } else player.hand.push(item);
  }
  return drawn;
}''', '''    if (player.hand.length >= 9) {
      toCemetery(player, item, false);
      stats.cardsBurned[index] += 1;
    } else player.hand.push(item);
    applyHavencraftDrawTriggers(player, item);
  }
  return drawn;
}''', 'draw cards hook')
once('''  if (player.hand.length >= 9) {
    toCemetery(player, item, false);
    stats.cardsBurned[index] += 1;
    return item;
  }
  player.hand.push(item);
  return item;
}''', '''  if (player.hand.length >= 9) {
    toCemetery(player, item, false);
    stats.cardsBurned[index] += 1;
    applyHavencraftDrawTriggers(player, item);
    return item;
  }
  player.hand.push(item);
  applyHavencraftDrawTriggers(player, item);
  return item;
}''', 'filtered draw hook')

# Amulet destruction grows Lyanthoth Faith regardless of destruction source.
once('''function destroyObject(player, opponent, unit, playerIndex, enemyIndex, stats, rng, map, lastWordsEnabled) {
  // [[battle-runecraft-shikigami-destroyed-object]]''', '''function destroyObject(player, opponent, unit, playerIndex, enemyIndex, stats, rng, map, lastWordsEnabled) {
  // [[battle-havencraft-faith-amulet-destroyed]]
  if (unit?.type === "Amulet" && player.havenFaithActive) player.faith = (Number(player.faith) || 0) + 1;
  // [[battle-runecraft-shikigami-destroyed-object]]''', 'faith destroy hook')

# Engage event dispatch for all five Haven reactions.
once('''  // [[battle-haven-griffon-engage]]
  const reactions = [];
  for (const follower of player.board.filter(item => item.type === "Follower" && norm(item.name) === "sacred griffon")) {''', '''  // [[battle-haven-griffon-engage]]
  const reactions = [];
  const engageCtx = { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map };
  reactions.push(...applyHavencraftEngageTriggers(engageCtx));
  for (const follower of player.board.filter(item => item.type === "Follower" && norm(item.name) === "sacred griffon")) {''', 'engage dispatch')

# Viche discounts on both manual and ability Super-Evolution events.
once('''  // [[battle-dragoncraft-manual-super-evolve-event]]
  if (superMode) actions.push(...applyDragoncraftSuperEvolveHandTriggers(player, unit));
  // [[battle-abysscraft-manual-super-evolve-event]]''', '''  // [[battle-dragoncraft-manual-super-evolve-event]]
  if (superMode) actions.push(...applyDragoncraftSuperEvolveHandTriggers(player, unit));
  // [[battle-havencraft-manual-super-evolve-event]]
  if (superMode) actions.push(...applyHavencraftSuperEvolveHandTriggers(player));
  // [[battle-abysscraft-manual-super-evolve-event]]''', 'manual super evolve')
once('''  // [[battle-dragoncraft-ability-super-evolve-event]]
  actions.push(...applyDragoncraftSuperEvolveHandTriggers(ctx.player, unit));
  // [[battle-abysscraft-ability-super-evolve-event]]''', '''  // [[battle-dragoncraft-ability-super-evolve-event]]
  actions.push(...applyDragoncraftSuperEvolveHandTriggers(ctx.player, unit));
  // [[battle-havencraft-ability-super-evolve-event]]
  actions.push(...applyHavencraftSuperEvolveHandTriggers(ctx.player));
  // [[battle-abysscraft-ability-super-evolve-event]]''', 'ability super evolve')

# Exact Haven resolver runs before Neutral and class-specific handlers.
once('''  // [[battle-neutral-resolve-text]]
  const neutral = resolveNeutralCardText(text, ctx);''', '''  // [[battle-havencraft-final-resolve-text]]
  const havencraft = resolveHavencraftCardText(text, ctx);
  text = havencraft.text;
  actions.push(...havencraft.actions);

  // [[battle-neutral-resolve-text]]
  const neutral = resolveNeutralCardText(text, ctx);''', 'resolver dispatch')

# Crest countdowns.
once('''  if (normalized === "supplicant of repose") return 4;
  if (normalized === "lapis, shining seraph") return 2;''', '''  if (normalized === "supplicant of repose") return 4;
  if (normalized === "lapis, shining seraph") return 2;
  // [[battle-havencraft-final-crest-countdowns]]
  if (normalized === "devotee of repose") return 4;
  if (normalized === "maddening benison") return 2;
  if (normalized === "congregant of repose") return 4;
  if (normalized === "zoe, dazzling hope") return 1;
  if (normalized === "himeka, heir to repose") return 4;''', 'crest countdowns')

# Haven Crest Last Words.
once('''    // [[battle-neutral-crest-last-words]]
    if (neutralCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;
    if (norm(crest.name) !== "lapis, shining seraph") continue;''', '''    // [[battle-neutral-crest-last-words]]
    if (neutralCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;
    // [[battle-havencraft-final-crest-last-words]]
    if (havencraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;
    if (norm(crest.name) !== "lapis, shining seraph") continue;''', 'crest last words')

# Persistent Haven Crests at turn end + timed Himeka banish.
once('''  // [[battle-neutral-crest-turn-end]]
  actions.push(...applyNeutralCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  for (const crest of player.crests ?? []) {''', '''  // [[battle-neutral-crest-turn-end]]
  actions.push(...applyNeutralCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  // [[battle-havencraft-final-crest-turn-end]]
  actions.push(...applyHavencraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  for (const crest of player.crests ?? []) {''', 'crest turn end')
once('''  // [[battle-neutral-illamrita-end-banish]]
  actions.push(...applyNeutralMarkedEndTurnBanish(player));
  actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map),''', '''  // [[battle-neutral-illamrita-end-banish]]
  actions.push(...applyNeutralMarkedEndTurnBanish(player));
  // [[battle-havencraft-himeka-end-banish]]
  actions.push(...applyHavencraftMarkedEndTurnBanish(player));
  actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map),''', 'timed banish')

# Mainyu's temporary attack is restored with other one-turn attack modifiers.
once('''    if (unit.dragoncraftTempAttackBonus) {
      unit.attack = Math.max(0, unit.attack - unit.dragoncraftTempAttackBonus);
      unit.dragoncraftTempAttackBonus = 0;
    }
  }
}''', '''    if (unit.dragoncraftTempAttackBonus) {
      unit.attack = Math.max(0, unit.attack - unit.dragoncraftTempAttackBonus);
      unit.dragoncraftTempAttackBonus = 0;
    }
    if (unit.havencraftTempAttackBonus) {
      unit.attack = Math.max(0, unit.attack - unit.havencraftTempAttackBonus);
      unit.havencraftTempAttackBonus = 0;
    }
  }
}''', 'temporary attack restore')

haven_rules = r'''

// [[battle-havencraft-final-full-rules]]
function bindHavencraftRuntime(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const value = { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map };
  if (Object.prototype.hasOwnProperty.call(player, "__havencraftRuntime")) player.__havencraftRuntime = value;
  else Object.defineProperty(player, "__havencraftRuntime", { value, writable: true, configurable: true, enumerable: false });
}

function applyHavencraftDrawTriggers(player, item) {
  const ctx = player?.__havencraftRuntime;
  if (!ctx || !player.isActive || !item?.card) return [];
  const actions = [];
  for (const unit of [...player.board].filter(unit => unit.type === "Follower")) {
    const name = norm(unit.name);
    if (name === "bouquet believer") {
      giveKeyword(unit, "Rush");
      actions.push("Bouquet Believer: gain Rush");
    }
    if (name === "desperate shrinemouse") {
      for (const enemy of [...ctx.opponent.board].filter(target => target.type === "Follower")) damageUnit(enemy, 1, ctx.opponent, player, ctx, actions);
      actions.push("Desperate Shrinemouse: 1 damage to all enemy followers");
    }
  }
  const kukishiro = (player.crests ?? []).find(crest => norm(crest.name) === "kukishiro, mistbloom");
  const cost = Math.max(0, Number(item.card.cost) || 0);
  if (kukishiro && cost >= 1 && cost <= 6) {
    const names = ["Fox of Purity", "Holy Falcon"];
    const token = findByName(ctx.cardMap, names[Math.floor(ctx.rng() * names.length)]) ?? findByName(ctx.cardMap, names[0]);
    if (token) {
      if (cost % 2 === 1) {
        const count = summonWithEvents(player, token, 1, ctx.playerIndex, ctx);
        actions.push(`Kukishiro Crest: summon ${count ? token.name : "no allied follower"}`);
      } else {
        const enemyCtx = { ...ctx, player: ctx.opponent, opponent: player, playerIndex: ctx.enemyIndex, enemyIndex: ctx.playerIndex };
        const count = summonWithEvents(ctx.opponent, token, 1, ctx.enemyIndex, enemyCtx);
        actions.push(`Kukishiro Crest: summon enemy ${count ? token.name : "no follower"}`);
      }
    }
  }
  actions.push(...cleanup(ctx.opponent, player, ctx.enemyIndex, ctx.playerIndex, ctx.stats, ctx.rng, ctx.cardMap));
  return uniq(actions);
}

function applyHavencraftEngageTriggers(ctx) {
  const actions = [];
  for (const unit of ctx.player.board.filter(unit => unit.type === "Follower")) {
    const name = norm(unit.name);
    if (name === "tikoh, asclepian surgeon") {
      const healed = healPlayer(ctx.player, 1, ctx.stats, ctx.playerIndex);
      actions.push(`Tikoh: restore ${healed} leader defense`);
      if (healed) actions.push(...afterLeaderHeal(ctx.player, healed, ctx.stats, ctx.playerIndex));
    }
    if (name === "mainyu, darkdweller") {
      unit.attack += 1;
      unit.havencraftTempAttackBonus = (Number(unit.havencraftTempAttackBonus) || 0) + 1;
      actions.push("Mainyu: +1/+0 this turn");
    }
    if (name === "troue, heroic visionary") {
      giveKeyword(unit, "Drain");
      actions.push("Troue: gain Drain");
    }
  }
  for (const item of ctx.player.hand ?? []) {
    if (norm(item.card?.name) !== "skyfaring vessel") continue;
    item.costDelta = (Number(item.costDelta) || 0) - 1;
    actions.push("Skyfaring Vessel: cost -1");
  }
  return uniq(actions);
}

function applyHavencraftSuperEvolveHandTriggers(player) {
  const actions = [];
  for (const item of player.hand ?? []) {
    if (norm(item.card?.name) !== "viche, abyssal researcher") continue;
    item.costDelta = (Number(item.costDelta) || 0) - 3;
    actions.push("Viche, Abyssal Researcher: cost -3");
  }
  return actions;
}

function applyHavencraftMarkedEndTurnBanish(player) {
  const actions = [];
  for (const unit of [...(player.board ?? [])]) {
    if (!unit.himekaBanishAtOwnTurnEnd) continue;
    banish(player, unit);
    actions.push(`Himeka: banish ${unit.name} at end of its controller's turn`);
  }
  return actions;
}

function dealHavenSplitDamage(ctx, amount, actions, label) {
  let remaining = Math.max(0, Number(amount) || 0);
  const original = remaining;
  while (remaining > 0) {
    const followers = ctx.opponent.board.filter(unit => unit.type === "Follower");
    const slots = followers.length + 1;
    const pick = Math.floor(ctx.rng() * slots);
    if (pick >= followers.length) {
      const dealt = damageLeader(ctx.opponent, 1);
      ctx.stats.damageDealt[ctx.playerIndex] += dealt;
    } else damageUnit(followers[pick], 1, ctx.opponent, ctx.player, ctx, actions);
    remaining -= 1;
    actions.push(...cleanup(ctx.opponent, ctx.player, ctx.enemyIndex, ctx.playerIndex, ctx.stats, ctx.rng, ctx.cardMap));
  }
  actions.push(`${label}: ${original} split damage`);
}

function drawDefenseFourFollower(ctx) {
  return drawMatchingCard(ctx.player, card => card.type === "Follower" && Number(card.defense) === 4, ctx.stats, ctx.playerIndex, ctx.rng);
}

function havencraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions) {
  const name = norm(crest?.name);
  if (name === "maddening benison") {
    const before = player.hp;
    player.hp -= 10;
    actions.push(`Maddening Benison Crest Last Words: ${Math.max(0, before - player.hp)} damage to your leader`);
    return true;
  }
  if (name === "zoe, dazzling hope") {
    if (player.board.length >= 5) { actions.push("Zoe Crest: field full"); return true; }
    const card = crest.card ?? findByName(map, "Zoe, Dazzling Hope");
    if (!card) return true;
    const unit = boardFollower(instance(player, card));
    player.board.push(unit); player.rally += 1;
    const ctx = { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map };
    actions.push("Zoe Crest: summon Zoe");
    actions.push(...applyEntryEvents(ctx, unit));
    evolveUnitByAbility(ctx, unit, actions);
    return true;
  }
  return false;
}

function applyHavencraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  const ctx = { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map };
  for (const crest of player.crests ?? []) {
    const name = norm(crest.name);
    if (name === "devotee of repose" && !player.followersAttackedThisTurn) {
      const candidates = player.board.filter(unit => unit.type === "Follower");
      if (candidates.length) {
        const unit = candidates[Math.floor(rng() * candidates.length)];
        unit.attack = Math.max(0, unit.attack - 2);
        giveKeyword(unit, "Ward");
        actions.push(`Devotee Crest: -2/-0 and Ward ${unit.name}`);
      }
    }
    if (name === "marwynn, despair manifest" && !player.followersAttackedThisTurn) {
      dealHavenSplitDamage(ctx, (player.crests ?? []).length, actions, "Marwynn Crest");
    }
    if (name === "congregant of repose" && !player.followersAttackedThisTurn) {
      const drawn = drawDefenseFourFollower(ctx);
      actions.push(`Congregant Crest: draw ${drawn?.card?.name ?? "no defense-4 follower"}`);
    }
    if (name === "himeka, heir to repose" && player.board.some(unit => norm(unit.name) === "himeka, heir to repose")) {
      let eligible = opponent.board.filter(unit => unit.type === "Follower" && Number(unit.attack) <= 4 && !unit.himekaBanishAtOwnTurnEnd);
      let count = Math.min((player.crests ?? []).length, eligible.length);
      while (count-- > 0 && eligible.length) {
        const index = Math.floor(rng() * eligible.length);
        const unit = eligible.splice(index, 1)[0];
        unit.permanentAttackLock = true;
        unit.canAttackLeader = false;
        unit.canAttackFollower = false;
        unit.himekaBanishAtOwnTurnEnd = true;
        actions.push(`Himeka Crest: lock ${unit.name}`);
      }
    }
  }
  return uniq(actions);
}

function resolveHavencraftCardText(raw, ctx) {
  let text = String(raw ?? "").trim();
  const actions = [];
  const name = norm(ctx.card?.name);

  if (name === "torrent of despair") {
    const banishClause = /Banish a random enemy follower from the field\.?/i;
    if (banishClause.test(text)) {
      const target = chooseRandomTarget(ctx.opponent.board, ctx.rng);
      if (target) { banish(ctx.opponent, target); actions.push(`Torrent of Despair: banish ${target.name}`); }
      text = text.replace(banishClause, " ");
    }
    const delay = /Delay the counts of all your crests by 1\.?/i;
    if (delay.test(text)) {
      let count = 0;
      for (const crest of ctx.player.crests ?? []) if (Number.isFinite(crest.countdown)) { crest.countdown += 1; count += 1; }
      actions.push(`Torrent of Despair: delay ${count} Crest${count === 1 ? "" : "s"}`);
      text = text.replace(delay, " ");
    }
  }

  if (name === "temple of repose" || name === "shining disenchantment") {
    const engageAdvance = /Advance this amulet'?s count by X\.\s*X is the number of crests you have\.?/i;
    if (engageAdvance.test(text) && ctx.sourceUnit) {
      const amount = (ctx.player.crests ?? []).length;
      if (Number.isFinite(ctx.sourceUnit.countdown)) ctx.sourceUnit.countdown -= amount;
      actions.push(`${ctx.card.name}: advance count by ${amount}`);
      text = text.replace(engageAdvance, " ");
      if (ctx.sourceUnit.countdown <= 0 && ctx.player.board.includes(ctx.sourceUnit)) actions.push(...destroyObject(ctx.player, ctx.opponent, ctx.sourceUnit, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true));
    }
    if (name === "temple of repose") {
      const lw = /Restore 2 defense to your leader\.\s*Give your leader Barrier\.?/i;
      if (lw.test(text)) {
        const healed = healPlayer(ctx.player, 2, ctx.stats, ctx.playerIndex);
        if (healed) actions.push(...afterLeaderHeal(ctx.player, healed, ctx.stats, ctx.playerIndex));
        ctx.player.leaderBarrier = 1;
        actions.push(`Temple of Repose: restore ${healed} and leader Barrier`);
        text = text.replace(lw, " ");
      }
    } else {
      const lw = /Deal 4 damage split between all enemies\.\s*Restore 4 defense to your leader\.?/i;
      if (lw.test(text)) {
        dealHavenSplitDamage(ctx, 4, actions, "Shining Disenchantment");
        const healed = healPlayer(ctx.player, 4, ctx.stats, ctx.playerIndex);
        if (healed) actions.push(...afterLeaderHeal(ctx.player, healed, ctx.stats, ctx.playerIndex));
        actions.push(`Shining Disenchantment: restore ${healed}`);
        text = text.replace(lw, " ");
      }
    }
  }

  if (name === "skyfaring vessel") {
    const engage = /Destroy this card\.\s*Select an unevolved allied follower on the field and evolve it\.?/i;
    if (engage.test(text) && ctx.sourceUnit) {
      const candidates = ctx.player.board.filter(unit => unit.type === "Follower" && !unit.evolved && !unit.superEvolved);
      if (ctx.player.board.includes(ctx.sourceUnit)) actions.push(...destroyObject(ctx.player, ctx.opponent, ctx.sourceUnit, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true));
      const target = candidates.sort((a,b)=>(Number(b.attack)+Number(b.defense))-(Number(a.attack)+Number(a.defense)))[0] ?? null;
      if (target) evolveUnitByAbility(ctx, target, actions);
      text = text.replace(engage, " ");
    }
  }

  if (name === "himeka, heir to repose") {
    const clause = /Set the attack of all enemy followers on the field to 4\.?/i;
    if (clause.test(text)) {
      for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) unit.attack = 4;
      actions.push("Himeka: set all enemy follower attack to 4");
      text = text.replace(clause, " ");
    }
  }

  if (name === "kukishiro, mistbloom") {
    const crest = /Gain Crest:\s*Kukishiro, Mistbloom\.?/i;
    if (crest.test(text)) {
      if (gainCrest(ctx.player, "Kukishiro, Mistbloom", ctx.card)) actions.push("Crest: Kukishiro, Mistbloom");
      text = text.replace(crest, " ");
    }
    const cycle = /Return 2 random cards from your hand to deck\.\s*Draw 2 cards\.?/i;
    if (cycle.test(text)) {
      const returned = [];
      for (let i = 0; i < 2 && ctx.player.hand.length; i += 1) {
        const index = Math.floor(ctx.rng() * ctx.player.hand.length);
        const item = ctx.player.hand.splice(index, 1)[0];
        ctx.player.deck.push(item); returned.push(item.card.name);
      }
      shuffle(ctx.player.deck, ctx.rng);
      const drawn = drawCards(ctx.player, 2, ctx.stats, ctx.playerIndex);
      actions.push(`Kukishiro: return ${returned.length}, draw ${drawn}`);
      text = text.replace(cycle, " ");
    }
  }

  if (name === "lyanthoth, eld tome") {
    ctx.player.havenFaithActive = true;
    const fanfare = /Select 3 other cards on the field and destroy them\.?/i;
    if (fanfare.test(text)) {
      const enemy = ctx.opponent.board.map(unit => ({ owner: ctx.opponent, unit, enemy: true })).sort((a,b)=>(Number(b.unit.attack)+Number(b.unit.defense))-(Number(a.unit.attack)+Number(a.unit.defense)));
      const allied = ctx.player.board.filter(unit => unit !== ctx.sourceUnit).map(unit => ({ owner: ctx.player, unit, enemy: false })).sort((a,b)=>(Number(a.unit.attack)+Number(a.unit.defense))-(Number(b.unit.attack)+Number(b.unit.defense)));
      const selected = [...enemy, ...allied].slice(0, 3);
      for (const entry of selected) actions.push(...destroyObject(entry.owner, entry.owner === ctx.player ? ctx.opponent : ctx.player, entry.unit, entry.owner === ctx.player ? ctx.playerIndex : ctx.enemyIndex, entry.owner === ctx.player ? ctx.enemyIndex : ctx.playerIndex, ctx.stats, ctx.rng, ctx.cardMap, true));
      actions.push(`Lyanthoth: destroy ${selected.length} other cards`);
      text = text.replace(fanfare, " ");
    }
    const payment = /reduce your faith'?s value by 10 to add a Depths of the Eld Tome to your hand\.?/i;
    if (payment.test(text)) {
      if ((Number(ctx.player.faith) || 0) >= 10) {
        ctx.player.faith -= 10;
        const token = findByName(ctx.cardMap, "Depths of the Eld Tome") ?? related(ctx.card, ctx.cardMap).find(card => norm(card.name) === "depths of the eld tome");
        const added = token ? addHand(ctx.player, token, 1, ctx.playerIndex, ctx.stats) : 0;
        if (added) ctx.stats.cardsGenerated[ctx.playerIndex] += added;
        actions.push(`Lyanthoth: Faith -10 · add ${added ? "Depths of the Eld Tome" : "no card"}`);
      } else actions.push(`Lyanthoth: Faith ${ctx.player.faith}/10`);
      text = text.replace(payment, " ");
    }
  }

  if (name === "depths of the eld tome") {
    const clause = /Select a card on the field and destroy it\.\s*If you selected an allied amulet, deal 2 damage to the enemy leader and add a Depths of the Eld Tome to your hand\.?/i;
    if (clause.test(text)) {
      const alliedAmulet = ctx.player.board.find(unit => unit.type === "Amulet") ?? null;
      const enemy = choosePlannedTarget(ctx, ctx.opponent.board);
      const target = alliedAmulet ?? enemy ?? ctx.player.board.find(unit => unit !== ctx.sourceUnit) ?? null;
      if (target) {
        const owner = ctx.player.board.includes(target) ? ctx.player : ctx.opponent;
        const wasAlliedAmulet = owner === ctx.player && target.type === "Amulet";
        actions.push(...destroyObject(owner, owner === ctx.player ? ctx.opponent : ctx.player, target, owner === ctx.player ? ctx.playerIndex : ctx.enemyIndex, owner === ctx.player ? ctx.enemyIndex : ctx.playerIndex, ctx.stats, ctx.rng, ctx.cardMap, true));
        if (wasAlliedAmulet) {
          const dealt = damageLeader(ctx.opponent, 2); ctx.stats.damageDealt[ctx.playerIndex] += dealt;
          const token = findByName(ctx.cardMap, "Depths of the Eld Tome") ?? ctx.card;
          const added = addHand(ctx.player, token, 1, ctx.playerIndex, ctx.stats); if (added) ctx.stats.cardsGenerated[ctx.playerIndex] += added;
          actions.push(`Depths of the Eld Tome: ${dealt} leader damage · add ${added ? "copy" : "no card"}`);
        }
      }
      text = text.replace(clause, " ");
    }
  }

  return { text: text.replace(/\s+/g, " ").trim(), actions: uniq(actions) };
}

'''
once('// [[battle-neutral-full-rules]]\n', haven_rules + '// [[battle-neutral-full-rules]]\n', 'haven rules block')

# Saint of Rehabilitation uses the universal heal callback. Keep Burnite's
# semantics, but dispatch Saint before early-returning when no Burnite Crest.
once('''function afterLeaderHeal(player, healed, stats, playerIndex) {
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
}''', '''function afterLeaderHeal(player, healed, stats, playerIndex) {
  if (!player.isActive) return [];
  const actions = [];
  if (healed && player.__havencraftRuntime) {
    const ctx = player.__havencraftRuntime;
    const fox = findByName(ctx.cardMap, "Fox of Purity");
    for (const source of [...player.board].filter(unit => unit.type === "Follower" && norm(unit.name) === "saint of rehabilitation")) {
      if (!fox || player.board.length >= 5) break;
      const count = summonWithEvents(player, fox, 1, playerIndex, ctx);
      actions.push(`Saint of Rehabilitation: summon ${count ? "Fox of Purity" : "no follower"}`);
    }
  }
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
}''', 'heal callback')

# QA helper keeps all 19 former gaps behavior-locked in one permanent class test.
qa = r'''

// [[battle-havencraft-final-full-qa]]
export function inspectHavencraftFullRules({ cards = [] } = {}) {
  const rawMap = new Map(cards.map(card => [Number(card.id), card]));
  const map = prepareSimulationCardMap(rawMap);
  const byName = name => findByName(map, name);
  const makePair = seed => {
    const rng = createRng(`havencraft-final-qa:${seed}`), stats = createStats();
    const player = makePlayer("You", [], {}, map, rng), opponent = makePlayer("Opponent", [], {}, map, rng);
    player.isActive = true; opponent.isActive = false; player.personalTurn = 6; opponent.personalTurn = 5; player.maxPp = player.pp = 10;
    bindHavencraftRuntime(player, opponent, 0, 1, stats, rng, map);
    return { rng, stats, player, opponent, ctx: () => ({ player, opponent, playerIndex: 0, enemyIndex: 1, stats, rng, cardMap: map }) };
  };
  const dummy = (name, cost=1, attack=1, defense=4, type="Follower") => ({ id:-940000-name.length, name, class:"Havencraft", type, cost, attack, defense, text:"", keywords:[], traits:[], relatedCards:[] });

  const drawQ = makePair("draw");
  const bouquet = boardFollower(instance(drawQ.player, byName("Bouquet Believer")));
  const mouse = boardFollower(instance(drawQ.player, byName("Desperate Shrinemouse")));
  const foe = boardFollower(instance(drawQ.opponent, dummy("Draw Foe",1,1,5)));
  drawQ.player.board=[bouquet,mouse]; drawQ.opponent.board=[foe]; drawQ.player.deck=[instance(drawQ.player,dummy("Drawn",2))];
  drawCards(drawQ.player,1,drawQ.stats,0);
  const drawTriggers={bouquetRush:hasU(bouquet,"Rush"),mouseDamage:5-foe.defense};

  const engageQ=makePair("engage"); engageQ.player.hp=10;
  const tikoh=boardFollower(instance(engageQ.player,byName("Tikoh, Asclepian Surgeon")));
  const mainyu=boardFollower(instance(engageQ.player,byName("Mainyu, Darkdweller")));
  const troue=boardFollower(instance(engageQ.player,byName("Troue, Heroic Visionary")));
  const sky=instance(engageQ.player,byName("Skyfaring Vessel")); engageQ.player.hand=[sky]; engageQ.player.board=[tikoh,mainyu,troue];
  applyHavencraftEngageTriggers(engageQ.ctx());
  const engageTriggers={heal:engageQ.player.hp-10,mainyu:mainyu.attack-Number(mainyu.card.attack||0),drain:hasU(troue,"Drain"),skyCost:costOf(sky)};
  restoreTemporaryAttack(engageQ.player);

  const devoteeQ=makePair("devotee");
  const devoteeTarget=boardFollower(instance(devoteeQ.player,dummy("Devotee Target",2,4,4))); devoteeQ.player.board=[devoteeTarget]; devoteeQ.player.followersAttackedThisTurn=false;
  gainCrest(devoteeQ.player,"Devotee of Repose",byName("Devotee of Repose")); applyHavencraftCrestTurnEnd(devoteeQ.player,devoteeQ.opponent,0,1,devoteeQ.stats,devoteeQ.rng,map);
  const devotee={attack:devoteeTarget.attack,ward:hasU(devoteeTarget,"Ward")};

  const torrentQ=makePair("torrent"); torrentQ.opponent.board=[boardFollower(instance(torrentQ.opponent,dummy("Torrent Target")))]; gainCrest(torrentQ.player,"Devotee of Repose",byName("Devotee of Repose"));
  const tcrest=torrentQ.player.crests[0], beforeDelay=tcrest.countdown;
  resolveHavencraftCardText("Banish a random enemy follower from the field. Delay the counts of all your crests by 1.",{...torrentQ.ctx(),card:byName("Torrent of Despair")});
  const torrent={enemy:torrentQ.opponent.board.length,delay:tcrest.countdown-beforeDelay};

  const templeQ=makePair("temple"); templeQ.player.hp=10; gainCrest(templeQ.player,"Devotee of Repose",byName("Devotee of Repose"));
  const temple=boardAmulet(instance(templeQ.player,byName("Temple of Repose"))); temple.countdown=1; templeQ.player.board=[temple];
  resolveHavencraftCardText("Advance this amulet's count by X. X is the number of crests you have.",{...templeQ.ctx(),card:temple.card,sourceUnit:temple});
  const templeResult={gone:!templeQ.player.board.includes(temple),hp:templeQ.player.hp,barrier:templeQ.player.leaderBarrier};

  const shiningQ=makePair("shining"); shiningQ.player.hp=10; shiningQ.opponent.hp=20;
  const shiningFoe=boardFollower(instance(shiningQ.opponent,dummy("Shining Foe",1,1,10))); shiningQ.opponent.board=[shiningFoe];
  resolveHavencraftCardText("Deal 4 damage split between all enemies. Restore 4 defense to your leader.",{...shiningQ.ctx(),card:byName("Shining Disenchantment")});
  const shining={totalDamage:(20-shiningQ.opponent.hp)+(10-shiningFoe.defense),heal:shiningQ.player.hp-10};

  const skyQ=makePair("sky"); const evolveTarget=boardFollower(instance(skyQ.player,dummy("Sky Evolve",2,2,2))); const skyAmulet=boardAmulet(instance(skyQ.player,byName("Skyfaring Vessel"))); skyQ.player.board=[skyAmulet,evolveTarget];
  resolveHavencraftCardText("Destroy this card. Select an unevolved allied follower on the field and evolve it.",{...skyQ.ctx(),card:skyAmulet.card,sourceUnit:skyAmulet});
  const skyEngage={destroyed:!skyQ.player.board.includes(skyAmulet),evolved:evolveTarget.evolved};

  const marQ=makePair("marwynn"); marQ.player.followersAttackedThisTurn=false; marQ.opponent.hp=20; gainCrest(marQ.player,"Marwynn, Despair Manifest",byName("Marwynn, Despair Manifest")); gainCrest(marQ.player,"Supplicant of Repose",byName("Supplicant of Repose"));
  applyHavencraftCrestTurnEnd(marQ.player,marQ.opponent,0,1,marQ.stats,marQ.rng,map); const marwynnDamage=20-marQ.opponent.hp;

  const benQ=makePair("benison"); benQ.player.hp=20; gainCrest(benQ.player,"Maddening Benison",byName("Maddening Benison")); const ben=benQ.player.crests[0]; ben.countdown=1; ben.gainedTurn=0; tickCrests(benQ.player,benQ.opponent,0,1,benQ.stats,benQ.rng,map,[]); const benisonHp=benQ.player.hp;

  const conQ=makePair("congregant"); conQ.player.followersAttackedThisTurn=false; conQ.player.deck=[instance(conQ.player,dummy("Defense Four",3,2,4)),instance(conQ.player,dummy("Defense Five",3,2,5))]; gainCrest(conQ.player,"Congregant of Repose",byName("Congregant of Repose")); applyHavencraftCrestTurnEnd(conQ.player,conQ.opponent,0,1,conQ.stats,conQ.rng,map); const congregantDraw=conQ.player.hand[0]?.card.name??null;

  const saintQ=makePair("saint"); saintQ.player.hp=10; const saint=boardFollower(instance(saintQ.player,byName("Saint of Rehabilitation"))); saintQ.player.board=[saint]; const healed=healPlayer(saintQ.player,1,saintQ.stats,0); afterLeaderHeal(saintQ.player,healed,saintQ.stats,0); const saintFox=saintQ.player.board.filter(u=>norm(u.name)==="fox of purity").length;

  const zoeQ=makePair("zoe"); gainCrest(zoeQ.player,"Zoe, Dazzling Hope",byName("Zoe, Dazzling Hope")); const zc=zoeQ.player.crests[0]; zc.countdown=1; zc.gainedTurn=0; tickCrests(zoeQ.player,zoeQ.opponent,0,1,zoeQ.stats,zoeQ.rng,map,[]); const zoe=zoeQ.player.board.find(u=>norm(u.name)==="zoe, dazzling hope"); const zoeCrest={summoned:Boolean(zoe),evolved:Boolean(zoe?.evolved)};

  const himeQ=makePair("himeka"); const hime=boardFollower(instance(himeQ.player,byName("Himeka, Heir to Repose"))); himeQ.player.board=[hime]; himeQ.opponent.board=[boardFollower(instance(himeQ.opponent,dummy("Hime Target",2,3,5)))]; gainCrest(himeQ.player,"Himeka, Heir to Repose",hime.card); applyHavencraftCrestTurnEnd(himeQ.player,himeQ.opponent,0,1,himeQ.stats,himeQ.rng,map); const himeTarget=himeQ.opponent.board[0]; const himekaCrest={locked:himeTarget.permanentAttackLock,marked:himeTarget.himekaBanishAtOwnTurnEnd}; resolveHavencraftCardText("Set the attack of all enemy followers on the field to 4.",{...himeQ.ctx(),card:hime.card,sourceUnit:hime}); const himekaAttack=himeTarget.attack;

  const vicheQ=makePair("viche"); const viche=instance(vicheQ.player,byName("Viche, Abyssal Researcher")); vicheQ.player.hand=[viche]; applyHavencraftSuperEvolveHandTriggers(vicheQ.player); const vicheCost=costOf(viche);

  const kukQ=makePair("kukishiro"); gainCrest(kukQ.player,"Kukishiro, Mistbloom",byName("Kukishiro, Mistbloom")); kukQ.player.deck=[instance(kukQ.player,dummy("Odd Draw",1)),instance(kukQ.player,dummy("Even Draw",2))]; drawCards(kukQ.player,2,kukQ.stats,0); const kukishiro={allied:kukQ.player.board.length,enemy:kukQ.opponent.board.length};

  const lyaQ=makePair("lyanthoth"); lyaQ.player.havenFaithActive=true; const amulet=boardAmulet(instance(lyaQ.player,dummy("Faith Amulet",2,0,0,"Amulet"))); lyaQ.player.board=[amulet]; destroyObject(lyaQ.player,lyaQ.opponent,amulet,0,1,lyaQ.stats,lyaQ.rng,map,true); const faithAfterDestroy=lyaQ.player.faith; lyaQ.player.faith=10; resolveHavencraftCardText("Reduce your faith's value by 10 to add a Depths of the Eld Tome to your hand.",{...lyaQ.ctx(),card:byName("Lyanthoth, Eld Tome")}); const lyanthoth={faithAfterDestroy,faithAfterPay:lyaQ.player.faith,depths:lyaQ.player.hand.some(i=>norm(i.card.name)==="depths of the eld tome")};

  return {drawTriggers,engageTriggers,devotee,torrent,templeResult,shining,skyEngage,marwynnDamage,benisonHp,congregantDraw,saintFox,zoeCrest,himekaCrest,himekaAttack,vicheCost,kukishiro,lyanthoth};
}

'''
once('// [[battle-neutral-full-qa]]\n', qa + '// [[battle-neutral-full-qa]]\n', 'QA block')

ENGINE.write_text(text, encoding='utf-8')
print('Havencraft full-class rules materialized.')
