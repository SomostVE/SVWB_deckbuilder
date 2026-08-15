import fs from "node:fs/promises";

const path = new URL("../js/battle-engine-v5.js", import.meta.url);
let source = await fs.readFile(path, "utf8");

if (source.includes("// [[battle-ai-effect-aware-evolution-v1]]")) {
  console.log("Effect-aware evolution AI already applied.");
  process.exit(0);
}

const start = source.indexOf("function maybeEvolve(player, opponent, playerIndex, enemyIndex, stats, rng, map) {");
const end = source.indexOf("\n// [[battle-ability-evolve-helper-v5]]", start);
if (start < 0 || end < 0) throw new Error("maybeEvolve block not found");

const replacement = `// [[battle-ai-effect-aware-evolution-v1]]
function maybeEvolve(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  if (player.evolutionActionUsed) return null;
  const normalTurn = player.goingFirst ? 5 : 4;
  const superTurn = player.goingFirst ? 7 : 6;
  const candidates = player.board.filter(unit => unit.type === "Follower" && !unit.evolved && !unit.superEvolved && !unit.attacked);
  if (!candidates.length) return null;

  const normalAvailable = player.personalTurn >= normalTurn && player.ep > 0;
  const superAvailable = player.personalTurn >= superTurn && player.sep > 0;
  if (!normalAvailable && !superAvailable) return null;

  const normalRanked = normalAvailable
    ? candidates.map(unit => ({ unit, score: scoreEvolutionCandidate(unit, player, opponent, false) })).sort((a, b) => b.score - a.score)
    : [];
  const superRanked = superAvailable
    ? candidates.map(unit => ({ unit, score: scoreEvolutionCandidate(unit, player, opponent, true) })).sort((a, b) => b.score - a.score)
    : [];

  const normalBest = normalRanked[0] ?? null;
  const superBest = superRanked[0] ?? null;
  const effectBest = Math.max(
    normalBest ? evolutionEffectValue(normalBest.unit, player, opponent, false) : -Infinity,
    superBest ? evolutionEffectValue(superBest.unit, player, opponent, true) : -Infinity
  );
  const tacticalNeed = opponent.board.some(unit => unit.type === "Follower")
    || player.strategy.faceBias > .7
    || opponent.hp <= 10
    || effectBest >= 4;
  if (!tacticalNeed) return null;

  let choice = normalBest;
  let superMode = false;
  if (superBest) {
    if (!normalBest) {
      choice = superBest;
      superMode = true;
    } else {
      const style = String(player.strategy?.style ?? "midrange");
      const superText = getUnitTriggeredText(superBest.unit, "superEvolve");
      const superEffect = evolutionTextValue(superText, player, opponent, superBest.unit);
      let premium = 2.5;
      if (style === "aggro") premium = 1.25;
      else if (style === "puppetry-tempo" || style === "buff-tempo") premium = 2;
      else if (style === "ward-control" || style === "control") premium = 4;
      const urgent = opponent.hp <= Math.max(6, superBest.unit.attack + 3)
        || opponent.board.filter(unit => unit.type === "Follower").length >= 3;
      if (superBest.score >= normalBest.score + premium || (superEffect >= 7 && superBest.score > normalBest.score) || (urgent && superBest.score > normalBest.score + .5)) {
        choice = superBest;
        superMode = true;
      }
    }
  }
  if (!choice) return null;

  const unit = choice.unit;
  const bonus = superMode ? 3 : 2;
  player[superMode ? "sep" : "ep"] -= 1;
  player.evolutionActionUsed = true;
  unit.attack += bonus;
  unit.defense += bonus;
  unit.maxDefense += bonus;
  unit.canAttackFollower = !/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
  if (/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) unit.canAttackLeader = false;
  unit.evolved = true;
  unit.superEvolved = superMode;
  player.evolutionsThisMatch += 1;
  if (superMode) stats.superEvolutions[playerIndex] += 1;
  else stats.evolutions[playerIndex] += 1;
  const actions = [];
  const evolveText = getUnitTriggeredText(unit, "evolve");
  if (evolveText) actions.push(...resolveText(evolveText, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }).actions);
  if (superMode) {
    const superText = getUnitTriggeredText(unit, "superEvolve");
    if (superText) actions.push(...resolveText(superText, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }).actions);
  }
  actions.push(...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map));
  return { super: superMode, action: compact(\`\${player.name} \${superMode ? "super-evolves" : "evolves"} \${unit.name}.\`, actions) };
}

function scoreEvolutionCandidate(unit, player, opponent, superMode) {
  const bonus = superMode ? 3 : 2;
  const foes = opponent.board.filter(item => item.type === "Follower");
  const postAttack = Math.max(0, Number(unit.attack) || 0) + bonus;
  let score = 1 + postAttack * .22 + Math.max(0, Number(unit.defense) || 0) * .06;

  const evolveText = getUnitTriggeredText(unit, "evolve");
  score += evolutionTextValue(evolveText, player, opponent, unit);
  if (superMode) {
    const superText = getUnitTriggeredText(unit, "superEvolve");
    score += evolutionTextValue(superText, player, opponent, unit);
    score += 1.25; // +1/+1 over a normal evolution and the Super-Evolve combat rider.
  }

  if (foes.length) {
    const killable = foes.some(target => !target.aura && !target.ambush && (postAttack >= target.defense || hasU(unit, "Bane")));
    score += killable ? 4 : 1;
    if (hasU(unit, "Bane")) score += 1.5;
  }

  if (hasU(unit, "Storm") && unit.canAttackLeader) {
    score += opponent.hp <= postAttack ? 12 : opponent.hp <= 10 ? 5 : 1.5;
  }
  if (/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) score -= 3;
  if (hasU(unit, "Ward") && (player.strategy.style === "ward-control" || player.hp <= 10)) score += 1.5;
  return score;
}

function evolutionEffectValue(unit, player, opponent, superMode) {
  if (!unit) return 0;
  let value = evolutionTextValue(getUnitTriggeredText(unit, "evolve"), player, opponent, unit);
  if (superMode) value += evolutionTextValue(getUnitTriggeredText(unit, "superEvolve"), player, opponent, unit);
  return value;
}

function evolutionTextValue(textValue, player, opponent, unit) {
  const text = norm(textValue);
  if (!text) return 0;
  const foes = opponent.board.filter(item => item.type === "Follower");
  const allies = player.board.filter(item => item.type === "Follower" && item !== unit);
  let value = 0;

  if (/destroy|banish/.test(text)) value += foes.length ? 10 : -3;
  if (/return .*enemy follower/.test(text)) value += foes.length ? 7 : -2;

  const allDamage = text.match(/deal (\\d+) damage to all enemy followers/);
  if (allDamage) value += foes.length ? Math.min(12, foes.length * Math.max(1, Number(allDamage[1])) * 1.35) : -2;
  const targetDamage = text.match(/deal (\\d+) damage to .*enemy follower/);
  if (targetDamage && !allDamage) value += foes.length ? Math.min(8, Number(targetDamage[1]) * 1.5 + 2) : -2;

  if (/summon/.test(text)) value += player.board.length < 5 ? 6 : 0;
  if (/draw/.test(text)) value += player.hand.length <= 5 ? 5 : 2;
  if (/add .* to your hand/.test(text)) value += player.hand.length < 9 ? 3 : 0;
  if (/restore .*defense to your leader/.test(text)) value += player.hp <= 10 ? 6 : player.hp <= 15 ? 3 : .5;
  if (/give all .*allied followers|give all other allied followers/.test(text)) value += Math.min(7, allies.length * 2);
  if (/evolve another|evolve a random|super-evolve/.test(text)) value += allies.some(item => !item.evolved && !item.superEvolved) ? 6 : 1;
  if (/gain crest/.test(text)) value += 6;
  if (/barrier|aura/.test(text)) value += 2.5;
  if (/storm/.test(text)) value += opponent.hp <= 10 ? 5 : 2;
  if (/ward/.test(text)) value += player.hp <= 10 ? 3 : 1;
  return value;
}
`;

source = source.slice(0, start) + replacement + source.slice(end);
await fs.writeFile(path, source);
console.log("Applied effect-aware Battle Sim evolution AI.");
