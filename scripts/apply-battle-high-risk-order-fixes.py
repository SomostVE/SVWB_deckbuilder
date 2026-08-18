from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
text = ENGINE.read_text(encoding="utf-8")
anchor = '''function resolveHighRiskGenericText(textValue, ctx) {
  let text = String(textValue ?? "");
  const actions = [];
'''
if anchor not in text:
    raise SystemExit("Missing high-risk resolver start")

preflight = r'''function resolveHighRiskGenericText(textValue, ctx) {
  let text = String(textValue ?? "");
  const actions = [];

  // [[battle-high-risk-compound-preflight]]
  // Compound clauses must be consumed before their inner generic subclauses,
  // otherwise a broad summon/damage matcher can erase the condition/payoff.
  const limil = text.match(/If your leader'?s defense is higher than the enemy leader'?s defense, summon\s*(\d+)\s+copies of Bat\.?/i);
  if (limil) {
    let summoned = 0;
    if (ctx.player.hp > ctx.opponent.hp) {
      const bat = findByName(ctx.cardMap, "Bat") ?? related(ctx.card, ctx.cardMap).find(card => norm(card.name) === "bat");
      if (bat) summoned = summonWithEvents(ctx.player, bat, Number(limil[1]) || 0, ctx.playerIndex, ctx);
    }
    actions.push(`conditional Bat summons ${summoned}`);
    text = text.replace(limil[0], " ");
  }

  const marsha = text.match(/Deal\s*(\d+)\s*damage to all enemy followers and both leaders\.?/i);
  if (marsha) {
    const amount = Number(marsha[1]) || 0;
    for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, amount, ctx.opponent, ctx.player, ctx, actions);
    const dealt = damageLeader(ctx.opponent, amount); ctx.stats.damageDealt[ctx.playerIndex] += dealt;
    damageLeader(ctx.player, amount);
    actions.push(`${amount} damage to enemy followers and both leaders`);
    text = text.replace(marsha[0], " ");
  }

  const kandima = text.match(/Select another card on the field and destroy it\.\s*If you selected an allied amulet, deal\s*(\d+)\s*damage to all enemy followers\.?/i);
  if (kandima) {
    const target = ctx.player.board.find(unit => unit.uid !== ctx.sourceUnit?.uid && unit.type === "Amulet")
      ?? ctx.opponent.board[0] ?? ctx.player.board.find(unit => unit.uid !== ctx.sourceUnit?.uid) ?? null;
    const alliedAmulet = Boolean(target && ctx.player.board.includes(target) && target.type === "Amulet");
    if (target) {
      const owner = ctx.player.board.includes(target) ? ctx.player : ctx.opponent;
      const other = owner === ctx.player ? ctx.opponent : ctx.player;
      const oi = owner === ctx.player ? ctx.playerIndex : ctx.enemyIndex;
      const ei = owner === ctx.player ? ctx.enemyIndex : ctx.playerIndex;
      actions.push(...destroyObject(owner, other, target, oi, ei, ctx.stats, ctx.rng, ctx.cardMap, true));
    }
    if (alliedAmulet) for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, Number(kandima[1]) || 0, ctx.opponent, ctx.player, ctx, actions);
    actions.push(`selected destruction${alliedAmulet ? " · allied amulet payoff" : ""}`);
    text = text.replace(kandima[0], " ");
  }

  const supplicant = text.match(/Select another allied card on the field\.\s*If you selected one, destroy it and deal\s*(\d+)\s*damage to a random enemy follower\.?/i);
  if (supplicant) {
    const target = ctx.player.board.find(unit => unit.uid !== ctx.sourceUnit?.uid) ?? null;
    if (target) actions.push(...destroyObject(ctx.player, ctx.opponent, target, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true));
    const pool = ctx.opponent.board.filter(unit => unit.type === "Follower");
    const enemy = pool.length ? pool[Math.floor(ctx.rng() * pool.length)] : null;
    if (target && enemy) damageUnit(enemy, Number(supplicant[1]) || 0, ctx.opponent, ctx.player, ctx, actions);
    actions.push(`selected allied destruction${target ? "" : " unavailable"}`);
    text = text.replace(supplicant[0], " ");
  }

  const destroyedFollowerHidden = text.match(/Add a copy of a random allied follower destroyed this match to your hand without revealing it\.?/i);
  if (destroyedFollowerHidden) {
    const cards = highRiskHistoryCards(ctx.player.destroyedFollowers, 1, null, ctx.rng, true);
    for (const card of cards) highRiskAddCopyToHand(ctx, card);
    actions.push(`destroyed follower hidden copy ${cards.length}`);
    text = text.replace(destroyedFollowerHidden[0], " ");
  }
  const destroyedArtifactHidden = text.match(/Add a copy of a random allied Artifact follower destroyed this match to your hand without revealing it\.?/i);
  if (destroyedArtifactHidden) {
    const cards = highRiskHistoryCards(ctx.player.destroyedFollowers, 1, highRiskIsArtifact, ctx.rng, true);
    for (const card of cards) highRiskAddCopyToHand(ctx, card);
    actions.push(`destroyed Artifact hidden copy ${cards.length}`);
    text = text.replace(destroyedArtifactHidden[0], " ");
  }

  const doomwright = text.match(/Select 2 Artifact followers in your hand that cost 5 or less, summon an exact copy of each, and give the exact copies ["“]At the end of your opponent'?s turn, destroy this card\.["”]/i);
  if (doomwright) {
    const candidates = ctx.player.hand.filter(item => highRiskIsArtifact(item.card) && costOf(item) <= 5).slice(0, 2);
    let summoned = 0;
    for (const item of candidates) if (highRiskSummonExactFromHand(ctx, item, true)) summoned += 1;
    actions.push(`summon ${summoned} delayed exact Artifact copies`);
    text = text.replace(doomwright[0], " ");
  }

  const congregantConditional = text.match(/If this card'?s cost isn'?t 3, summon\s*(\d+)\s+exact copies of it\.?/i);
  if (congregantConditional) {
    let summoned = 0;
    if (costOf(ctx.instance) !== 3 && ctx.sourceUnit) {
      for (let i = 0; i < Number(congregantConditional[1]); i += 1) if (highRiskSummonExactFromUnit(ctx, ctx.sourceUnit, false)) summoned += 1;
    }
    actions.push(`conditional exact self copies ${summoned}`);
    text = text.replace(congregantConditional[0], " ");
  }
  const selfExact = text.match(/Summon an exact copy of this card\.?/i);
  if (selfExact && ctx.sourceUnit) {
    const summoned = highRiskSummonExactFromUnit(ctx, ctx.sourceUnit, false) ? 1 : 0;
    actions.push(`summon ${summoned} exact self copy`);
    text = text.replace(selfExact[0], " ");
  }

  const damageSigil = text.match(/Select an enemy follower on the field and deal it\s*(\d+)\s*damage\.\s*Gain an earth sigil\.?/i);
  if (damageSigil) {
    const target = choosePlannedTarget(ctx, ctx.opponent.board.filter(unit => unit.type === "Follower"));
    if (target) damageUnit(target, Number(damageSigil[1]) || 0, ctx.opponent, ctx.player, ctx, actions);
    ctx.player.earthSigils += 1;
    actions.push(`selected damage ${damageSigil[1]} · Earth Sigil +1`);
    text = text.replace(damageSigil[0], " ");
  }

  const selfBuff = text.match(/Give this follower\s*\+(\d+)\s*\/\s*\+(\d+)(?:\s+and)?\.?/i);
  if (selfBuff && ctx.sourceUnit) {
    buff(ctx.sourceUnit, Number(selfBuff[1]) || 0, Number(selfBuff[2]) || 0);
    actions.push(`this follower +${selfBuff[1]}/+${selfBuff[2]}`);
    text = text.replace(selfBuff[0], " ");
  }
'''

text = text.replace(anchor, preflight, 1)
ENGINE.write_text(text, encoding="utf-8")
print("Applied high-risk compound ordering fixes.")
