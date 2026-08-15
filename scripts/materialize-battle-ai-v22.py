from pathlib import Path

path = Path("js/battle-engine-v5.js")
text = path.read_text()


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    text = text.replace(old, new, 1)

replace_once(
'''      useBonusPpIfUseful(p, o);
      runTurnAi({
''',
'''      runTurnAi({
''',
"move extra PP into turn planner")

replace_once(
'''  while (safety++ < MAX_ACTIONS) {
    // Never develop past a lethal already available on board.
''',
'''  while (safety++ < MAX_ACTIONS) {
    // Extra PP is a turn action in Worlds Beyond, not a start-of-turn trigger.
    // Re-evaluate it after every action so the second player can spend it at
    // the actual tactical breakpoint instead of blindly firing it up front.
    useBonusPpIfUseful(player, opponent);

    // Never develop past a lethal already available on board.
''',
"mid-turn extra PP planner")

replace_once(
'''function attackPhase(player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, map, record, options = {}) {
  const setupOnly = Boolean(options.setupOnly);
  const attackers = setupOnly ? rankSetupAttackers(player, opponent) : [...player.board].filter(unit => unit.type === "Follower");
  for (const attacker of attackers) {
    if (setupOnly && player.board.length < 5) return;
    while (player.board.includes(attacker) && attacker.attacksMade < attacker.maxAttacks) {
''',
'''function attackPhase(player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, map, record, options = {}) {
  const setupOnly = Boolean(options.setupOnly);
  let attackGuard = 0;
  while (attackGuard++ < MAX_ACTIONS) {
    if (setupOnly && player.board.length < 5) return;
    const attackers = setupOnly ? rankSetupAttackers(player, opponent) : rankAttackers(player, opponent);
    const attacker = attackers[0];
    if (!attacker) return;
    while (player.board.includes(attacker) && attacker.attacksMade < attacker.maxAttacks) {
''',
"dynamic attacker selection")

old_helpers = '''function attackable(board) { return board.filter(unit => unit.type === "Follower" && !unit.intimidate && !unit.ambush); }
function activeWards(board) { return board.filter(unit => unit.type === "Follower" && hasU(unit, "Ward") && !unit.intimidate && !unit.ambush); }

function rankSetupAttackers(player, opponent) {
'''
new_helpers = '''function attackable(board) { return board.filter(unit => unit.type === "Follower" && !unit.intimidate && !unit.ambush); }
function activeWards(board) { return board.filter(unit => unit.type === "Follower" && hasU(unit, "Ward") && !unit.intimidate && !unit.ambush); }

// [[battle-ai-v2-2-attack-order]]
function rankAttackers(player, opponent) {
  const wards = activeWards(opponent.board);
  const foes = attackable(opponent.board);
  const lethal = hasCollectiveBoardLethal(player, opponent);
  return player.board
    .filter(unit => unit.type === "Follower" && unit.attacksMade < unit.maxAttacks && canAttackCurrentState(unit, wards, foes))
    .map(unit => ({ unit, score: attackPriorityScore(unit, player, opponent, wards, foes, lethal) }))
    .sort((a, b) => b.score - a.score || String(a.unit.uid).localeCompare(String(b.unit.uid)))
    .map(entry => entry.unit);
}

function canAttackCurrentState(unit, wards, foes) {
  if (wards.length) return Boolean(unit.canAttackFollower && wards.length);
  return Boolean(unit.canAttackLeader || (unit.canAttackFollower && foes.length));
}

function attackPriorityScore(attacker, player, opponent, wards, foes, lethal) {
  const attack = Math.max(0, Number(attacker.attack) || 0);
  const defense = Math.max(0, Number(attacker.defense) || 0);
  if (lethal && attacker.canAttackLeader && !wards.length) return 1000 + attack * 10;

  const targets = wards.length ? wards : foes;
  const removable = attacker.canAttackFollower
    ? targets.filter(target => canCombatRemove(attacker, target))
    : [];
  let score = 0;

  // Rush-only bodies must cash in their combat utility before versatile
  // attackers. Among valid trades, prefer the smallest sufficient body so a
  // large follower is not wasted into a tiny target.
  if (attacker.canAttackFollower && !attacker.canAttackLeader) score += 18;
  if (removable.length) {
    const bestTarget = tradeTarget(attacker, removable, player.strategy);
    const threat = Math.max(0, Number(bestTarget?.attack) || 0) * 2.5 + Math.max(0, Number(bestTarget?.defense) || 0);
    const overkill = hasU(attacker, "Bane") ? 0 : Math.max(0, attack - Math.max(0, Number(bestTarget?.defense) || 0));
    const survives = !willFollowerDieInCombat(attacker, bestTarget, player);
    score += 22 + threat + (survives ? 8 : 0) - overkill * 1.5;
  }

  const strikeText = getUnitTriggeredText(attacker, "strike");
  if (strikeText) score += 5 + evolutionTextValue(strikeText, player, opponent, attacker) * .5;
  if (attacker.canAttackLeader && !wards.length) {
    const style = String(player.strategy?.style ?? "midrange");
    const faceWeight = style === "aggro" ? 1.8 : style === "buff-tempo" || style === "puppetry-tempo" ? 1.1 : .55;
    score += attack * faceWeight;
    if (opponent.hp <= attack) score += 500;
  }
  if (hasU(attacker, "Bane") && removable.length) score += 3;
  if (attacker.superEvolved && removable.length) score += 2;
  score -= defense * .03;
  return score;
}

function rankSetupAttackers(player, opponent) {
'''
replace_once(old_helpers, new_helpers, "attacker ranking helpers")

path.write_text(text)
print("Battle AI v2.2 action ordering materialized")
