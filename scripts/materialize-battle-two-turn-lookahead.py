from pathlib import Path

path = Path('js/battle-engine-v5.js')
text = path.read_text(encoding='utf-8')

def repl(old, new, label, count=1):
    global text
    if old not in text:
        raise SystemExit(f'missing patch anchor: {label}')
    text = text.replace(old, new, count)

repl('function planCurrentTurn({ player, opponent, playerIndex, enemyIndex, stats, map }, options = {}) {',
     'function planCurrentTurnBase({ player, opponent, playerIndex, enemyIndex, stats, map }, options = {}) {',
     'rename current-turn planner base')

old_return = '''  const best = finalists[0] ?? { sequence: [{ kind: "end" }], score: plannerStateValue(root, true) };\n  return { sequence: best.sequence, score: best.score, explored: finalists.length };\n}\n\nfunction plannerActionView'''
new_return = r'''  const best = finalists[0] ?? { sequence: [{ kind: "end" }], score: plannerStateValue(root, true), state: root, priorTotal: 0 };
  const candidateLimit = Math.max(1, Number(options.candidateLimit ?? 4) || 4);
  return {
    sequence: best.sequence,
    score: best.score,
    explored: finalists.length,
    candidates: finalists.length ? finalists.slice(0, candidateLimit) : [best]
  };
}

// [[battle-ai-two-turn-lookahead-v1]]
function resetPlanningTurnState(player) {
  player.cardsPlayedThisTurn = 0;
  player.spellsPlayedThisTurn = 0;
  player.evolutionActionUsed = false;
  for (const item of player.hand) item.fusedThisTurn = false;
}

function beginPlanningTurn(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  player.isActive = true;
  opponent.isActive = false;
  player.personalTurn += 1;
  resetPlanningTurnState(player);
  player.maxPp = Math.min(10, player.maxPp + 1);
  player.pp = player.maxPp;
  if (player.goingSecond && player.personalTurn === 6 && player.bonusPpUses < 2) player.bonusPpAvailable = true;
  readyBoard(player);
  turnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map);
  if (player.hp <= 0 || opponent.hp <= 0) return false;
  drawCards(player, 1, stats, playerIndex);
  if (player.deckOut) {
    player.hp = 0;
    return false;
  }
  useBonusPpIfUseful(player, opponent);
  return player.hp > 0 && opponent.hp > 0;
}

function finishPlanningTurn(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  turnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map);
  stats.ppWasted[playerIndex] += Math.max(0, Math.min(player.pp, player.maxPp));
  player.isActive = false;
}

function executePlannerSequence(state, sequence, map, seed) {
  let steps = 0;
  for (const action of sequence ?? []) {
    if (action.kind === "end" || steps++ >= MAX_ACTIONS) break;
    const outcome = executePlannerAction(state, action, map, createRng(`${seed}|${steps}|${actionKey(action)}`));
    if (!outcome.applied || state.player.hp <= 0 || state.opponent.hp <= 0) break;
  }
  return state;
}

function resampleFutureScenario(candidateState, seed) {
  const scenario = clonePlanningState(candidateState);
  const rng = createRng(seed);

  // Our hand is known to us, but the future draw order is not.
  shuffle(scenario.player.deck, rng);

  // Opponent hand identities are hidden. Only the public hand count and the
  // remaining unknown-zone multiset are preserved; hand/deck identity is
  // resampled independently for each future scenario.
  const opponentHandCount = scenario.opponent.hand.length;
  const unknown = [...scenario.opponent.hand, ...scenario.opponent.deck];
  shuffle(unknown, rng);
  scenario.opponent.hand = unknown.slice(0, opponentHandCount);
  scenario.opponent.deck = unknown.slice(opponentHandCount);
  return scenario;
}

function simulateOneOpponentResponse(candidateState, map, seed) {
  const state = resampleFutureScenario(candidateState, `${seed}|unknown`);
  const original = state.player;
  const enemy = state.opponent;
  const originalIndex = state.playerIndex;
  const enemyIndex = state.enemyIndex;
  const rng = createRng(`${seed}|future-events`);

  finishPlanningTurn(original, enemy, originalIndex, enemyIndex, state.stats, rng, map);
  if (original.hp <= 0) return { value: -100000, survived: false, state };
  if (enemy.hp <= 0) return { value: 100000, survived: true, state };

  if (!beginPlanningTurn(enemy, original, enemyIndex, originalIndex, state.stats, rng, map)) {
    return { value: original.hp > 0 ? 100000 : -100000, survived: original.hp > 0, state };
  }

  const responseState = {
    player: enemy,
    opponent: original,
    playerIndex: enemyIndex,
    enemyIndex: originalIndex,
    stats: state.stats
  };
  const responsePlan = planCurrentTurnBase(
    { ...responseState, map },
    { depth: 2, beamWidth: 2, candidateLimit: 1 }
  );
  executePlannerSequence(responseState, responsePlan.sequence, map, `${seed}|response`);
  if (original.hp <= 0) return { value: -100000, survived: false, state };
  if (enemy.hp <= 0) return { value: 100000, survived: true, state };

  finishPlanningTurn(enemy, original, enemyIndex, originalIndex, state.stats, rng, map);
  if (original.hp <= 0) return { value: -100000, survived: false, state };
  if (enemy.hp <= 0) return { value: 100000, survived: true, state };

  if (!beginPlanningTurn(original, enemy, originalIndex, enemyIndex, state.stats, rng, map)) {
    return { value: original.hp > 0 ? 100000 : -100000, survived: original.hp > 0, state };
  }

  // The second ply values what we can actually do on our following turn rather
  // than merely counting remaining HP. Keep it deliberately shallow so the
  // planner remains usable inside 1000-game benchmarks.
  const nextState = {
    player: original,
    opponent: enemy,
    playerIndex: originalIndex,
    enemyIndex,
    stats: state.stats
  };
  const nextPlan = planCurrentTurnBase(
    { ...nextState, map },
    { depth: 2, beamWidth: 2, candidateLimit: 1 }
  );
  return { value: nextPlan.score, survived: original.hp > 0, state, responsePlan, nextPlan };
}

function uniqueFirstActionCandidates(candidates, limit = 3) {
  const seen = new Set();
  const out = [];
  for (const candidate of candidates ?? []) {
    const first = candidate.sequence?.[0] ?? { kind: "end" };
    const key = actionKey(first);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
    if (out.length >= limit) break;
  }
  return out;
}

function shouldUseTwoTurnLookahead(base, player, opponent, options) {
  if (options.disableFuture) return false;
  const candidates = uniqueFirstActionCandidates(base.candidates, 3);
  if (candidates.length < 2) return false;
  if (options.forceFuture) return true;
  if (player.personalTurn < 3) return false;

  const incoming = estimateVisibleIncomingDamage(player, opponent);
  const margin = player.hp - incoming;
  const topGap = Math.abs((candidates[0]?.score ?? 0) - (candidates[1]?.score ?? 0));
  const style = String(player.strategy?.style ?? "midrange");
  const resourceSensitive = style === "control" || style === "ward-control" || style === "spell-combo" || style === "ramp";

  if (margin <= 7) return true;
  if (topGap <= 4.5 && player.hand.length >= 2) return true;
  return resourceSensitive && topGap <= 6.5 && player.hand.length >= 3 && player.personalTurn >= 4;
}

function evaluateCandidateFuture(candidate, player, opponent, map, options) {
  if (candidate.state?.opponent?.hp <= 0) return { combined: 100000, future: 100000, worst: 100000, samples: 0 };
  if (candidate.state?.player?.hp <= 0) return { combined: -100000, future: -100000, worst: -100000, samples: 0 };

  const sampleCount = Math.max(1, Math.min(3, Number(options.futureSamples ?? 2) || 2));
  const seedBase = `${planningPublicSeed(player, opponent)}|${candidate.sequence.map(actionKey).join(">")}`;
  const values = [];
  for (let index = 0; index < sampleCount; index += 1) {
    values.push(simulateOneOpponentResponse(candidate.state, map, `${seedBase}|scenario:${index}`).value);
  }
  const worst = Math.min(...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (worst <= -90000) {
    return { combined: -90000 + candidate.score * .02, future: average, worst, samples: sampleCount };
  }
  const robustFuture = average * .65 + worst * .35;
  const combined = candidate.score * .72 + robustFuture * .28;
  return { combined, future: robustFuture, worst, samples: sampleCount };
}

function planCurrentTurn({ player, opponent, playerIndex, enemyIndex, stats, map }, options = {}) {
  const base = planCurrentTurnBase(
    { player, opponent, playerIndex, enemyIndex, stats, map },
    { ...options, candidateLimit: Math.max(4, Number(options.candidateLimit ?? 4) || 4) }
  );
  if (!shouldUseTwoTurnLookahead(base, player, opponent, options)) {
    return { ...base, futureEvaluated: false, immediateScore: base.score, futureScore: null, worstFutureScore: null };
  }

  const candidates = uniqueFirstActionCandidates(base.candidates, 3);
  const evaluated = candidates.map(candidate => ({
    candidate,
    ...evaluateCandidateFuture(candidate, player, opponent, map, options)
  })).sort((a,b)=>b.combined-a.combined || b.candidate.score-a.candidate.score);
  const best = evaluated[0];
  return {
    sequence: best?.candidate?.sequence ?? base.sequence,
    score: best?.combined ?? base.score,
    explored: base.explored,
    candidates: base.candidates,
    futureEvaluated: true,
    immediateScore: best?.candidate?.score ?? base.score,
    futureScore: best?.future ?? null,
    worstFutureScore: best?.worst ?? null,
    futureSamples: best?.samples ?? 0
  };
}

function plannerActionView'''
repl(old_return, new_return, 'two-turn wrapper insertion')

