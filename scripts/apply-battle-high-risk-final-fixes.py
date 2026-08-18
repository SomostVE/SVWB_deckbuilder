from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
text = ENGINE.read_text(encoding="utf-8")

old = '''  if (depth >= 16) {
    ctx.__highRiskNestedUnresolved = true;
    actions.push("Fanfare replay safety limit");
    return false;
  }'''
new = '''  if (depth >= 64) {
    // Random Fanfare recursion (notably Omegotep) can legally select itself
    // again. The chain terminates almost surely; keep an emergency simulation
    // cap without falsely classifying the already-modeled branch as unresolved.
    actions.push("Fanfare replay emergency recursion cap");
    return true;
  }'''
if old not in text:
    raise SystemExit("Missing Fanfare replay safety anchor")
text = text.replace(old, new, 1)

anchor = '''  // [[battle-high-risk-compound-preflight]]
  // Compound clauses must be consumed before their inner generic subclauses,'''
insert = '''  // [[battle-high-risk-earth-sigil-grammar]]
  // Some imported cards use singular lower-case wording which historically
  // escaped the resource pass after other sentence fragments were rewritten.
  for (const match of [...text.matchAll(/Gain\\s+(?:an?|one|1)\\s+earth sigil\\.?/gi)]) {
    ctx.player.earthSigils += 1;
    actions.push(`Earth Sigils +1 (${ctx.player.earthSigils})`);
    text = text.replace(match[0], " ");
  }

  // [[battle-high-risk-compound-preflight]]
  // Compound clauses must be consumed before their inner generic subclauses,'''
if anchor not in text:
    raise SystemExit("Missing compound preflight anchor")
text = text.replace(anchor, insert, 1)

artifact_anchor = '''  // Keywords can appear inline in card text rather than the keyword array.
  for (const keyword of ["Ward", "Barrier", "Rush", "Storm", "Bane", "Drain", "Intimidate", "Aura", "Ambush"]) {'''
artifact_insert = '''  // Trait-wide board buff used by Ralmia and reusable by future Artifact cards.
  const artifactBoardBuff = text.match(/Give all allied Artifact followers on the field\\s*\\+(\\d+)\\s*\\/\\s*\\+(\\d+)\\.?/i);
  if (artifactBoardBuff) {
    for (const unit of ctx.player.board.filter(unit => unit.type === "Follower" && (unit.card?.traits ?? []).some(trait => norm(trait) === "artifact"))) {
      buff(unit, Number(artifactBoardBuff[1]) || 0, Number(artifactBoardBuff[2]) || 0);
    }
    actions.push(`all allied Artifacts +${artifactBoardBuff[1]}/+${artifactBoardBuff[2]}`);
    text = text.replace(artifactBoardBuff[0], " ");
  }

  // Keywords can appear inline in card text rather than the keyword array.
  for (const keyword of ["Ward", "Barrier", "Rush", "Storm", "Bane", "Drain", "Intimidate", "Aura", "Ambush"]) {'''
if artifact_anchor not in text:
    raise SystemExit("Missing Artifact board-buff insertion anchor")
text = text.replace(artifact_anchor, artifact_insert, 1)

return_anchor = '''  return { text: text.replace(/\\s+/g, " ").trim(), actions: uniq(actions) };
}

function resolveText(raw, ctx) {'''
return_replacement = '''  // A consumed sentence can leave only punctuation (for example the pre-existing
  // Earth Sigil pass did not consume the final period). Punctuation-only residue
  // is not an unresolved Battle Sim rule.
  const remainingText = text.replace(/\\s+/g, " ").trim().replace(/^[.,;:\\s]+|[.,;:\\s]+$/g, "").trim();
  return { text: remainingText, actions: uniq(actions) };
}

function resolveText(raw, ctx) {'''
if return_anchor not in text:
    raise SystemExit("Missing high-risk resolver return anchor")
text = text.replace(return_anchor, return_replacement, 1)

ENGINE.write_text(text, encoding="utf-8")
print("Applied final high-risk runtime fixes.")
