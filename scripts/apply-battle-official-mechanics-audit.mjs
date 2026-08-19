import fs from "node:fs";

const path = "js/battle-engine-v5.js";
let src = fs.readFileSync(path, "utf8");

function replaceOnce(before, after, label) {
  if (!src.includes(before)) throw new Error(`Missing patch target: ${label}`);
  src = src.replace(before, after);
}

function replaceRegex(pattern, replacement, label) {
  if (!pattern.test(src)) throw new Error(`Missing regex patch target: ${label}`);
  pattern.lastIndex = 0;
  src = src.replace(pattern, replacement);
}

// Official Transform semantics: transformation is not a leave-field event, does
// not preserve attack/Act usage, and the transformed follower cannot attack until
// the following turn.
replaceOnce(`function transformFollowerInto(owner, target, card) {
  const index = owner.board.findIndex(unit => unit.uid === target.uid);
  if (index < 0 || !card) return null;
  const replacement = boardFollower(instance(owner, card));
  replacement.uid = target.uid;
  replacement.summonedThisTurn = target.summonedThisTurn;
  replacement.attacked = target.attacked;
  replacement.attacksMade = target.attacksMade;
  if (!replacement.summonedThisTurn) {
    replacement.canAttackLeader = !/can't attack followers or leaders/i.test(String(card.text ?? ""));
    replacement.canAttackFollower = replacement.canAttackLeader;
  }
  owner.board[index] = replacement;
  return replacement;
}`,
`function transformFollowerInto(owner, target, card) {
  const index = owner.board.findIndex(unit => unit.uid === target.uid);
  if (index < 0 || !card) return null;
  const replacement = boardFollower(instance(owner, card));
  replacement.uid = target.uid;
  replacement.summonedThisTurn = true;
  replacement.attacked = false;
  replacement.attacksMade = 0;
  replacement.canAttackLeader = false;
  replacement.canAttackFollower = false;
  owner.board[index] = replacement;
  return replacement;
}`,
"transformFollowerInto official reset");

replaceOnce(`function transformEnemyFollowerInto(ctx, target, card, actions) {
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
  actions.push(\`${'${target.name}'} transforms into ${'${replacement.name}'}\`);
  return replacement;
}`,
`function transformEnemyFollowerInto(ctx, target, card, actions) {
  if (!target || !card) return null;
  const index = ctx.opponent.board.indexOf(target);
  if (index < 0) return null;
  const replacement = boardFollower(instance(ctx.opponent, card));
  replacement.summonedThisTurn = true;
  replacement.attacksMade = 0;
  replacement.attacked = false;
  replacement.canAttackLeader = false;
  replacement.canAttackFollower = false;
  ctx.opponent.board[index] = replacement;
  actions.push(\`${'${target.name}'} transforms into ${'${replacement.name}'}\`);
  return replacement;
}`,
"transformEnemyFollowerInto official reset");

// Select spells require every requested target to exist. Fanfare followers and
// amulets remain playable and resolve with as many targets as possible.
replaceOnce(`function expandPlayTargetBranches(item, opponent) {
  const spec = targetEffectSpec(item);
  if (!spec) return [{ ...item, targetPlan: null }];
  const targets = targetableEnemyFollowers(opponent.board);
  if (!targets.length) return [{ ...item, targetPlan: null }];
  return targets.map(unit => ({`,
`function expandPlayTargetBranches(item, opponent) {
  const spec = targetEffectSpec(item);
  if (!spec) return [{ ...item, targetPlan: null }];
  const targets = targetableEnemyFollowers(opponent.board);
  if (!targets.length) {
    const spellLike = item?.instance?.card?.type === "Spell" || item?.mode?.kind === "accelerate";
    if (spec.selectedGrammar && spellLike) return [];
    return [{ ...item, targetPlan: null }];
  }
  return targets.map(unit => ({`,
"Select spell target legality");

// Cemetery is a consumable numeric game resource. Every card actually sent to
// the cemetery increases it, including discards and hand-overflow burns.
replaceOnce(`function toCemetery(player, item, addShadow = false) { player.cemetery.push(item); if (addShadow) player.shadows += 1; }`,
`function toCemetery(player, item, addShadow = true) { player.cemetery.push(item); player.shadows += 1; }`,
"cemetery resource increment");

