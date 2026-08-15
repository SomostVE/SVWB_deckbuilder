from pathlib import Path

path = Path('js/battle-engine-v5.js')
text = path.read_text(encoding='utf-8')

old_run = '''    const engage = bestEngage(player, opponent);
    const play = bestPlay(player, opponent);
    if (!engage && !play) break;
'''
new_run = '''    const playableBeforeDecision = getModesForHand(player).length;
    const engage = bestEngage(player, opponent);
    const play = bestPlay(player, opponent);
    if (!engage && !play) {
      if (playableBeforeDecision > 0) {
        snap(frames, players, {
          round,
          active: playerIndex,
          phase: "decision",
          action: `${player.name} holds available cards for a stronger future turn.`
        }, stats, record);
      }
      break;
    }
'''
if old_run not in text:
    raise SystemExit('runTurnAi decision block not found')
text = text.replace(old_run, new_run, 1)

old_best = '''function bestPlay(player, opponent) {
  return getModesForHand(player).map(item => ({ ...item, score: scorePlay(item, player, opponent) })).sort((a,b)=>b.score-a.score || b.mode.cost-a.mode.cost)[0] ?? null;
}

function scorePlay(item, player, opponent) {
'''
new_best = '''function bestPlay(player, opponent) {
  const options = getModesForHand(player)
    .map(item => ({ ...item, score: scorePlay(item, player, opponent) }))
    .sort((a,b)=>b.score-a.score || b.mode.cost-a.mode.cost);
  const best = options[0] ?? null;
  if (!best) return null;
  return best.score > scorePassDecision(player, opponent) ? best : null;
}

// Public QA hook for deterministic AI-policy tests. It intentionally only sees
// public board/leader state; look-ahead never reads the opponent hand or deck.
export function inspectAiPlayChoice({
  hand = [], pp = 0, maxPp = pp, hp = 20, maxHp = 20, personalTurn = 1,
  strategy = {}, board = [], opponentHp = 20, opponentBoard = [],
  goingFirst = false, goingSecond = false, bonusPpAvailable = false,
  rally = 0, shadows = 0, earthSigils = 0
} = {}) {
  const toUnit = (unit, index, side) => ({
    uid: unit.uid ?? `${side}-${index}`,
    type: "Follower",
    name: unit.name ?? unit.card?.name ?? `Follower ${index + 1}`,
    card: unit.card ?? {
      name: unit.name ?? `Follower ${index + 1}`,
      text: unit.text ?? "",
      keywords: [...(unit.keywords ?? [])]
    },
    attack: Math.max(0, Number(unit.attack) || 0),
    defense: Math.max(0, Number(unit.defense) || 0),
    maxDefense: Math.max(0, Number(unit.maxDefense ?? unit.defense) || 0),
    keywords: [...(unit.keywords ?? unit.card?.keywords ?? [])],
    ambush: Boolean(unit.ambush),
    intimidate: Boolean(unit.intimidate),
    permanentAttackLock: Boolean(unit.permanentAttackLock),
    evolved: Boolean(unit.evolved),
    superEvolved: Boolean(unit.superEvolved)
  });
  const player = {
    strategy: normStrategy(strategy), pp: Math.max(0, Number(pp) || 0), maxPp: Math.max(0, Number(maxPp) || 0),
    hp: Number(hp) || 0, maxHp: Math.max(1, Number(maxHp) || 20), personalTurn: Math.max(1, Number(personalTurn) || 1),
    goingFirst: Boolean(goingFirst), goingSecond: Boolean(goingSecond), bonusPpAvailable: Boolean(bonusPpAvailable),
    rally: Math.max(0, Number(rally) || 0), shadows: Math.max(0, Number(shadows) || 0), earthSigils: Math.max(0, Number(earthSigils) || 0),
    cardsPlayedThisTurn: 0,
    board: board.map((unit, index) => toUnit(unit, index, "ally")),
    hand: hand.map((card, index) => ({
      uid: `inspect-hand-${index}`, card, spellboost: 0, costDelta: 0,
      attackBonus: 0, defenseBonus: 0, skyboundEvolutions: 0, x: initialX(card)
    }))
  };
  const opponent = {
    hp: Number(opponentHp) || 0,
    board: opponentBoard.map((unit, index) => toUnit(unit, index, "enemy"))
  };
  const options = getModesForHand(player)
    .map(item => ({ ...item, score: scorePlay(item, player, opponent) }))
    .sort((a,b)=>b.score-a.score || b.mode.cost-a.mode.cost);
  const best = options[0] ?? null;
  const passScore = scorePassDecision(player, opponent);
  const selected = best && best.score > passScore ? best : null;
  return {
    decision: selected ? "play" : "pass",
    cardName: selected?.instance?.card?.name ?? null,
    mode: selected?.mode?.kind ?? null,
    score: selected ? selected.score : passScore,
    bestPlayScore: best?.score ?? null,
    passScore,
    projectedIncomingDamage: estimateVisibleIncomingDamage(player, opponent)
  };
}

function scorePassDecision(player, opponent) {
  const incoming = estimateVisibleIncomingDamage(player, opponent);
  const margin = (Number(player.hp) || 0) - incoming;
  const style = String(player.strategy?.style ?? "midrange");
  let score = 3.8;

  if (margin <= 0) return -20;
  if (margin <= 3) score = -5;
  else if (margin <= 6) score = 1.5;

  if (style === "aggro") score -= 1.5;
  else if (style === "buff-tempo" || style === "puppetry-tempo") score -= .5;
  else if (style === "control" || style === "ward-control" || style === "spell-combo") score += 1;

  // Passing with a nearly full hand risks burning the next draw, so the AI is
  // increasingly willing to spend a merely adequate card instead of hoarding.
  if ((player.hand?.length ?? 0) >= 8) score -= 3;
  else if ((player.hand?.length ?? 0) >= 7) score -= 1;

  return score;
}

function estimateVisibleIncomingDamage(player, opponent) {
  const attackers = opponent.board
    .filter(unit => unit.type === "Follower" && canThreatenLeaderNextTurn(unit))
    .map(unit => ({ attack: Math.max(0, Number(unit.attack) || 0), bane: hasU(unit, "Bane") }))
    .filter(unit => unit.attack > 0)
    .sort((a,b)=>b.attack-a.attack);

  const wards = player.board
    .filter(unit => unit.type === "Follower" && hasU(unit, "Ward") && !unit.ambush && !unit.intimidate)
    .map(unit => ({ defense: Math.max(1, Number(unit.defense) || 1) }))
    .sort((a,b)=>a.defense-b.defense);

  while (attackers.length && wards.length) {
    const attacker = attackers.shift();
    const ward = wards[0];
    ward.defense -= attacker.attack;
    if (attacker.bane || ward.defense <= 0) wards.shift();
  }
  return attackers.reduce((sum, unit) => sum + unit.attack, 0);
}

function canThreatenLeaderNextTurn(unit) {
  if (!unit || unit.type !== "Follower" || unit.permanentAttackLock) return false;
  const text = norm(unit.card?.text ?? "");
  if (/can'?t attack (?:followers or leaders|leaders)/.test(text)) return false;
  return (Number(unit.attack) || 0) > 0;
}

function projectedSurvivalAfterPlay(item, player, opponent) {
  const card = item.instance.card;
  const text = norm(item.mode.text || card.text);
  const projectedPlayer = { ...player, board: player.board.map(unit => ({ ...unit, keywords: [...(unit.keywords ?? [])] })) };
  const projectedOpponent = { ...opponent, board: opponent.board.map(unit => ({ ...unit, keywords: [...(unit.keywords ?? [])] })) };
  let projectedHp = Number(player.hp) || 0;

  const heal = Number(text.match(/restore\s+(\d+)\s+defense to your leader/i)?.[1] ?? 0);
  if (heal > 0) projectedHp = Math.min(Number(player.maxHp) || 20, projectedHp + heal);

  const enemyFollowers = projectedOpponent.board.filter(unit => unit.type === "Follower");
  const allRemoval = /(?:destroy|banish|return)[^.]*all enemy followers/.test(text);
  if (allRemoval) {
    projectedOpponent.board = projectedOpponent.board.filter(unit => unit.type !== "Follower");
  } else if (/(?:destroy|banish|return)[^.]*enemy follower/.test(text) && enemyFollowers.length) {
    const target = [...enemyFollowers].sort((a,b)=>(Number(b.attack)||0)-(Number(a.attack)||0))[0];
    projectedOpponent.board = projectedOpponent.board.filter(unit => unit !== target);
  } else {
    const damage = Number(text.match(/deal\s+(\d+)\s+damage to (?:an?|the selected )?enemy follower/i)?.[1] ?? 0);
    if (damage > 0) {
      const killable = enemyFollowers
        .filter(unit => (Number(unit.defense) || 0) <= damage)
        .sort((a,b)=>(Number(b.attack)||0)-(Number(a.attack)||0));
      if (killable.length) projectedOpponent.board = projectedOpponent.board.filter(unit => unit !== killable[0]);
    }
  }

  if (card.type === "Follower" && !["accelerate", "crystallize"].includes(item.mode.kind) && has(card, "Ward") && projectedPlayer.board.length < 5) {
    projectedPlayer.board.push({
      uid: "projected-ward", type: "Follower", card, name: card.name,
      attack: Math.max(0, Number(card.attack) || 0),
      defense: Math.max(1, Number(card.defense) || 1),
      keywords: [...(card.keywords ?? [])], ambush: false, intimidate: false
    });
  }

  return {
    hp: projectedHp,
    incoming: estimateVisibleIncomingDamage(projectedPlayer, projectedOpponent)
  };
}

function survivalLookaheadValue(item, player, opponent) {
  const beforeIncoming = estimateVisibleIncomingDamage(player, opponent);
  const beforeMargin = (Number(player.hp) || 0) - beforeIncoming;
  const after = projectedSurvivalAfterPlay(item, player, opponent);
  const afterMargin = after.hp - after.incoming;
  const improvement = afterMargin - beforeMargin;
  const card = item.instance.card;
  const text = norm(item.mode.text || card.text);
  const defensive = /destroy|banish|return .*enemy follower|damage to .*enemy follower|restore .*leader/.test(text) || has(card, "Ward");

  let score = improvement * .8;
  if (beforeMargin <= 0 && afterMargin > 0) score += 18;
  else if (beforeMargin <= 3 && afterMargin > beforeMargin) score += 8;
  else if (beforeMargin <= 6 && improvement > 0) score += 3;

  if (beforeMargin <= 0 && !defensive) score -= 8;
  if (beforeMargin >= 8 && defensive && improvement <= 0) score -= 1.5;
  return score;
}

function timingLookaheadValue(item, player, opponent) {
  const card = item.instance.card;
  const raw = String(card.text ?? "");
  const text = norm(item.mode.text || raw);
  const incoming = estimateVisibleIncomingDamage(player, opponent);
  const urgent = incoming >= Math.max(1, (Number(player.hp) || 0) - 3);
  let score = 0;

  // If the same card gains an Enhance mode next turn, preserve it when the
  // current board is safe instead of spending the weaker base body/effect now.
  if (!urgent && (item.mode.kind === "base" || item.mode.kind === "mode")) {
    const enhanceCosts = [...raw.matchAll(/Enhance\s*\(?\s*(\d+)\s*\)?\s*:/gi)].map(match => Number(match[1]));
    const nextBudget = Math.min(10, (Number(player.maxPp) || 0) + 1) + (player.goingSecond && player.bonusPpAvailable ? 1 : 0);
    const reachableNext = enhanceCosts.filter(cost => cost > (Number(player.pp) || 0) && cost <= nextBudget).sort((a,b)=>a-b)[0];
    if (reachableNext) score -= 5.5;
  }

  if (!urgent && /if overflow is active/.test(norm(raw)) && (Number(player.maxPp) || 0) === 6) score -= 2.5;

  const rallyNeed = Number(raw.match(/Rally\s*\(?\s*(\d+)\s*\)?\s*:/i)?.[1] ?? 0);
  if (!urgent && rallyNeed > 0 && (Number(player.rally) || 0) < rallyNeed && rallyNeed - (Number(player.rally) || 0) <= 2) score -= 1.5;

  const necroNeed = Number(raw.match(/Necromancy\s*\(?\s*(\d+)\s*\)?\s*:/i)?.[1] ?? 0);
  if (!urgent && necroNeed > 0 && (Number(player.shadows) || 0) < necroNeed) score -= 1.5;

  // Purely contextual cards should not be dumped just because PP is available.
  if (!urgent && /restore .*leader/.test(text) && (Number(player.hp) || 0) >= (Number(player.maxHp) || 20)) score -= 1.5;
  return score;
}

function scorePlay(item, player, opponent, includeContinuation = true) {
'''
if old_best not in text:
    raise SystemExit('bestPlay block not found')
