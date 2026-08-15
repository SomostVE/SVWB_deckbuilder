import { analyzeDeckCoverage, simulateBattle } from "./battle-engine.js";

export function runMatchupBenchmark({
  playerDeck,
  opponentDeck,
  cardMap,
  playerStrategy = {},
  opponentStrategy = {},
  games = 100,
  seed = "deci-benchmark",
  onProgress = null
}) {
  const totalGames = Math.max(1, Number(games) || 1);
  const aggregate = createAggregate();
  const splits = { first: createAggregate(), second: createAggregate() };

  for (let index = 0; index < totalGames; index += 1) {
    const side = index % 2 === 0 ? "first" : "second";
    const result = simulateBattle({
      playerDeck,
      opponentDeck,
      cardMap,
      playerStrategy,
      opponentStrategy,
      seed: `${seed}:${index}`,
      playerSide: side,
      recordFrames: false
    });

    addResult(aggregate, result);
    addResult(splits[side], result);
    onProgress?.(index + 1, totalGames);
  }

  const playerCoverage = analyzeDeckCoverage(playerDeck, cardMap);
  const opponentCoverage = analyzeDeckCoverage(opponentDeck, cardMap);
  const overall = finalizeAggregate(aggregate);
  const first = finalizeAggregate(splits.first);
  const second = finalizeAggregate(splits.second);
  const minimumModeledPercent = Math.min(playerCoverage.modeledPercent, opponentCoverage.modeledPercent);
  const unsupportedCopies = playerCoverage.unsupported + opponentCoverage.unsupported;
  const partialCopies = playerCoverage.partial + opponentCoverage.partial;

  return {
    games: totalGames,
    overall,
    first,
    second,
    coverage: {
      player: playerCoverage,
      opponent: opponentCoverage,
      minimumModeledPercent,
      unsupportedCopies,
      partialCopies
    },
    diagnostics: {
      sideGap: Math.abs(first.winRate - second.winRate),
      drawRate: overall.drawRate,
      ruleGapsPerGame: overall.ruleGapsPerGame,
      unresolvedTriggersPerGame: overall.ruleGapsPerGame,
      confidenceWidth: overall.winRate95.high - overall.winRate95.low,
      sampleTier: sampleTier(totalGames),
      rulesTier: rulesTier({ minimumModeledPercent, unsupportedCopies, partialCopies, ruleGapsPerGame: overall.ruleGapsPerGame })
    }
  };
}

function createAggregate() {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    rounds: 0,
    winRounds: 0,
    lossRounds: 0,
    damage: 0,
    damageTaken: 0,
    ppSpent: 0,
    ppWasted: 0,
    ruleGapExposures: 0,
    healing: 0,
    cardsPlayed: 0
  };
}

function addResult(bucket, result) {
  const summary = result?.summary ?? {};
  const stats = summary.stats ?? {};
  bucket.games += 1;
  bucket.rounds += Number(summary.rounds) || 0;
  bucket.damage += Number(stats.damageDealt?.[0]) || 0;
  bucket.damageTaken += Number(stats.damageDealt?.[1]) || 0;
  bucket.ppSpent += Number(stats.ppSpent?.[0]) || 0;
  bucket.ppWasted += Number(stats.ppWasted?.[0]) || 0;
  bucket.ruleGapExposures += (Number(stats.unsupportedEffects?.[0]) || 0) + (Number(stats.unsupportedEffects?.[1]) || 0);
  bucket.healing += Number(stats.healing?.[0]) || 0;
  bucket.cardsPlayed += Number(stats.cardsPlayed?.[0]) || 0;

  if (summary.winnerIndex === 0) {
    bucket.wins += 1;
    bucket.winRounds += Number(summary.rounds) || 0;
  } else if (summary.winnerIndex === 1) {
    bucket.losses += 1;
    bucket.lossRounds += Number(summary.rounds) || 0;
  } else {
    bucket.draws += 1;
  }
}

function finalizeAggregate(bucket) {
  const games = bucket.games || 0;
  const ppTotal = bucket.ppSpent + bucket.ppWasted;
  const winRate = games ? bucket.wins / games * 100 : 0;
  const winRate95 = wilsonInterval(bucket.wins, games);
  const ruleGapsPerGame = games ? bucket.ruleGapExposures / games : 0;
  return {
    games,
    wins: bucket.wins,
    losses: bucket.losses,
    draws: bucket.draws,
    decisiveGames: bucket.wins + bucket.losses,
    winRate,
    lossRate: games ? bucket.losses / games * 100 : 0,
    drawRate: games ? bucket.draws / games * 100 : 0,
    decisiveWinRate: bucket.wins + bucket.losses ? bucket.wins / (bucket.wins + bucket.losses) * 100 : 0,
    winRate95,
    averageRounds: games ? bucket.rounds / games : 0,
    averageWinRound: bucket.wins ? bucket.winRounds / bucket.wins : 0,
    averageLossRound: bucket.losses ? bucket.lossRounds / bucket.losses : 0,
    averageDamage: games ? bucket.damage / games : 0,
    averageDamageTaken: games ? bucket.damageTaken / games : 0,
    averageHealing: games ? bucket.healing / games : 0,
    averageCardsPlayed: games ? bucket.cardsPlayed / games : 0,
    ppEfficiency: ppTotal ? bucket.ppSpent / ppTotal * 100 : 0,
    ruleGapsPerGame,
    unsupportedTriggersPerGame: ruleGapsPerGame
  };
}

function wilsonInterval(successes, trials, z = 1.959963984540054) {
  if (!trials) return { low: 0, high: 0 };
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials) / denominator;
  return {
    low: Math.max(0, (center - margin) * 100),
    high: Math.min(100, (center + margin) * 100)
  };
}

function sampleTier(games) {
  if (games >= 1000) return "high";
  if (games >= 500) return "medium";
  return "exploratory";
}

function rulesTier({ minimumModeledPercent, unsupportedCopies, partialCopies, ruleGapsPerGame }) {
  if (unsupportedCopies > 0 || minimumModeledPercent < 80 || ruleGapsPerGame >= .5) return "low";
  if (partialCopies > 12 || minimumModeledPercent < 92 || ruleGapsPerGame >= .1) return "partial";
  return "good";
}