replaceOnce(`personalTurn: player.personalTurn, deckCount: player.deck.length, cemeteryCount: player.cemetery.length, fusedCount: player.fusedCards?.length ?? 0,`,
`personalTurn: player.personalTurn, deckCount: player.deck.length, cemeteryCount: player.shadows, fusedCount: player.fusedCards?.length ?? 0,`,
"replay cemetery current value");

// Ability destruction immunity and active-turn Super-Evolve Invincible must also
// apply to exact/special destroy paths, not only the generic destroyUnit helper.
replaceOnce(`function destroyObject(player, opponent, unit, playerIndex, enemyIndex, stats, rng, map, lastWordsEnabled) {
  // [[battle-high-risk-destroyed-amulet-history]]`,
`function destroyObject(player, opponent, unit, playerIndex, enemyIndex, stats, rng, map, lastWordsEnabled, rulesDestroy = false) {
  if (!rulesDestroy && (unit?.abilityDestructionImmune || (unit?.superEvolved && player?.isActive))) return [];
  // [[battle-high-risk-destroyed-amulet-history]]`,
"destroyObject immunity");

// Countdown reaching zero is rules destruction, not destruction by an ability.
src = src.replaceAll(`destroyObject(ctx.player, ctx.opponent, ctx.sourceUnit, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true))`, `destroyObject(ctx.player, ctx.opponent, ctx.sourceUnit, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true, true))`);
src = src.replaceAll(`destroyObject(player, opponent, institute, playerIndex, enemyIndex, stats, rng, map, true))`, `destroyObject(player, opponent, institute, playerIndex, enemyIndex, stats, rng, map, true, true))`);
src = src.replaceAll(`destroyObject(player, opponent, amulet, playerIndex, enemyIndex, stats, rng, map, true))`, `destroyObject(player, opponent, amulet, playerIndex, enemyIndex, stats, rng, map, true, true))`);

// Earth Sigils are field amulets carrying a merged count, not a free-floating
// counter. Keep player.earthSigils as a synchronized mirror for existing card
// formulas and UI, while the field amulet is authoritative in real simulations.
const earthHelpers = `
function isEarthSigilAmulet(unit) {
  return unit?.type === "Amulet" && (unit.card?.traits ?? []).some(trait => norm(trait) === "earth sigil");
}

function findEarthSigilAmulet(player) {
  return (player?.board ?? []).find(isEarthSigilAmulet) ?? null;
}

function configureEarthSigilAmulet(unit, count = 1) {
  if (!unit || !isEarthSigilAmulet(unit)) return unit;
  unit.earthSigilCount = Math.max(0, Number(count) || 0);
  unit.abilityDestructionImmune = true;
  unit.untargetableByOpponentAbility = true;
  return unit;
}

function syncEarthSigils(player) {
  const sigil = findEarthSigilAmulet(player);
  if (sigil) player.earthSigils = Math.max(0, Number(sigil.earthSigilCount) || 0);
  else if ((player?.board ?? []).some(isEarthSigilAmulet)) player.earthSigils = 0;
  return Math.max(0, Number(player?.earthSigils) || 0);
}

function registerEarthSigilEntry(player, unit, actions = []) {
  if (!isEarthSigilAmulet(unit)) return false;
  let total = 1;
  for (const old of [...player.board]) {
    if (old === unit || !isEarthSigilAmulet(old)) continue;
    total += Math.max(1, Number(old.earthSigilCount) || 1);
    player.board = player.board.filter(item => item.uid !== old.uid);
    player.banished.push({ uid: old.uid, card: old.card });
    actions.push(\`Earth Sigil merge: banish ${'${old.name}'}\`);
  }
  configureEarthSigilAmulet(unit, total);
  player.earthSigils = total;
  actions.push(\`Earth Sigils ${'${total}'}\`);
  return true;
}

function gainEarthSigils(ctx, amountValue, actions = []) {
  if (!canUseClassMechanic(ctx.player, "earthRite", ctx.card)) return 0;
  const amount = Math.max(0, Number(amountValue) || 0);
  if (!amount) return 0;
  let sigil = findEarthSigilAmulet(ctx.player);
  if (!sigil) {
    if ((ctx.player.board?.length ?? 0) >= 5) {
      actions.push(\`Earth Sigils +${'${amount}'} unavailable: field full\`);
      return 0;
    }
    const card = findByName(ctx.cardMap, "Earth Essence") ?? ctx.cardMap?.get?.(90031210) ?? null;
    if (!card) {
      actions.push("Earth Sigil generation unavailable: Earth Essence missing");
      return 0;
    }
    sigil = boardAmulet(instance(ctx.player, card));
    configureEarthSigilAmulet(sigil, amount);
    ctx.player.board.push(sigil);
    ctx.player.earthSigils = amount;
    if (ctx.stats?.cardsGenerated && Number.isFinite(ctx.playerIndex)) ctx.stats.cardsGenerated[ctx.playerIndex] += 1;
    actions.push(\`summon Earth Essence · Earth Sigils ${'${amount}'}\`);
    return amount;
  }
  sigil.earthSigilCount = Math.max(0, Number(sigil.earthSigilCount) || 0) + amount;
  ctx.player.earthSigils = sigil.earthSigilCount;
  actions.push(\`Earth Sigils +${'${amount}'} (${'${ctx.player.earthSigils}'})\`);
  return amount;
}

function removeAmbushAfterAbilityDamage(unit, dealt, actions = []) {
  if (!unit || !(Number(dealt) > 0) || !unit.ambush) return false;
  unit.ambush = false;
  unit.keywords = (unit.keywords ?? []).filter(keyword => norm(keyword) !== "ambush");
  actions.push(\`${'${unit.name}'} loses Ambush after dealing ability damage\`);
  return true;
}
`;

