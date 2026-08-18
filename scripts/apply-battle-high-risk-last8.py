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

  // [[battle-high-risk-last-eight]]
  const finalCardName = norm(ctx.card?.name);

  if (finalCardName === "fediel, darkness personified" && /Necromancy/i.test(text) && /evolve them/i.test(text)) {
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
    text = "";
  }

  if (["armes, depletive demon", "reno, luxwing featherfolk", "karula, eternal arts"].includes(finalCardName)
      && /can attack\s*\d+\s*times per turn/i.test(text)) {
    const match = text.match(/can attack\s*(\d+)\s*times per turn/i);
    const count = Number(match?.[1]) || 1;
    if (ctx.sourceUnit) {
      ctx.sourceUnit.baseMaxAttacks = Math.max(count, Number(ctx.sourceUnit.baseMaxAttacks) || 1);
      ctx.sourceUnit.maxAttacks = Math.max(count, Number(ctx.sourceUnit.maxAttacks) || 1);
    }
    actions.push(`${ctx.card.name}: attack ×${count}`);
    text = "";
  }

  if (finalCardName === "inspirational one" && /activates in hand/i.test(text)) {
    if (ctx.sourceUnit) highRiskGrantKeyword(ctx.sourceUnit, "Ward");
    actions.push("Inspirational One: enemy Super-Evolve hand trigger · Ward");
    text = "";
  }
  if (finalCardName === "dogged one" && /activates in hand/i.test(text)) {
    if (ctx.sourceUnit) highRiskGrantKeyword(ctx.sourceUnit, "Rush");
    actions.push("Dogged One: enemy Super-Evolve hand trigger · Rush");
    text = "";
  }

  if (finalCardName === "chaos legion" && /Super Skybound Art/i.test(text)) {
    const gauge = skyboundCountForInstance(ctx);
    const amount = gauge >= 15 ? 6 : 3;
    for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) {
      damageUnit(unit, amount, ctx.opponent, ctx.player, ctx, actions);
    }
    const dealt = damageLeader(ctx.opponent, amount);
    ctx.stats.damageDealt[ctx.playerIndex] += dealt;
    actions.push(`Chaos Legion: ${amount} damage to all enemies · gauge ${gauge}`);
    text = "";
  }

  if (finalCardName === "seofon, leader of the eternals" && /Skybound Art/i.test(text)) {
    const gauge = skyboundCountForInstance(ctx);
    const targets = [...ctx.player.board].filter(unit => unit.type === "Follower" && !unit.evolved && !unit.superEvolved);
    if (gauge >= 15) {
      for (const unit of targets) superEvolveUnitByAbility(ctx, unit, actions);
    } else if (gauge >= 10) {
      for (const unit of targets) evolveUnitByAbility(ctx, unit, actions);
    }
    actions.push(`Seofon: ${gauge >= 15 ? "Super Skybound" : gauge >= 10 ? "Skybound" : "inactive"} · gauge ${gauge}`);
    text = "";
  }

'''
text = text.replace(anchor, preflight, 1)
ENGINE.write_text(text, encoding="utf-8")
print("Closed final eight generic high-risk runtime sections.")
