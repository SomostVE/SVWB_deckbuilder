import { runMatchupBenchmark } from "./battle-benchmark-core.js";

self.addEventListener("message", event => {
  const payload = event.data ?? {};
  if (payload.type !== "run") return;

  try {
    const cardMap = new Map((payload.cards ?? []).map(card => [Number(card.id), card]));
    const opponents = payload.opponents ?? [];
    const results = [];
    const gamesPerMatchup = Math.max(1, Number(payload.games) || 100);
    const compareEnabled = Array.isArray(payload.compareDeck) && payload.compareDeck.length > 0;
    const runsPerMatchup = compareEnabled ? 2 : 1;
    const totalGames = gamesPerMatchup * opponents.length * runsPerMatchup;
    let completed = 0;

    for (const opponent of opponents) {
      const baseSeed = `${payload.seed || "deci-benchmark"}:${opponent.id}`;
      const result = runOne({
        playerDeck: payload.playerDeck,
        playerStrategy: payload.playerStrategy ?? {},
        opponent,
        cardMap,
        gamesPerMatchup,
        seed: baseSeed,
        completed,
        totalGames,
        label: payload.playerName || "Primary"
      });
      completed += gamesPerMatchup;

      let compare = null;
      if (compareEnabled) {
        compare = runOne({
          playerDeck: payload.compareDeck,
          playerStrategy: payload.compareStrategy ?? {},
          opponent,
          cardMap,
          gamesPerMatchup,
          seed: baseSeed,
          completed,
          totalGames,
          label: payload.compareName || "Compare"
        });
        completed += gamesPerMatchup;
      }

      results.push({
        id: opponent.id,
        name: opponent.name,
        class: opponent.class,
        format: opponent.format,
        ...result,
        compare: compare ? {
          name: payload.compareName || "Compare deck",
          ...compare,
          deltaWinRate: compare.overall.winRate - result.overall.winRate,
          deltaFirst: compare.first.winRate - result.first.winRate,
          deltaSecond: compare.second.winRate - result.second.winRate,
          deltaAverageRounds: compare.overall.averageRounds - result.overall.averageRounds
        } : null
      });
    }

    self.postMessage({
      type: "complete",
      results,
      totalGames,
      comparison: compareEnabled ? {
        primaryName: payload.playerName || "Primary deck",
        compareName: payload.compareName || "Compare deck"
      } : null
    });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || String(error) });
  }
});

function runOne({ playerDeck, playerStrategy, opponent, cardMap, gamesPerMatchup, seed, completed, totalGames, label }) {
  return runMatchupBenchmark({
    playerDeck,
    opponentDeck: opponent.deck,
    cardMap,
    playerStrategy,
    opponentStrategy: opponent.strategy ?? {},
    games: gamesPerMatchup,
    seed,
    onProgress(done) {
      const absolute = completed + done;
      if (done === gamesPerMatchup || done % 10 === 0) {
        self.postMessage({
          type: "progress",
          completed: absolute,
          total: totalGames,
          opponentId: opponent.id,
          opponentName: opponent.name,
          deckLabel: label
        });
      }
    }
  });
}