replaceOnce(`function performEarthRite(player, amountValue, actions = []) {`, `${earthHelpers}\nfunction performEarthRite(player, amountValue, actions = []) {`, "Earth Sigil helpers");

replaceOnce(`function performEarthRite(player, amountValue, actions = []) {
  if (player.className && !canUseClassMechanic(player, "earthRite")) return false;
  const amount = Math.max(1, Number(amountValue) || 1);
  if ((Number(player.earthSigils) || 0) < amount) return false;
  player.earthSigils -= amount;
  for (const item of player.hand ?? []) {`,
`function performEarthRite(player, amountValue, actions = []) {
  if (player.className && !canUseClassMechanic(player, "earthRite")) return false;
  const amount = Math.max(1, Number(amountValue) || 1);
  const sigil = findEarthSigilAmulet(player);
  const available = sigil ? Math.max(0, Number(sigil.earthSigilCount) || 0) : Math.max(0, Number(player.earthSigils) || 0);
  if (available < amount) return false;
  if (sigil) {
    sigil.earthSigilCount = available - amount;
    player.earthSigils = sigil.earthSigilCount;
    if (sigil.earthSigilCount <= 0) {
      player.board = player.board.filter(item => item.uid !== sigil.uid);
      player.destroyedAmulets ??= [];
      player.destroyedAmulets.push({ card: sigil.card });
      toCemetery(player, { uid: sigil.uid, card: sigil.card });
      player.earthSigils = 0;
      actions.push(\`${'${sigil.name}'} destroyed at 0 Earth Sigils\`);
    }
  } else {
    // Compatibility for internal deterministic QA states that predate field-backed
    // Earth Sigils. Normal simulations always create the field amulet.
    player.earthSigils = available - amount;
  }
  for (const item of player.hand ?? []) {`,
"Earth Rite field consumption");

replaceOnce(`      if ((card.traits ?? []).includes("Earth Sigil") && canUseClassMechanic(player, "earthRite", card)) player.earthSigils += 1;`,
`      if ((card.traits ?? []).includes("Earth Sigil") && canUseClassMechanic(player, "earthRite", card)) registerEarthSigilEntry(player, source, actions);`,
"Earth Sigil play entry");

replaceOnce(`  text = text.replace(/^Earth Sigil\\.?/i, () => { if (canUseClassMechanic(ctx.player, "earthRite", ctx.card)) { ctx.player.earthSigils += 1; actions.push(\`Earth Sigils +1 (${'${ctx.player.earthSigils}'})\`); } return " "; });`,
`  text = text.replace(/^Earth Sigil\\.?/i, " ");`,
"Earth Sigil structural label");

replaceOnce(`  for (const match of [...text.matchAll(/Gain\\s+(?:an?|one|1)\\s+earth sigil\\.?/gi)]) {
    if (canUseClassMechanic(ctx.player, "earthRite", ctx.card)) {
      ctx.player.earthSigils += 1;
      actions.push(\`Earth Sigils +1 (${'${ctx.player.earthSigils}'})\`);
    }
    text = text.replace(match[0], " ");
  }`,
`  for (const match of [...text.matchAll(/Gain\\s+(?:an?|one|1)\\s+earth sigil\\.?/gi)]) {
    gainEarthSigils(ctx, 1, actions);
    text = text.replace(match[0], " ");
  }`,
"Earth Sigil singular gain");

