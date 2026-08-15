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

  return {
    games: totalGames,
    overall: finalizeAggregate(aggregate),
    first: finalizeAggregate(splits.first),
    second: finalizeAggregate(splits.second),
    coverage: {
      player: playerCoverage,
      opponent: opponentCoverage,
      minimumModeledPercent: Math.min(playerCoverage.modeledPercent, opponentCoverage.modeledPercent),
      unsupportedCopies: playerCoverage.unsupported + opponentCoverage.unsupported,
      partialCopies: playerCoverage.partial + opponentCoverage.partial
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
    unsupportedTriggers: 0,
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
  bucket.unsupportedTriggers += Number(stats.unsupportedEffects?.[0]) || 0;
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
  return {
    games,
    wins: bucket.wins,
    losses: bucket.losses,
    draws: bucket.draws,
    winRate: games ? bucket.wins / games * 100 : 0,
    lossRate: games ? bucket.losses / games * 100 : 0,
    drawRate: games ? bucket.draws / games * 100 : 0,
    averageRounds: games ? bucket.rounds / games : 0,
    averageWinRound: bucket.wins ? bucket.winRounds / bucket.wins : 0,
    averageLossRound: bucket.losses ? bucket.lossRounds / bucket.losses : 0,
    averageDamage: games ? bucket.damage / games : 0,
    averageDamageTaken: games ? bucket.damageTaken / games : 0,
    averageHealing: games ? bucket.healing / games : 0,
    averageCardsPlayed: games ? bucket.cardsPlayed / games : 0,
    ppEfficiency: ppTotal ? bucket.ppSpent / ppTotal * 100 : 0,
    unsupportedTriggersPerGame: games ? bucket.unsupportedTriggers / games : 0
  };
}