text = text.replace(old_best, new_best, 1)

old_tail = '''  score += continuationValue(item, player);
  if (cost === player.pp) score += .6;
  return score;
}

function continuationValue(item, player) {
  const remaining = Math.max(0, (Number(player.pp) || 0) - (Number(item.mode.cost) || 0));
  if (!remaining) return 0;
  const previousPp = player.pp;
  player.pp = remaining;
  let followUp = false;
  try {
    followUp = player.hand.some(other => other.uid !== item.instance.uid && modes(other, player).length > 0);
  } finally {
    player.pp = previousPp;
  }
  if (followUp) return 1.5;
  return remaining >= 2 ? -.75 : -.15;
}
'''
new_tail = '''  score += timingLookaheadValue(item, player, opponent);
  score += survivalLookaheadValue(item, player, opponent);
  if (includeContinuation) score += continuationValue(item, player, opponent);
  if (cost === player.pp) score += .6;
  return score;
}

function continuationValue(item, player, opponent) {
  const remaining = Math.max(0, (Number(player.pp) || 0) - (Number(item.mode.cost) || 0));
  if (!remaining) return 0;
  const previousPp = player.pp;
  const previousHand = player.hand;
  player.pp = remaining;
  player.hand = player.hand.filter(other => other.uid !== item.instance.uid);
  let bestFollowUp = null;
  let followUpPass = 0;
  try {
    bestFollowUp = getModesForHand(player)
      .map(other => ({ ...other, score: scorePlay(other, player, opponent, false) }))
      .sort((a,b)=>b.score-a.score || b.mode.cost-a.mode.cost)[0] ?? null;
    followUpPass = scorePassDecision(player, opponent);
  } finally {
    player.pp = previousPp;
    player.hand = previousHand;
  }
  if (bestFollowUp && bestFollowUp.score > followUpPass) {
    return Math.min(4, Math.max(.5, (bestFollowUp.score - followUpPass) * .35));
  }
  return remaining >= 2 ? -.75 : -.15;
}
'''
if old_tail not in text:
    raise SystemExit('scorePlay tail not found')
