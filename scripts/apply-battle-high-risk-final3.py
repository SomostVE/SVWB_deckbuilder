from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
text = ENGINE.read_text(encoding="utf-8")
anchor = '''function resolveText(raw, ctx) {
'''
if anchor not in text:
    raise SystemExit("Missing resolveText anchor")

replacement = r'''function resolveText(raw, ctx) {
  // [[battle-high-risk-final-three-preprocess]]
  // These effects contain syntax that is itself consumed by earlier generic
  // preprocessors (Necromancy/Skybound). Resolve the complete compound first.
  const highRiskRaw = String(raw ?? "");
  const highRiskName = norm(ctx.card?.name);

  if (highRiskName === "fediel, darkness personified" && /Necromancy/i.test(highRiskRaw) && /evolve them/i.test(highRiskRaw)) {
    const actions = [];
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
    return { applied: true, actions: uniq(actions), unresolved: false };
  }

  if (highRiskName === "chaos legion" && /Super Skybound Art/i.test(highRiskRaw)) {
    const actions = [];
    const gauge = skyboundCountForInstance(ctx);
    const amount = gauge >= 15 ? 6 : 3;
    for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) {
      damageUnit(unit, amount, ctx.opponent, ctx.player, ctx, actions);
    }
    const dealt = damageLeader(ctx.opponent, amount);
    ctx.stats.damageDealt[ctx.playerIndex] += dealt;
    actions.push(`Chaos Legion: ${amount} damage to all enemies · gauge ${gauge}`);
    return { applied: true, actions: uniq(actions), unresolved: false };
  }

  if (highRiskName === "seofon, leader of the eternals" && /Skybound Art/i.test(highRiskRaw)) {
    const actions = [];
    const gauge = skyboundCountForInstance(ctx);
    const targets = [...ctx.player.board].filter(unit => unit.type === "Follower" && !unit.evolved && !unit.superEvolved);
    if (gauge >= 15) {
      for (const unit of targets) superEvolveUnitByAbility(ctx, unit, actions);
    } else if (gauge >= 10) {
      for (const unit of targets) evolveUnitByAbility(ctx, unit, actions);
    }
    actions.push(`Seofon: ${gauge >= 15 ? "Super Skybound" : gauge >= 10 ? "Skybound" : "inactive"} · gauge ${gauge}`);
    return { applied: true, actions: uniq(actions), unresolved: false };
  }
'''
text = text.replace(anchor, replacement, 1)
ENGINE.write_text(text, encoding="utf-8")
print("Resolved final three preprocessed high-risk clauses.")
