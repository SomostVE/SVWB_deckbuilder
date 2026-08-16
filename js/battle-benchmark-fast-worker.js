import { analyzeDeckCoverage, simulateBattle } from "./battle-engine.js";

self.addEventListener("message", event => {
  const payload = event.data ?? {};
  if (payload.type !== "run-chunk") return;

  try {
    const cardMap = new Map((payload.cards ?? []).map(card => [Number(card.id), card]));
    const games = Math.max(1, Number(payload.games) || 1);
    const startIndex = Math.max(0, Number(payload.startIndex) || 0);
    const overall = emptyAggregate();
    const first = emptyAggregate();
    const second = emptyAggregate();

    for (let localIndex = 0; localIndex < games; localIndex += 1) {
      const globalIndex = startIndex + localIndex;
      const side = globalIndex % 2 === 0 ? "first" : "second";
      const result = simulateBattle({
        playerDeck: payload.playerDeck,
        opponentDeck: payload.opponentDeck,
        cardMap,
        playerStrategy: payload.playerStrategy ?? {},
        opponentStrategy: payload.opponentStrategy ?? {},
        seed: `${payload.seed || "deci-benchmark"}:${globalIndex}`,
        playerSide: side,
        recordFrames: false
      });

      addResult(overall, result);
      addResult(side === "first" ? first : second, result);

      if ((localIndex + 1) % 5 === 0 || localIndex + 1 === games) {
        self.postMessage({
          type: "progress",
          jobId: payload.jobId,
          done: localIndex + 1,
          games
        });
      }
    }

    const playerCoverage = analyzeDeckCoverage(payload.playerDeck, cardMap);
    const opponentCoverage = analyzeDeckCoverage(payload.opponentDeck, cardMap);

    self.postMessage({
      type: "complete",
      jobId: payload.jobId,
      overall,
      first,
      second,
      coverage: {
        player: playerCoverage,
        opponent: opponentCoverage,
        minimumModeledPercent: Math.min(playerCoverage.modeledPercent, opponentCoverage.modeledPercent),
        unsupportedCopies: playerCoverage.unsupported + opponentCoverage.unsupported,
        partialCopies: playerCoverage.partial + opponentCoverage.partial
      }
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      jobId: payload.jobId,
      message: error?.message || String(error)
    });
  }
});

function emptyAggregate() {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    rounds: 0,
    ruleGapExposures: 0
  };
}

function addResult(bucket, result) {
  const summary = result?.summary ?? {};
  const stats = summary.stats ?? {};
  bucket.games += 1;
  bucket.rounds += Number(summary.rounds) || 0;
  bucket.ruleGapExposures += (Number(stats.unsupportedEffects?.[0]) || 0) + (Number(stats.unsupportedEffects?.[1]) || 0);
  if (summary.winnerIndex === 0) bucket.wins += 1;
  else if (summary.winnerIndex === 1) bucket.losses += 1;
  else bucket.draws += 1;
}