text = text.replace(old_tail, new_tail, 1)

path.write_text(text, encoding='utf-8')

check = Path('scripts/check-battle-ai-lookahead.mjs')
check.write_text(r'''import assert from "node:assert/strict";
import { inspectAiPlayChoice } from "../js/battle-engine-v5.js";

const card = (overrides = {}) => ({
  id: 990000 + Math.floor(Math.random() * 1000),
  name: "Test Card",
  class: "Neutral",
  type: "Spell",
  cost: 5,
  attack: 0,
  defense: 0,
  text: "",
  keywords: [],
  traits: [],
  relatedCards: [],
  ...overrides
});

const heal = card({ name: "Late Heal", cost: 5, text: "Restore 3 defense to your leader." });
const safeHeal = inspectAiPlayChoice({
  hand: [heal], pp: 5, maxPp: 5, hp: 20, maxHp: 20,
  strategy: { style: "control" }, opponentBoard: []
});
assert.equal(safeHeal.decision, "pass", "AI should hold a dead heal while safe");

const emergencyHeal = inspectAiPlayChoice({
  hand: [heal], pp: 5, maxPp: 5, hp: 2, maxHp: 20,
  strategy: { style: "control" },
  opponentBoard: [{ name: "Threat", attack: 3, defense: 3, keywords: [] }]
});
assert.equal(emergencyHeal.decision, "play", "AI should spend a mediocre heal to survive visible lethal");

const enhanceFollower = card({
  name: "Wait for Enhance",
  type: "Follower",
  cost: 3,
  attack: 3,
  defense: 3,
  text: "Enhance (4): Give this follower +2/+2."
});
const waitEnhance = inspectAiPlayChoice({
  hand: [enhanceFollower], pp: 3, maxPp: 3, hp: 20,
  strategy: { style: "midrange" }, opponentBoard: []
});
assert.equal(waitEnhance.decision, "pass", "AI should wait one safe turn for a reachable Enhance breakpoint");

const emergencyWard = card({
  name: "Emergency Ward",
  type: "Follower",
  cost: 3,
  attack: 1,
  defense: 4,
  text: "Ward",
  keywords: ["Ward"]
});
const wardChoice = inspectAiPlayChoice({
  hand: [emergencyWard], pp: 3, maxPp: 3, hp: 4,
  strategy: { style: "control" },
  opponentBoard: [{ name: "Large Threat", attack: 5, defense: 5, keywords: [] }]
});
assert.equal(wardChoice.decision, "play", "AI should deploy Ward when it changes next-turn survival");
assert.ok(wardChoice.projectedIncomingDamage >= 4, "QA hook should expose visible incoming pressure");

console.log("Battle Sim tactical look-ahead regression: OK");
''', encoding='utf-8')

print('Battle Sim tactical look-ahead materialized')
