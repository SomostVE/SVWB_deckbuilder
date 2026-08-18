from pathlib import Path

path = Path("js/battle-engine-v5.js")
text = path.read_text(encoding="utf-8")
old = '''      if (rally >= 20 && ctx.sourceUnit) superEvolveUnitByAbility(ctx, ctx.sourceUnit, actions);
      else actions.push(`Rally ${rally}/20`);'''
new = '''      if (rally >= 20 && ctx.sourceUnit) {
        const before = new Set(ctx.player.board.map(unit => unit.uid));
        superEvolveUnitByAbility(ctx, ctx.sourceUnit, actions);
        let steelclad = ctx.player.board.filter(unit => !before.has(unit.uid) && norm(unit.name) === "steelclad knight");
        const missing = Math.max(0, 2 - steelclad.length);
        if (missing && ctx.player.board.length < 5) {
          const token = related(ctx.card, ctx.cardMap).find(card => norm(card.name) === "steelclad knight") ?? findByName(ctx.cardMap, "Steelclad Knight");
          if (token) summonWithEvents(ctx.player, token, missing, ctx.playerIndex, ctx);
          steelclad = ctx.player.board.filter(unit => !before.has(unit.uid) && norm(unit.name) === "steelclad knight");
        }
        for (const unit of steelclad) giveKeyword(unit, "Rush");
        if (steelclad.length) actions.push(`Gildaria: summon ${steelclad.length} Steelclad Knight${steelclad.length === 1 ? "" : "s"} with Rush`);
      } else actions.push(`Rally ${rally}/20`);'''
if new in text:
    print("Gildaria fix already materialized.")
elif old not in text:
    raise SystemExit("Missing Gildaria Rally block")
else:
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("Materialized Gildaria evolve summons.")
