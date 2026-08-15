from pathlib import Path

path = Path("js/battle-engine-v5.js")
text = path.read_text()


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    text = text.replace(old, new, 1)


old_bonus = '''  const currentScore = Number(current?.score ?? -Infinity);
  const boostedScore = Number(boosted.score ?? -Infinity);
  const improvement = boostedScore - currentScore;
  const curveUpgrade = boostedSpend > currentSpend;
  const firstChargeDeadline = player.personalTurn === 5 && player.bonusPpUses === 0;
  const laterCharge = player.personalTurn >= 6 && player.bonusPpUses >= 1;
  const enemyBoard = opponent.board.filter(unit => unit.type === "Follower");

  let threshold = 1.5;
'''
new_bonus = '''  const currentScore = Number(current?.score ?? -Infinity);
  const boostedScore = Number(boosted.score ?? -Infinity);
  const improvement = boostedScore - currentScore;
  const curveUpgrade = boostedSpend > currentSpend;
  const firstChargeDeadline = player.personalTurn === 5 && player.bonusPpUses === 0;
  const laterCharge = player.personalTurn >= 6 && player.bonusPpUses >= 1;
  const enemyBoard = opponent.board.filter(unit => unit.type === "Follower");
  const boostedText = norm(boosted?.mode?.text || boosted?.instance?.card?.text || boosted?.text || "");
  const boostedCard = boosted?.instance?.card ?? boosted?.unit?.card ?? null;
  const rampUnlock = style === "ramp" && /maximum play points/.test(boostedText);
  const controlUnlock = control && (/destroy|banish|draw|restore .*leader/.test(boostedText) || has(boostedCard ?? {}, "Ward"));
  const earlyEmptyCurve = !current && player.personalTurn <= 3;

  // Going second should not automatically burn its scarce extra-PP charge just
  // to fill an otherwise empty early curve. Ramp/control save it for a real
  // engine, answer or defensive breakpoint.
  if (earlyEmptyCurve && (style === "ramp" || control) && !rampUnlock && !controlUnlock && enemyBoard.length < 2) return false;

  let threshold = 1.5;
'''
replace_once(old_bonus, new_bonus, "extra PP reserve")

old_gate = '''  if (options.phase === "pre-development") {
    const style = String(player.strategy?.style ?? "midrange");
    const foeCount = opponent.board.filter(unit => unit.type === "Follower").length;
    const threshold = style === "ward-control" || style === "control" ? 5 : style === "aggro" ? 7 : 6;
    const highImpact = effectBest >= threshold;
    const urgentClear = foeCount >= 3 && effectBest >= 4;
    const crowdedSequence = player.board.length >= 4 && effectBest >= 5;
    if (!highImpact && !urgentClear && !crowdedSequence) return null;
  }
'''
new_gate = '''  if (options.phase === "pre-development") {
    const style = String(player.strategy?.style ?? "midrange");
    const foeCount = opponent.board.filter(unit => unit.type === "Follower").length;
    const threshold = style === "ward-control" || style === "control" ? 7 : style === "aggro" ? 9 : 8;
    const highImpact = effectBest >= threshold;
    const urgentClear = foeCount >= 3 && effectBest >= 6;
    const crowdedSequence = player.board.length >= 4 && effectBest >= 7;
    if (!highImpact && !urgentClear && !crowdedSequence) return null;
  }
'''
replace_once(old_gate, new_gate, "conservative pre-development evolution")

old_ward_score = '''  if (has(card, "Ward")) score += (style === "ward-control" || style === "control") ? (player.hp <= 10 ? 4 : 2) : .5;
'''
new_ward_score = '''  if (has(card, "Ward")) score += (style === "ward-control" || style === "control") ? (player.hp <= 10 ? 3 : .75) : .5;
'''
replace_once(old_ward_score, new_ward_score, "Ward development weighting")

path.write_text(text)
print("Battle AI v2.1 tuning materialized")