replaceOnce(`    if (canUseClassMechanic(ctx.player, "earthRite", ctx.card)) {
      ctx.player.earthSigils += 1;
      actions.push(\`selected damage ${'${damageSigil[1]}'} · Earth Sigil +1\`);
    }`,
`    if (gainEarthSigils(ctx, 1, actions)) actions.push(\`selected damage ${'${damageSigil[1]}'} · Earth Sigil +1\`);`,
"Earth Sigil compound gain");

replaceOnce(`  // Earth Sigils are a numeric field resource in the simulator. Spells and Engage
  // effects can create them directly without occupying an additional board slot.
  for (const match of [...text.matchAll(/gain\\s+(an?|one|two|three|four|five|\\d+)\\s+earth sigils?/gi)]) {
    const amount = word(match[1]) || 1;
    if (canUseClassMechanic(ctx.player, "earthRite", ctx.card)) {
      ctx.player.earthSigils += amount;
      actions.push(\`Earth Sigils +${'${amount}'} (${'${ctx.player.earthSigils}'})\`);
    }
    text = text.replace(match[0], " ");
  }`,
`  // Earth Sigils are represented by their actual merged field amulet. The
  // numeric mirror remains synchronized for formulas and UI.
  for (const match of [...text.matchAll(/gain\\s+(an?|one|two|three|four|five|\\d+)\\s+earth sigils?/gi)]) {
    const amount = word(match[1]) || 1;
    gainEarthSigils(ctx, amount, actions);
    text = text.replace(match[0], " ");
  }`,
"Earth Sigil generic gain");

// Earth Sigil targeting/destruction protections.
replaceOnce(`function targetableEnemyFollowers(board) {
  return board.filter(unit => unit.type === "Follower" && !unit.aura && !unit.ambush);
}`,
`function targetableEnemyFollowers(board) {
  return board.filter(unit => unit.type === "Follower" && !unit.aura && !unit.ambush && !unit.untargetableByOpponentAbility);
}`,
"targetable enemy follower immunity");

replaceOnce(`function chooseTarget(board, targeted) {
  return board.filter(unit => unit.type === "Follower" && (!targeted || (!unit.aura && !unit.ambush))).sort((a,b)=>b.attack+b.defense-a.attack-a.defense)[0] ?? null;
}`,
`function chooseTarget(board, targeted) {
  return board.filter(unit => unit.type === "Follower" && (!targeted || (!unit.aura && !unit.ambush && !unit.untargetableByOpponentAbility))).sort((a,b)=>b.attack+b.defense-a.attack-a.defense)[0] ?? null;
}`,
"chooseTarget opponent immunity");

replaceOnce(`      const enemy = ctx.opponent.board.map(unit => ({ owner: ctx.opponent, unit, enemy: true })).sort((a,b)=>(Number(b.unit.attack)+Number(b.unit.defense))-(Number(a.unit.attack)+Number(a.unit.defense)));`,
`      const enemy = ctx.opponent.board.filter(unit => !unit.untargetableByOpponentAbility).map(unit => ({ owner: ctx.opponent, unit, enemy: true })).sort((a,b)=>(Number(b.unit.attack)+Number(b.unit.defense))-(Number(a.unit.attack)+Number(a.unit.defense)));`,
"Lyanthoth enemy target legality");

replaceOnce(`    const target = [...ctx.opponent.board].sort((a,b) => (Number(b.card?.cost)||0) - (Number(a.card?.cost)||0))[0] ?? null;`,
`    const target = [...ctx.opponent.board].filter(unit => !unit.untargetableByOpponentAbility).sort((a,b) => (Number(b.card?.cost)||0) - (Number(a.card?.cost)||0))[0] ?? null;`,
"selected enemy card target legality");

// Keep the Earth Sigil mirror correct when the amulet is removed by legal
// non-destruction effects such as banish or return.
replaceOnce(`function banish(player, unit) { if (unit.type === "Follower") notifyFollowerLeavesField(player, unit); player.board = player.board.filter(item => item.uid !== unit.uid); player.banished.push({ uid: unit.uid, card: unit.card }); return true; }`,
`function banish(player, unit) { if (unit.type === "Follower") notifyFollowerLeavesField(player, unit); player.board = player.board.filter(item => item.uid !== unit.uid); player.banished.push({ uid: unit.uid, card: unit.card }); if (isEarthSigilAmulet(unit)) player.earthSigils = 0; return true; }`,
"Earth Sigil banish sync");

