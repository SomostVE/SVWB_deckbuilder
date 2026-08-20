import fs from "node:fs";

const path = "scripts/audit-battle-ai-behavior.mjs";
let source = fs.readFileSync(path, "utf8");
source = source.replace(
  'const lastWordsTrader = follower("Audit Last Words Trader", 2, 2, 2, "Last Words: Draw a card.");',
  'const lastWordsTrader = follower("Audit Last Words Trader", 2, 2, 2, "Last Words: Deal 3 damage to the enemy leader.");'
);
source = source.replace(
  'const lastWordsEnemy = follower("Audit Last Words Enemy", 2, 2, 2, "Last Words: Draw a card.");',
  'const lastWordsEnemy = follower("Audit Last Words Enemy", 2, 2, 2, "Last Words: Restore 10 defense to your leader.");'
);
source = source.replace(
  'audit("Cash in own Last Words before a vanilla body", "exchange-value", () => inspectTurnPlan({\n  hand: [], deck: [ownFutureDraw], pp: 0, maxPp: 5, personalTurn: 5, ep: 0, sep: 0, opponentHp: 20,',
  'audit("Cash in damage Last Words to create lethal", "exchange-value", () => inspectTurnPlan({\n  hand: [], deck: [ownFutureDraw], pp: 0, maxPp: 5, personalTurn: 5, ep: 0, sep: 0, opponentHp: 5,'
);
source = source.replace(
  'audit("Avoid optional enemy Last Words when another equal threat exists", "exchange-value", () => inspectTurnPlan({\n  hand: [], pp: 0, maxPp: 5, hp: 3, personalTurn: 5, ep: 0, sep: 0, opponentHp: 20,',
  'audit("Avoid healing enemy Last Words when another equal threat exists", "exchange-value", () => inspectTurnPlan({\n  hand: [], pp: 0, maxPp: 5, hp: 3, personalTurn: 5, ep: 0, sep: 0, opponentHp: 5,'
);
fs.writeFileSync(path, source);