old_sig = '''export function inspectTurnPlan({\n  hand = [], board = [], opponentBoard = [], opponentHand = [], opponentDeck = [], pp = 0, maxPp = pp, hp = 20, opponentHp = 20,\n  personalTurn = 5, goingFirst = true, goingSecond = false, ep = 2, sep = 2,\n  opponentPersonalTurn = 0, opponentMaxPp = 0, opponentEp = 2, opponentSep = 2,\n  strategy = {}, opponentStrategy = {}, depth = 4, beamWidth = 4, future = false, futureSamples = 2\n} = {}) {\n  const allCards = [...hand, ...opponentHand, ...opponentDeck, ...board.map(value => value.card).filter(Boolean), ...opponentBoard.map(value => value.card).filter(Boolean)];'''
new_sig = '''export function inspectTurnPlan({\n  hand = [], deck = [], board = [], opponentBoard = [], opponentHand = [], opponentDeck = [], pp = 0, maxPp = pp, hp = 20, opponentHp = 20,\n  personalTurn = 5, goingFirst = true, goingSecond = false, ep = 2, sep = 2,\n  opponentPersonalTurn = 0, opponentMaxPp = 0, opponentEp = 2, opponentSep = 2,\n  strategy = {}, opponentStrategy = {}, depth = 4, beamWidth = 4, future = false, futureSamples = 2\n} = {}) {\n  const allCards = [...hand, ...deck, ...opponentHand, ...opponentDeck, ...board.map(value => value.card).filter(Boolean), ...opponentBoard.map(value => value.card).filter(Boolean)];'''
if old_sig not in text:
    raise SystemExit('QA own deck signature anchor missing')
text = text.replace(old_sig, new_sig, 1)

old_setup = '''  player.hand = hand.map(card => instance(player, card));\n  opponent.hand = opponentHand.map(card => instance(opponent, card));'''
new_setup = '''  player.hand = hand.map(card => instance(player, card));\n  player.deck = deck.map(card => instance(player, card));\n  opponent.hand = opponentHand.map(card => instance(opponent, card));'''
if old_setup not in text:
    raise SystemExit('QA own deck setup anchor missing')
text = text.replace(old_setup, new_setup, 1)

path.write_text(text, encoding='utf-8')
print('Battle Sim two-turn look-ahead materialized')