replaceOnce(`function bounce(player, unit) {
  if (unit?.banishOnLeave) return banish(player, unit);
  if (unit.type === "Follower") notifyFollowerLeavesField(player, unit);
  player.board = player.board.filter(item => item.uid !== unit.uid);
  const item = instance(player, unit.card);`,
`function bounce(player, unit) {
  if (unit?.banishOnLeave) return banish(player, unit);
  if (unit.type === "Follower") notifyFollowerLeavesField(player, unit);
  player.board = player.board.filter(item => item.uid !== unit.uid);
  if (isEarthSigilAmulet(unit)) player.earthSigils = 0;
  const item = instance(player, unit.card);`,
"Earth Sigil return sync");

// Official Ambush: it is lost when the Ambush follower itself deals damage by an
// ability. Myuu is a current explicit official Q&A case.
replaceOnce(`      if (sourceName === "myuu, hot on his heels") {
        const target = chooseRandomTarget(ctx.opponent.board, ctx.rng);
        if (target) {
          damageUnit(target, 3, ctx.opponent, ctx.player, ctx, actions);
          actions.push(\`Myuu: 3 damage to ${'${target.name}'}\`);
        }
      }`,
`      if (sourceName === "myuu, hot on his heels") {
        const target = chooseRandomTarget(ctx.opponent.board, ctx.rng);
        if (target) {
          const dealt = damageUnit(target, 3, ctx.opponent, ctx.player, ctx, actions);
          removeAmbushAfterAbilityDamage(source, dealt, actions);
          actions.push(\`Myuu: ${'${dealt}'} damage to ${'${target.name}'}\`);
        }
      }`,
"Myuu Ambush loss");

