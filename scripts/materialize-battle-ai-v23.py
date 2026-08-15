from pathlib import Path

path = Path("js/battle-engine-v5.js")
text = path.read_text()


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    text = text.replace(old, new, 1)

old_gate = '''  if (options.phase === "pre-development") {
    const style = String(player.strategy?.style ?? "midrange");
    const foeCount = opponent.board.filter(unit => unit.type === "Follower").length;
    const threshold = style === "ward-control" || style === "control" ? 7 : style === "aggro" ? 9 : 8;
    const highImpact = effectBest >= threshold;
    const urgentClear = foeCount >= 3 && effectBest >= 6;
    const crowdedSequence = player.board.length >= 4 && effectBest >= 7;
    if (!highImpact && !urgentClear && !crowdedSequence) return null;
  }

  const tacticalNeed = opponent.board.some(unit => unit.type === "Follower")
'''
new_gate = '''  const style = String(player.strategy?.style ?? "midrange");
  const foeFollowers = opponent.board.filter(unit => unit.type === "Follower");
  const alliedFollowers = player.board.filter(unit => unit.type === "Follower");
  const foeThreat = boardCombatThreat(foeFollowers);
  const alliedThreat = boardCombatThreat(alliedFollowers);

  if (options.phase === "pre-development") {
    const foeCount = foeFollowers.length;
    const threshold = style === "ward-control" || style === "control" ? 7 : style === "aggro" ? 9 : 8;
    const highImpact = effectBest >= threshold;
    const urgentClear = foeCount >= 3 && effectBest >= 6;
    const crowdedSequence = player.board.length >= 4 && effectBest >= 7;
    const catchUpSequence = foeThreat >= alliedThreat + 5 && effectBest >= 4;
    if (!highImpact && !urgentClear && !crowdedSequence && !catchUpSequence) return null;
  }

  // Control decks should not spend an evolution purely for +2/+2 into a low
  // pressure board. Save the point for a meaningful removal, value trigger or
  // defensive breakpoint later in the game.
  if (options.phase === "post-development" && (style === "ward-control" || style === "control")) {
    const healthy = player.hp > 12;
    const lowPressure = foeThreat < 7 && foeThreat <= alliedThreat + 2;
    if (healthy && lowPressure && effectBest < 3 && opponent.hp > 10) return null;
  }

  const tacticalNeed = opponent.board.some(unit => unit.type === "Follower")
'''
replace_once(old_gate, new_gate, "evolution resource policy")

old_should = '''function shouldFace(attacker, player, opponent, foes, rng) {
  if (attacker.attack >= opponent.hp || !foes.length) return true;

  const style = String(player.strategy?.style ?? "midrange");
  const killable = foes.filter(target => canCombatRemove(attacker, target));
  const enemyAttack = foes.reduce((sum, unit) => sum + Math.max(0, Number(unit.attack) || 0), 0);
  const alliedAttack = player.board
    .filter(unit => unit.type === "Follower")
    .reduce((sum, unit) => sum + Math.max(0, Number(unit.attack) || 0), 0);
  const defensiveEmergency = killable.length > 0 && enemyAttack >= Math.max(5, player.hp - 3);
  const materiallyBehind = killable.length > 0 && enemyAttack >= alliedAttack + 4;
  const highThreat = killable.some(target => (Number(target.attack) || 0) >= 4);

  // Aggro should pressure, not blindly ignore every profitable or necessary
  // trade. The previous unconditional face rule amplified first-player snowball.
  if (style === "aggro") {
    if (defensiveEmergency) return false;
    if (materiallyBehind && opponent.hp > 8) return false;
    if (highThreat && opponent.hp > 12) return false;
    return true;
  }

  if (defensiveEmergency) return false;
  const faceBias = clamp(Number(player.strategy?.faceBias ?? .5), 0, 1);
  return faceBias >= .65 || rng() < faceBias;
}
'''
new_should = '''function shouldFace(attacker, player, opponent, foes, rng) {
  if (attacker.attack >= opponent.hp || !foes.length) return true;

  const style = String(player.strategy?.style ?? "midrange");
  const faceBias = clamp(Number(player.strategy?.faceBias ?? .5), 0, 1);
  const killable = foes.filter(target => canCombatRemove(attacker, target));
  const enemyAttack = foes.reduce((sum, unit) => sum + Math.max(0, Number(unit.attack) || 0), 0);
  const alliedAttack = player.board
    .filter(unit => unit.type === "Follower")
    .reduce((sum, unit) => sum + Math.max(0, Number(unit.attack) || 0), 0);
  const defensiveEmergency = killable.length > 0 && enemyAttack >= Math.max(5, player.hp - 3);
  const materiallyBehind = killable.length > 0 && enemyAttack >= alliedAttack + 4;
  const highThreat = killable.some(target => (Number(target.attack) || 0) >= 4);
  const efficientTrade = killable.some(target => {
    const targetThreat = Math.max(0, Number(target.attack) || 0) * 2.2 + Math.max(0, Number(target.defense) || 0);
    const ownValue = Math.max(0, Number(attacker.attack) || 0) * 1.5 + Math.max(0, Number(attacker.defense) || 0);
    const survives = !willFollowerDieInCombat(attacker, target, player);
    return survives || targetThreat >= ownValue * .72;
  });

  // Aggro pressures by default, but still respects lethal threats and severe
  // board deficits instead of treating every follower as irrelevant.
  if (style === "aggro") {
    if (defensiveEmergency) return false;
    if (materiallyBehind && opponent.hp > 8) return false;
    if (highThreat && opponent.hp > 12) return false;
    return true;
  }

  if (defensiveEmergency) return false;

  // Control should convert available attacks into board stability. Randomly
  // going face while a profitable trade exists is especially damaging when
  // playing from behind, and was a major source of mirror snowballing.
  if (style === "ward-control" || style === "control") {
    if (killable.length && (efficientTrade || materiallyBehind || highThreat || opponent.hp > 10)) return false;
    if (opponent.hp <= 8) return true;
    return faceBias >= .55 && rng() < faceBias;
  }

  if (style === "puppetry-tempo" || style === "buff-tempo") {
    if (materiallyBehind) return false;
    if (efficientTrade && opponent.hp > 11 && faceBias < .65) return false;
    return faceBias >= .65 || rng() < faceBias;
  }

  if (style === "ramp") {
    if (materiallyBehind || (efficientTrade && opponent.hp > 10)) return false;
    return opponent.hp <= 9 ? true : (faceBias >= .65 || rng() < faceBias * .7);
  }

  return faceBias >= .65 || rng() < faceBias;
}

function boardCombatThreat(units) {
  return (units ?? []).reduce((sum, unit) => sum
    + Math.max(0, Number(unit.attack) || 0) * 2
    + Math.max(0, Number(unit.defense) || 0) * .45
    + (hasU(unit, "Ward") ? 1.5 : 0)
    + (hasU(unit, "Bane") ? 1.5 : 0), 0);
}
'''
replace_once(old_should, new_should, "strategy-aware face trade policy")

path.write_text(text)
print("Battle AI v2.3 tactical policy materialized")
