import { runMatchupBenchmark } from "./battle-benchmark-core.js";

self.addEventListener("message", event => {
  const payload = event.data ?? {};
  if (payload.type !== "run") return;

  try {
    const cardMap = new Map((payload.cards ?? []).map(card => [Number(card.id), card]));
    const opponents = payload.opponents ?? [];
    const results = [];
    const gamesPerMatchup = Math.max(1, Number(payload.games) || 100);
    const totalGames = gamesPerMatchup * opponents.length;
    let completed = 0;

    for (const opponent of opponents) {
      const result = runMatchupBenchmark({
        playerDeck: payload.playerDeck,
        opponentDeck: opponent.deck,
        cardMap,
        playerStrategy: payload.playerStrategy ?? {},
        opponentStrategy: opponent.strategy ?? {},
        games: gamesPerMatchup,
        seed: `${payload.seed || "deci-benchmark"}:${opponent.id}`,
        onProgress(done) {
          const absolute = completed + done;
          if (done === gamesPerMatchup || done % 10 === 0) {
            self.postMessage({
              type: "progress",
              completed: absolute,
              total: totalGames,
              opponentId: opponent.id,
              opponentName: opponent.name
            });
          }
        }
      });

      completed += gamesPerMatchup;
      results.push({
        id: opponent.id,
        name: opponent.name,
        class: opponent.class,
        format: opponent.format,
        ...result
      });
    }

    self.postMessage({ type: "complete", results, totalGames });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || String(error) });
  }
});