// Add a focused internal QA probe so the permanent regression can verify the
// official mechanics with the real engine helpers rather than source regex only.
const auditProbe = `

export function inspectOfficialMechanicsAudit({ cards = [] } = {}) {
  const rawMap = new Map(cards.map(card => [Number(card.id), card]));
  const map = prepareSimulationCardMap(rawMap);
  const mk = (seed, className = "Runecraft") => {
    const rng = createRng(\`official-mechanics:${'${seed}'}\`);
    const stats = createStats();
    const player = makePlayer("You", [], { style: "midrange" }, map, rng, className);
    const opponent = makePlayer("Opponent", [], { style: "midrange" }, map, rng, className);
    player.isActive = true;
    opponent.isActive = false;
    return { rng, stats, player, opponent, ctx: () => ({ player, opponent, playerIndex: 0, enemyIndex: 1, stats, rng, cardMap: map, card: null }) };
  };
  const syntheticFollower = (name, attack = 2, defense = 2) => ({ id: -990000 - name.length, name, class: "Neutral", type: "Follower", cost: 2, attack, defense, text: "", keywords: [], traits: [], relatedCards: [] });

  const transform = mk("transform", "Forestcraft");
  const oldCard = syntheticFollower("Transform Old", 4, 4);
  const newCard = syntheticFollower("Transform New", 7, 7);
  const old = boardFollower(instance(transform.opponent, oldCard));
  old.summonedThisTurn = false;
  old.attacked = true;
  old.attacksMade = 1;
  old.canAttackLeader = true;
  old.canAttackFollower = true;
  transform.opponent.board = [old];
  const bayleCard = { ...syntheticFollower("Bayle, Luxglaive Warrior"), class: "Forestcraft" };
  const bayle = instance(transform.opponent, bayleCard);
  transform.opponent.hand = [bayle];
  const transformed = transformEnemyFollowerInto(transform.ctx(), old, newCard, []);

  const cemetery = mk("cemetery", "Abysscraft");
  cemetery.player.hand = Array.from({ length: 9 }, (_, i) => instance(cemetery.player, syntheticFollower(\`Full Hand ${'${i}'}\`)));
  cemetery.player.deck = [instance(cemetery.player, syntheticFollower("Burned Draw"))];
  const cemeteryBeforeDraw = cemetery.player.shadows;
  drawCards(cemetery.player, 1, cemetery.stats, 0);
  const bounceTarget = boardFollower(instance(cemetery.player, syntheticFollower("Bounce Target")));
  cemetery.player.board = [bounceTarget];
  const cemeteryBeforeBounce = cemetery.player.shadows;
  bounce(cemetery.player, bounceTarget);

  const earth = mk("earth", "Runecraft");
  const essenceCard = map.get(90031210) ?? findByName(map, "Earth Essence");
  const earthCards = [...map.values()].filter(card => card.type === "Amulet" && (card.traits ?? []).some(trait => norm(trait) === "earth sigil"));
  const firstCard = earthCards.find(card => Number(card.id) !== Number(essenceCard?.id)) ?? essenceCard;
  let earthResult = null;
  if (firstCard && essenceCard) {
    const first = boardAmulet(instance(earth.player, firstCard));
    earth.player.board.push(first);
    registerEarthSigilEntry(earth.player, first, []);
    first.engagedThisTurn = true;
    const second = boardAmulet(instance(earth.player, firstCard));
    earth.player.board.push(second);
    registerEarthSigilEntry(earth.player, second, []);
    const merged = { count: earth.player.earthSigils, board: earth.player.board.filter(isEarthSigilAmulet).length, oldBanished: earth.player.banished.some(item => item.uid === first.uid), newEngaged: Boolean(second.engagedThisTurn) };

    const generated = mk("earth-generated", "Runecraft");
    gainEarthSigils({ ...generated.ctx(), card: firstCard }, 2, []);
    const generatedSigil = findEarthSigilAmulet(generated.player);
    const beforeRiteCemetery = generated.player.shadows;
    performEarthRite(generated.player, 2, []);

    const immune = mk("earth-immune", "Runecraft");
    const immuneSigil = boardAmulet(instance(immune.player, firstCard));
    immune.player.board.push(immuneSigil);
    registerEarthSigilEntry(immune.player, immuneSigil, []);
    destroyObject(immune.player, immune.opponent, immuneSigil, 0, 1, immune.stats, immune.rng, map, true);

    const full = mk("earth-full", "Runecraft");
    full.player.board = Array.from({ length: 5 }, (_, i) => boardFollower(instance(full.player, syntheticFollower(\`Full Board ${'${i}'}\`))));
    const fullGain = gainEarthSigils({ ...full.ctx(), card: firstCard }, 1, []);

    earthResult = {
      merged,
      generated: { name: generatedSigil?.name ?? null, count: generatedSigil?.earthSigilCount ?? null },
      rite: { board: generated.player.board.filter(isEarthSigilAmulet).length, cemeteryDelta: generated.player.shadows - beforeRiteCemetery },
      abilityDestroyImmune: immune.player.board.includes(immuneSigil),
      fieldFullGain: fullGain
    };
  }

  const myuu = mk("myuu", "Portalcraft");
  const myuuCard = findByName(map, "Myuu, Hot on His Heels");
  const artifactCard = findByName(map, "Ancient Artifact");
  let myuuResult = null;
  if (myuuCard && artifactCard) {
    const source = boardFollower(instance(myuu.player, myuuCard));
    giveKeyword(source, "Ambush");
    const artifact = boardFollower(instance(myuu.player, artifactCard));
    const victim = boardFollower(instance(myuu.opponent, syntheticFollower("Myuu Victim", 1, 10)));
    myuu.player.board = [source, artifact];
    myuu.opponent.board = [victim];
    applyEntryEvents({ ...myuu.ctx(), card: artifactCard, sourceUnit: artifact }, artifact);
    const losesOnDamage = !source.ambush;

    const noTarget = mk("myuu-no-target", "Portalcraft");
    const source2 = boardFollower(instance(noTarget.player, myuuCard));
    giveKeyword(source2, "Ambush");
    const artifact2 = boardFollower(instance(noTarget.player, artifactCard));
    noTarget.player.board = [source2, artifact2];
    applyEntryEvents({ ...noTarget.ctx(), card: artifactCard, sourceUnit: artifact2 }, artifact2);
    myuuResult = { losesOnDamage, keepsWithoutDamage: source2.ambush };
  }

  return {
    transform: { bayleCostDelta: bayle.costDelta, summonedThisTurn: transformed?.summonedThisTurn, attacked: transformed?.attacked, attacksMade: transformed?.attacksMade, canAttackLeader: transformed?.canAttackLeader },
    cemetery: { drawOverflowDelta: cemeteryBeforeDraw == null ? null : cemetery.player.shadows - cemeteryBeforeBounce, bounceOverflowDelta: cemetery.player.shadows - cemeteryBeforeBounce },
    earth: earthResult,
    myuu: myuuResult
  };
}
`;

if (!src.includes("export function inspectOfficialMechanicsAudit")) src += auditProbe;

fs.writeFileSync(path, src);
console.log("Battle official-mechanics audit fixes materialized");
