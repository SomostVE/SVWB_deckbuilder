from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
text = ENGINE.read_text(encoding="utf-8")
anchor = '''  return { text: text.replace(/\\s+/g, " ").trim(), actions: uniq(actions) };
}

function resolveText(raw, ctx) {'''
if anchor not in text:
    raise SystemExit("Missing high-risk resolver return anchor")

extra = r'''
  // [[battle-high-risk-generic-grammar]]
  // Frequently recurring target grammar that V3 classified as Full but the
  // generic executor did not actually consume.
  for (const match of [...text.matchAll(/Select an enemy follower(?: on the field)? and deal it\s*(\d+)\s*damage\.?/gi)]) {
    const target = choosePlannedTarget(ctx, ctx.opponent.board.filter(unit => unit.type === "Follower"));
    if (target) damageUnit(target, Number(match[1]) || 0, ctx.opponent, ctx.player, ctx, actions);
    actions.push(`selected enemy follower: ${match[1]} damage`);
    text = text.replace(match[0], " ");
  }
  for (const match of [...text.matchAll(/Deal\s*(\d+)\s*damage to a random enemy follower\.?/gi)]) {
    const pool = ctx.opponent.board.filter(unit => unit.type === "Follower");
    const target = pool.length ? pool[Math.floor(ctx.rng() * pool.length)] : null;
    if (target) damageUnit(target, Number(match[1]) || 0, ctx.opponent, ctx.player, ctx, actions);
    actions.push(`random enemy follower: ${match[1]} damage`);
    text = text.replace(match[0], " ");
  }
  for (const match of [...text.matchAll(/Deal\s*(\d+)\s*damage to all enemy followers\.?/gi)]) {
    const amount = Number(match[1]) || 0;
    for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, amount, ctx.opponent, ctx.player, ctx, actions);
    actions.push(`${amount} damage to all enemy followers`);
    text = text.replace(match[0], " ");
  }
  const bothLeaders = text.match(/Deal\s*(\d+)\s*damage to all enemy followers and both leaders\.?/i);
  if (bothLeaders) {
    const amount = Number(bothLeaders[1]) || 0;
    for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, amount, ctx.opponent, ctx.player, ctx, actions);
    const enemy = damageLeader(ctx.opponent, amount); ctx.stats.damageDealt[ctx.playerIndex] += enemy;
    damageLeader(ctx.player, amount);
    actions.push(`${amount} damage to enemy followers and both leaders`);
    text = text.replace(bothLeaders[0], " ");
  }

  const selectedDestroy = /Select an enemy follower(?: on the field)? and destroy it\.?/i;
  if (selectedDestroy.test(text)) {
    const target = choosePlannedTarget(ctx, ctx.opponent.board.filter(unit => unit.type === "Follower"));
    if (target) actions.push(...destroyObject(ctx.opponent, ctx.player, target, ctx.enemyIndex, ctx.playerIndex, ctx.stats, ctx.rng, ctx.cardMap, true));
    actions.push(`destroy selected enemy follower${target ? ` ${target.name}` : " unavailable"}`);
    text = text.replace(selectedDestroy, " ");
  }
  const selectedDebuff = text.match(/Select an enemy follower(?: on the field)? and give it\s*(-?\d+)\s*\/\s*(-?\d+)\.?/i);
  if (selectedDebuff) {
    const target = choosePlannedTarget(ctx, ctx.opponent.board.filter(unit => unit.type === "Follower"));
    const attack = Number(selectedDebuff[1]) || 0, defense = Number(selectedDebuff[2]) || 0;
    if (target) { target.attack += attack; target.defense += defense; target.maxDefense += defense; }
    actions.push(`selected enemy follower ${attack}/${defense}`);
    text = text.replace(selectedDebuff[0], " ");
  }
  const allEnemyDebuff = text.match(/Give all enemy followers on the field\s*(-?\d+)\s*\/\s*(-?\d+)\.?/i);
  if (allEnemyDebuff) {
    const attack = Number(allEnemyDebuff[1]) || 0, defense = Number(allEnemyDebuff[2]) || 0;
    for (const target of ctx.opponent.board.filter(unit => unit.type === "Follower")) { target.attack += attack; target.defense += defense; target.maxDefense += defense; }
    actions.push(`all enemy followers ${attack}/${defense}`);
    text = text.replace(allEnemyDebuff[0], " ");
  }

  const randomAllyBuff = text.match(/Give a random allied follower on the field\s*\+(\d+)\s*\/\s*\+(\d+)\.?/i);
  if (randomAllyBuff) {
    const pool = ctx.player.board.filter(unit => unit.type === "Follower");
    const target = pool.length ? pool[Math.floor(ctx.rng() * pool.length)] : null;
    if (target) buff(target, Number(randomAllyBuff[1]) || 0, Number(randomAllyBuff[2]) || 0);
    actions.push(`random allied follower +${randomAllyBuff[1]}/+${randomAllyBuff[2]}`);
    text = text.replace(randomAllyBuff[0], " ");
  }
  const allOtherBuff = text.match(/Give all other allied followers on the field\s*\+(\d+)\s*\/\s*\+(\d+)\.?/i);
  if (allOtherBuff) {
    for (const unit of ctx.player.board.filter(unit => unit.type === "Follower" && unit.uid !== ctx.sourceUnit?.uid)) buff(unit, Number(allOtherBuff[1]) || 0, Number(allOtherBuff[2]) || 0);
    actions.push(`all other allied followers +${allOtherBuff[1]}/+${allOtherBuff[2]}`);
    text = text.replace(allOtherBuff[0], " ");
  }
  const namedCopiesBuff = text.match(/Give all allied copies of ([^.]+?) on the field\s*\+(\d+)\s*\/\s*\+(\d+)\.?/i);
  if (namedCopiesBuff) {
    const targetName = norm(namedCopiesBuff[1]);
    for (const unit of ctx.player.board.filter(unit => unit.type === "Follower" && norm(unit.name) === targetName)) buff(unit, Number(namedCopiesBuff[2]) || 0, Number(namedCopiesBuff[3]) || 0);
    actions.push(`${namedCopiesBuff[1]} copies +${namedCopiesBuff[2]}/+${namedCopiesBuff[3]}`);
    text = text.replace(namedCopiesBuff[0], " ");
  }
  const comboBuff = /Give this follower \+X\/\+X\.\s*X is your Combo\.?/i;
  if (comboBuff.test(text) && ctx.sourceUnit) {
    const x = Math.max(0, Number(ctx.player.cardsPlayedThisTurn) || 0);
    buff(ctx.sourceUnit, x, x);
    actions.push(`this follower +${x}/+${x} from Combo`);
    text = text.replace(comboBuff, " ");
  }

  // Token copies use exact named cards from the database/related-card map.
  for (const match of [...text.matchAll(/Summon\s*(a|an|one|two|three|four|five|\d+)\s+copies? of ([^.;]+)\.?/gi)]) {
    const count = highRiskWordNumber(match[1], 1);
    const tokenName = String(match[2]).trim();
    const token = findByName(ctx.cardMap, tokenName) ?? related(ctx.card, ctx.cardMap).find(card => norm(card.name) === norm(tokenName));
    const summoned = token ? summonWithEvents(ctx.player, token, count, ctx.playerIndex, ctx) : 0;
    actions.push(`summon ${summoned}/${count} ${tokenName}`);
    text = text.replace(match[0], " ");
  }
  for (const match of [...text.matchAll(/Add\s*(a|an|one|two|three|four|five|\d+)\s+copies? of ([^.;]+?) to your hand\.?/gi)]) {
    const count = highRiskWordNumber(match[1], 1);
    const tokenName = String(match[2]).trim();
    const token = findByName(ctx.cardMap, tokenName) ?? related(ctx.card, ctx.cardMap).find(card => norm(card.name) === norm(tokenName));
    const added = token ? addHand(ctx.player, token, count, ctx.playerIndex, ctx.stats) : 0;
    if (added) ctx.stats.cardsGenerated[ctx.playerIndex] += added;
    actions.push(`add ${added}/${count} ${tokenName}`);
    text = text.replace(match[0], " ");
  }
  const conditionalBat = /If your leader'?s defense is higher than the enemy leader'?s defense, summon\s*(\d+)\s+copies of Bat\.?/i;
  const conditionalBatMatch = text.match(conditionalBat);
  if (conditionalBatMatch) {
    let summoned = 0;
    if (ctx.player.hp > ctx.opponent.hp) {
      const bat = findByName(ctx.cardMap, "Bat") ?? related(ctx.card, ctx.cardMap).find(card => norm(card.name) === "bat");
      if (bat) summoned = summonWithEvents(ctx.player, bat, Number(conditionalBatMatch[1]) || 0, ctx.playerIndex, ctx);
    }
    actions.push(`conditional Bat summons ${summoned}`);
    text = text.replace(conditionalBat, " ");
  }

  // Reanimate without a trailing clause is itself an executable effect.
  const reanimateOnly = text.match(/Reanimate\s*\(?\s*(\d+)\s*\)?\.?/i);
  if (reanimateOnly) {
    const unit = reanimate(ctx.player, Number(reanimateOnly[1]) || 0, ctx.playerIndex, ctx.cardMap, ctx.rng);
    if (unit) { ctx.player.board.push(unit); ctx.player.rally += 1; actions.push(`Reanimate ${reanimateOnly[1]}: ${unit.name}`, ...applyEntryEvents(ctx, unit)); }
    else actions.push(`Reanimate ${reanimateOnly[1]}: unavailable`);
    text = text.replace(reanimateOnly[0], " ");
  }

  // Miscellaneous recurring clauses.
  const destroyDamaged = /Destroy all damaged enemy followers\.?/i;
  if (destroyDamaged.test(text)) {
    const targets = ctx.opponent.board.filter(unit => unit.type === "Follower" && (Number(unit.defense)||0) < (Number(unit.maxDefense)||0));
    for (const unit of targets) destroyUnit(ctx.opponent, unit);
    actions.push(`destroy ${targets.length} damaged enemy followers`);
    text = text.replace(destroyDamaged, " ");
  }
  const splitDamage = text.match(/Deal\s*(\d+)\s+damage split between all enemy followers\.?/i);
  if (splitDamage) {
    let remaining = Number(splitDamage[1]) || 0;
    const pool = ctx.opponent.board.filter(unit => unit.type === "Follower");
    while (remaining > 0 && pool.length) {
      const target = pool[Math.floor(ctx.rng() * pool.length)];
      damageUnit(target, 1, ctx.opponent, ctx.player, ctx, actions);
      remaining -= 1;
    }
    actions.push(`${splitDamage[1]} split damage`);
    text = text.replace(splitDamage[0], " ");
  }
  const comboOne = /Increase your Combo by 1\.?/i;
  if (comboOne.test(text)) {
    ctx.player.cardsPlayedThisTurn += 1;
    actions.push(`Combo +1 (${ctx.player.cardsPlayedThisTurn})`);
    text = text.replace(comboOne, " ");
  }
  const spellboostHandClause = /Spellboost your hand\.?/i;
  if (spellboostHandClause.test(text)) {
    spellboostHand(ctx.player, 1, ctx.cardMap, actions);
    text = text.replace(spellboostHandClause, " ");
  }

  // Self-destruction is common on Engage abilities.
  const destroyThis = /Destroy this card\.?/i;
  if (destroyThis.test(text) && ctx.sourceUnit) {
    actions.push(...destroyObject(ctx.player, ctx.opponent, ctx.sourceUnit, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true));
    text = text.replace(destroyThis, " ");
  }

  // Keywords can appear inline in card text rather than the keyword array.
  for (const keyword of ["Ward", "Barrier", "Rush", "Storm", "Bane", "Drain", "Intimidate", "Aura", "Ambush"]) {
    const regex = new RegExp(`(?:^|\\s)${keyword}(?=\\s|$|[.])`, "i");
    if (!regex.test(text)) continue;
    if (ctx.sourceUnit?.type === "Follower") giveKeyword(ctx.sourceUnit, keyword);
    actions.push(`${ctx.sourceUnit?.name ?? "source"} gains ${keyword}`);
    text = text.replace(regex, " ");
  }

  const twoAttacks = /Give this follower ["“]Can attack 2 times per turn\.?["”]/i;
  if (twoAttacks.test(text) && ctx.sourceUnit) {
    ctx.sourceUnit.baseMaxAttacks = Math.max(2, Number(ctx.sourceUnit.baseMaxAttacks) || 1);
    ctx.sourceUnit.maxAttacks = Math.max(2, Number(ctx.sourceUnit.maxAttacks) || 1);
    actions.push(`${ctx.sourceUnit.name} can attack twice`);
    text = text.replace(twoAttacks, " ");
  }

  // Grammar variants for cross-zone/history primitives.
  const wolfCopies = /Add an exact copy each of 5 random cards in your opponent'?s deck to your hand without revealing them\.?/i;
  if (wolfCopies.test(text)) {
    const pool = [...(ctx.opponent.deck ?? [])]; let added = 0;
    while (added < 5 && pool.length) {
      const source = pool.splice(Math.floor(ctx.rng() * pool.length), 1)[0];
      if (highRiskAddCopyToHand(ctx, source, { exact: true })) added += 1;
    }
    actions.push(`copy ${added} opponent-deck cards`);
    text = text.replace(wolfCopies, " ");
  }
  const fieldCopyVariant = text.match(/Select an allied follower on the field with a base cost of\s*(\d+)\s+or more, add a copy of it to your hand without revealing it, and reduce the cost of the copy by\s*(\d+)\.?/i);
  if (fieldCopyVariant) {
    const source = ctx.player.board.filter(unit => unit.type === "Follower" && (Number(unit.card?.cost)||0) >= Number(fieldCopyVariant[1]))
      .sort((a,b) => (Number(b.card?.cost)||0) - (Number(a.card?.cost)||0))[0] ?? null;
    if (source) highRiskAddCopyToHand(ctx, source, { costDelta: -Number(fieldCopyVariant[2]) });
    actions.push(`field follower copy ${source?.name ?? "unavailable"}`);
    text = text.replace(fieldCopyVariant[0], " ");
  }
  const destroyedTwoVariant = /Add a copy each of 2 random differently named allied followers destroyed this match to your hand without revealing them\.?/i;
  if (destroyedTwoVariant.test(text)) {
    const cards = highRiskHistoryCards(ctx.player.destroyedFollowers, 2, null, ctx.rng, true);
    for (const card of cards) highRiskAddCopyToHand(ctx, card);
    actions.push(`destroyed follower copies ${cards.length}`);
    text = text.replace(destroyedTwoVariant, " ");
  }
  const destroyedArtifactVariant = /Add a copy of a random allied Artifact follower destroyed this match to your hand without revealing it\.?/i;
  if (destroyedArtifactVariant.test(text)) {
    const cards = highRiskHistoryCards(ctx.player.destroyedFollowers, 1, highRiskIsArtifact, ctx.rng, true);
    for (const card of cards) highRiskAddCopyToHand(ctx, card);
    actions.push(`destroyed Artifact copy ${cards.length}`);
    text = text.replace(destroyedArtifactVariant, " ");
  }
  const destroyedOneVariant = /Add a copy of a random allied follower destroyed this match to your hand without revealing it\.?/i;
  if (destroyedOneVariant.test(text)) {
    const cards = highRiskHistoryCards(ctx.player.destroyedFollowers, 1, null, ctx.rng, true);
    for (const card of cards) highRiskAddCopyToHand(ctx, card);
    actions.push(`destroyed follower copy ${cards.length}`);
    text = text.replace(destroyedOneVariant, " ");
  }
  const kandimaHistory = /Summon a copy each of 2 random differently named allied amulets destroyed this match with Last Words and a base cost of 2 or less\.?/i;
  if (kandimaHistory.test(text)) {
    const cards = highRiskHistoryCards(ctx.player.destroyedAmulets, 2, card => card.type === "Amulet" && /Last Words\s*:/i.test(String(card.text ?? "")) && (Number(card.cost)||0) <= 2, ctx.rng, true);
    let count = 0; for (const card of cards) if (highRiskSummonAmulet(ctx, card)) count += 1;
    actions.push(`summon ${count} Kandima amulet copies`);
    text = text.replace(kandimaHistory, " ");
  }
  const amuletHistoryVariant = /Summon a copy of a random allied amulet destroyed this match with Last Words and a base cost of 2 or less\.?/i;
  if (amuletHistoryVariant.test(text)) {
    const cards = highRiskHistoryCards(ctx.player.destroyedAmulets, 1, card => card.type === "Amulet" && /Last Words\s*:/i.test(String(card.text ?? "")) && (Number(card.cost)||0) <= 2, ctx.rng, true);
    if (cards[0]) highRiskSummonAmulet(ctx, cards[0]);
    actions.push(`summon destroyed amulet copy ${cards.length}`);
    text = text.replace(amuletHistoryVariant, " ");
  }

  // Flexible Artifact hand-copy grammar (one/two/three, with or without comma).
  const artifactHandCopy = text.match(/Select\s+(?:(a|an|one|two|three|four|five|\d+)\s+)?Artifact followers? in your hand that costs? 5 or less(?:,| and)?\s*summon an exact copy of (?:it|each)(?:,?\s*and give (?:the exact copies|the copies|them) ["“]At the end of your opponent'?s turn, destroy this card\.["”])?\.?/i);
  if (artifactHandCopy) {
    const count = highRiskWordNumber(artifactHandCopy[1] ?? "one", 1);
    const delayed = /end of your opponent'?s turn, destroy this card/i.test(artifactHandCopy[0]);
    const candidates = ctx.player.hand.filter(item => highRiskIsArtifact(item.card) && costOf(item) <= 5).slice(0, count);
    let summoned = 0; for (const item of candidates) if (highRiskSummonExactFromHand(ctx, item, delayed)) summoned += 1;
    actions.push(`summon ${summoned} exact Artifact hand copies`);
    text = text.replace(artifactHandCopy[0], " ");
  }

  const selfCopyVariant = text.match(/Summon\s+(?:(a|an|one|two|three|four|five|\d+)\s+)?(?:an?\s+)?exact copies? of (?:this card|it)\.?/i);
  if (selfCopyVariant && ctx.sourceUnit) {
    const count = highRiskWordNumber(selfCopyVariant[1] ?? "one", 1); let summoned = 0;
    for (let i=0;i<count;i+=1) if (highRiskSummonExactFromUnit(ctx, ctx.sourceUnit, false)) summoned += 1;
    actions.push(`summon ${summoned} exact self copies`);
    text = text.replace(selfCopyVariant[0], " ");
  }
  const conditionalSelfCopies = text.match(/If this card'?s cost isn'?t 3,\s*Summon\s*(\d+)\s+exact copies of it\.?/i);
  if (conditionalSelfCopies && ctx.sourceUnit) {
    let summoned = 0;
    if (costOf(ctx.instance) !== 3) for (let i=0;i<Number(conditionalSelfCopies[1]);i+=1) if (highRiskSummonExactFromUnit(ctx, ctx.sourceUnit, false)) summoned += 1;
    actions.push(`conditional exact self copies ${summoned}`);
    text = text.replace(conditionalSelfCopies[0], " ");
  }

  // Kandima's Super-Evolve grammar can select either side; prefer an allied
  // amulet because that is the tactically meaningful branch.
  const kandimaDestroy = /Select another card on the field and destroy it\.\s*If you selected an allied amulet, deal\s*(\d+)\s+damage to all enemy followers\.?/i;
  const kandimaDestroyMatch = text.match(kandimaDestroy);
  if (kandimaDestroyMatch) {
    const target = ctx.player.board.find(unit => unit.uid !== ctx.sourceUnit?.uid && unit.type === "Amulet")
      ?? ctx.opponent.board[0] ?? ctx.player.board.find(unit => unit.uid !== ctx.sourceUnit?.uid) ?? null;
    const alliedAmulet = target && ctx.player.board.includes(target) && target.type === "Amulet";
    if (target) {
      const owner = ctx.player.board.includes(target) ? ctx.player : ctx.opponent;
      const other = owner === ctx.player ? ctx.opponent : ctx.player;
      const oi = owner === ctx.player ? ctx.playerIndex : ctx.enemyIndex;
      const ei = owner === ctx.player ? ctx.enemyIndex : ctx.playerIndex;
      actions.push(...destroyObject(owner, other, target, oi, ei, ctx.stats, ctx.rng, ctx.cardMap, true));
    }
    if (alliedAmulet) for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, Number(kandimaDestroyMatch[1])||0, ctx.opponent, ctx.player, ctx, actions);
    actions.push(`Kandima selected destruction${alliedAmulet ? " · amulet payoff" : ""}`);
    text = text.replace(kandimaDestroy, " ");
  }

  const supplicantDestroy = /Select another allied card on the field\.\s*If you selected one, destroy it and deal\s*(\d+)\s+damage to a random enemy follower\.?/i;
  const supplicantDestroyMatch = text.match(supplicantDestroy);
  if (supplicantDestroyMatch) {
    const target = ctx.player.board.find(unit => unit.uid !== ctx.sourceUnit?.uid) ?? null;
    if (target) actions.push(...destroyObject(ctx.player, ctx.opponent, target, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true));
    const pool = ctx.opponent.board.filter(unit => unit.type === "Follower");
    const enemy = pool.length ? pool[Math.floor(ctx.rng()*pool.length)] : null;
    if (target && enemy) damageUnit(enemy, Number(supplicantDestroyMatch[1])||0, ctx.opponent, ctx.player, ctx, actions);
    actions.push(`Supplicant selected destruction${target ? "" : " unavailable"}`);
    text = text.replace(supplicantDestroy, " ");
  }

  // Combined selected damage + Artifact-history EP grammar.
  const journey = text.match(/Select an enemy follower on the field and deal it\s*(\d+)\s*damage\.\s*If at least 3 differently named allied Artifact followers have entered the field this match, recover 1 evolution point\.?/i);
  if (journey) {
    const target = choosePlannedTarget(ctx, ctx.opponent.board.filter(unit => unit.type === "Follower"));
    if (target) damageUnit(target, Number(journey[1])||0, ctx.opponent, ctx.player, ctx, actions);
    const history = new Set((ctx.player.artifactFollowerNamesEntered ?? []).map(norm)).size;
    if (history >= 3) ctx.player.ep = Math.min(2, (Number(ctx.player.ep)||0)+1);
    actions.push(`Journey: damage ${journey[1]} · Artifact history ${history}`);
    text = text.replace(journey[0], " ");
  }

  const behemothVariant = /If the sum of the 3 highest base costs in your hand is higher than that of your opponent'?s, destroy all enemy followers\.?/i;
  if (behemothVariant.test(text)) {
    const sum = hand => [...hand].map(item => Number(item.card?.cost)||0).sort((a,b)=>b-a).slice(0,3).reduce((a,b)=>a+b,0);
    const own = sum(ctx.player.hand), enemy = sum(ctx.opponent.hand);
    if (own > enemy) for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) destroyUnit(ctx.opponent, unit);
    actions.push(`top-3 hand cost ${own} vs ${enemy}`);
    text = text.replace(behemothVariant, " ");
  }
  const goddessVariant = /Add an exact copy each of the 3 leftmost cards in your hand to your hand without revealing them\.?/i;
  if (goddessVariant.test(text)) {
    const sources = ctx.player.hand.slice(0,3); let added=0;
    for (const source of sources) if (highRiskAddCopyToHand(ctx, source, {exact:true})) added += 1;
    actions.push(`copy ${added} leftmost hand cards`);
    text = text.replace(goddessVariant, " ");
  }

'''
text = text.replace(anchor, extra + anchor, 1)
ENGINE.write_text(text, encoding="utf-8")
print("Materialized Battle Sim high-risk grammar coverage.")
