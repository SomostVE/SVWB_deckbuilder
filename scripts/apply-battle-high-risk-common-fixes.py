from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
text = ENGINE.read_text(encoding="utf-8")

old = '''  const leftmostAttack=text.match(/Give the leftmost allied (Forestcraft|Swordcraft|Runecraft|Dragoncraft|Abysscraft|Havencraft|Portalcraft|Neutral) follower on the field ["“]Can attack\\s*(\\d+)\\s*times per turn\\.?["”]/i);
  if(leftmostAttack){const target=ctx.player.board.find(unit=>unit.type==="Follower"&&norm(unit.card?.class)===norm(leftmostAttack[1]));if(target){const n=Number(leftmostAttack[2]);target.baseMaxAttacks=Math.max(n,Number(target.baseMaxAttacks)||1);target.maxAttacks=Math.max(n,Number(target.maxAttacks)||1;}text=text.replace(leftmostAttack[0]," ");}'''
new = '''  const leftmostAttack = text.match(/Give the leftmost allied (Forestcraft|Swordcraft|Runecraft|Dragoncraft|Abysscraft|Havencraft|Portalcraft|Neutral) follower on the field ["“]Can attack\\s*(\\d+)\\s*times per turn\\.?["”]/i);
  if (leftmostAttack) {
    const target = ctx.player.board.find(unit => unit.type === "Follower" && norm(unit.card?.class) === norm(leftmostAttack[1])) ?? null;
    if (target) {
      const count = Number(leftmostAttack[2]) || 1;
      target.baseMaxAttacks = Math.max(count, Number(target.baseMaxAttacks) || 1);
      target.maxAttacks = Math.max(count, Number(target.maxAttacks) || 1);
    }
    text = text.replace(leftmostAttack[0], " ");
  }'''
if old not in text:
    raise SystemExit("Missing leftmost attack generated block")
text = text.replace(old, new, 1)
ENGINE.write_text(text, encoding="utf-8")
print("Applied generated high-risk common fixes.")
