from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
text = ENGINE.read_text(encoding="utf-8")

# Devotee QA: ensure two separate damage events are both survived.
old = '''  const devoteeUnit = boardFollower(instance(devotee.player, byName("Devotee of Disdain")));
  devotee.player.board = [devoteeUnit];'''
new = '''  const devoteeUnit = boardFollower(instance(devotee.player, byName("Devotee of Disdain")));
  // Give the QA subject enough defense to survive two separate damage events;
  // the card only draws when the damage event does not destroy it.
  devoteeUnit.defense += 2;
  devoteeUnit.maxDefense += 2;
  devotee.player.board = [devoteeUnit];'''
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("Missing Devotee QA anchor")

# Mari uses comma-form turn-end wording rather than the colon-form parser used by
# generic triggered sections. Dispatch it explicitly when no generic turn-end
# section was extracted.
old = '''  for (const unit of [...player.board]) {
    const text = getUnitTriggeredText(unit, "turnEnd");
    if (text) {
      const result = resolveText(text, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map });
      actions.push(...result.actions.map(action => `${unit.name}: ${action}`));
    }
  }'''
new = '''  for (const unit of [...player.board]) {
    const text = getUnitTriggeredText(unit, "turnEnd");
    if (text) {
      const result = resolveText(text, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map });
      actions.push(...result.actions.map(action => `${unit.name}: ${action}`));
    } else {
      // [[battle-dragoncraft-follower-turn-end]]
      actions.push(...applyDragoncraftFollowerTurnEnd({ player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, unit));
    }
  }'''
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("Missing turnEnd Dragoncraft dispatch anchor")

helper_anchor = '''function applyDragoncraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {'''
helper_block = '''function applyDragoncraftFollowerTurnEnd(ctx, unit) {
  if (!unit || unit.type !== "Follower" || norm(unit.name) !== "mari, meg's bestie") return [];
  const candidates = ctx.player.board.filter(target => target.type === "Follower" && target.superEvolved);
  if (!candidates.length) return [];
  const target = candidates[Math.floor(ctx.rng() * candidates.length)];
  target.attack += 1;
  target.defense += 1;
  target.maxDefense += 1;
  return [`Mari, Meg's Bestie: +1/+1 ${target.name}`];
}

function applyDragoncraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {'''
if "function applyDragoncraftFollowerTurnEnd" not in text:
    if helper_anchor not in text:
        raise SystemExit("Missing Dragoncraft turn-end helper anchor")
    text = text.replace(helper_anchor, helper_block, 1)

# Exercise the actual explicit turn-end dispatcher instead of calling the text
# resolver manually.
old = '''  const base3 = boardFollower(instance(mari.player, dummy("Base Three", 3, 2, 2)));
  mari.player.board = [base3];
  superEvolveUnitByAbility(ctxOf(mari), base3, []);
  const mariCostDuring = costOf(mariInst);
  const statsBeforeMari = [base3.attack, base3.defense];
  const mariTurnText = getUnitTriggeredText(boardFollower(instance(mari.player, byName("Mari, Meg's Bestie"))), "turnEnd");
  resolveText(mariTurnText, { ...ctxOf(mari), card: byName("Mari, Meg's Bestie"), sourceUnit: null });
  const mariBuff = [base3.attack - statsBeforeMari[0], base3.defense - statsBeforeMari[1]];'''
new = '''  const base3 = boardFollower(instance(mari.player, dummy("Base Three", 3, 2, 2)));
  const mariSource = boardFollower(instance(mari.player, byName("Mari, Meg's Bestie")));
  mari.player.board = [base3, mariSource];
  superEvolveUnitByAbility(ctxOf(mari), base3, []);
  const mariCostDuring = costOf(mariInst);
  const statsBeforeMari = [base3.attack, base3.defense];
  applyDragoncraftFollowerTurnEnd(ctxOf(mari), mariSource);
  const mariBuff = [base3.attack - statsBeforeMari[0], base3.defense - statsBeforeMari[1]];'''
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("Missing Mari QA anchor")

ENGINE.write_text(text, encoding="utf-8")
print("Applied Dragoncraft materializer fixes.")
