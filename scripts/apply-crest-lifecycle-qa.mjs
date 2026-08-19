import fs from "node:fs";

const path = "js/battle-engine-v5.js";
let src = fs.readFileSync(path, "utf8");
const MARK = "// [[battle-crest-lifecycle-qa-v1]]";
if (src.includes(MARK)) {
  console.log("Crest lifecycle QA already materialized");
  process.exit(0);
}

const anchor = "// [[battle-abysscraft-full-qa]]";
const index = src.indexOf(anchor);
if (index < 0) throw new Error("Missing QA insertion anchor");

const helper = [
  MARK,
  "export function inspectCrestLifecycleRules({ cards = [] } = {}) {",
  "  const rawMap = new Map(cards.map(card => [Number(card.id), card]));",
  "  const map = prepareSimulationCardMap(rawMap);",
  "  const byName = name => findByName(map, name);",
  "  const crestCards = cards.filter(card => /\\bcrest\\b/i.test([card.text ?? '', card.rawSkillText ?? '', ...(card.keywords ?? [])].join('\\n')));",
  "  const makePair = seed => {",
  "    const rng = createRng('crest-lifecycle-qa:' + seed);",
  "    const stats = createStats();",
  "    const player = makePlayer('You', [], {}, map, rng);",
  "    const opponent = makePlayer('Opponent', [], {}, map, rng);",
  "    player.isActive = true; opponent.isActive = false;",
  "    player.personalTurn = 5; opponent.personalTurn = 4;",
  "    return { rng, stats, player, opponent };",
  "  };",
  "",
  "  const capacity = makePair('capacity');",
  "  const unique = [];",
  "  const seen = new Set();",
  "  for (const card of crestCards) {",
  "    const key = norm(card.name);",
  "    if (seen.has(key)) continue;",
  "    seen.add(key);",
  "    unique.push(card);",
  "    if (unique.length >= 6) break;",
  "  }",
  "  const capacityResults = unique.map(card => gainCrest(capacity.player, card.name, map.get(Number(card.id)) ?? card));",
  "  const duplicateAccepted = unique[0] ? gainCrest(capacity.player, unique[0].name, map.get(Number(unique[0].id)) ?? unique[0]) : false;",
  "",
  "  const orderRun = names => {",
  "    const pair = makePair(names.join('-'));",
  "    pair.player.followersAttackedThisTurn = false;",
  "    const allyCard = cards.find(card => card.type === 'Follower' && !card.token) ?? null;",
  "    const enemyCard = cards.find(card => card.type === 'Follower' && !card.token && card.id !== allyCard?.id) ?? allyCard;",
  "    if (!allyCard || !enemyCard) throw new Error('Crest lifecycle QA needs follower fixtures');",
  "    const ally = boardFollower(instance(pair.player, map.get(Number(allyCard.id)) ?? allyCard));",
  "    ally.superEvolved = true; ally.defense = ally.maxDefense = 20;",
  "    const enemy = boardFollower(instance(pair.opponent, map.get(Number(enemyCard.id)) ?? enemyCard));",
  "    enemy.defense = enemy.maxDefense = 20;",
  "    pair.player.board = [ally]; pair.opponent.board = [enemy];",
  "    for (const name of names) {",
  "      const card = byName(name);",
  "      if (!card) throw new Error('Missing Crest QA card: ' + name);",
  "      gainCrest(pair.player, name, card);",
  "    }",
  "    return applyCrestTurnEnd(pair.player, pair.opponent, 0, 1, pair.stats, pair.rng, map);",
  "  };",
  "",
  "  const charon = makePair('charon-expiry');",
  "  charon.player.personalTurn = 0;",
  "  const charonCard = byName('Charon, Stygian Oarswoman');",
  "  const deadCard = cards.find(card => card.class === 'Abysscraft' && card.type === 'Follower' && Number(card.cost) === 3 && !card.token);",
  "  if (!charonCard || !deadCard) throw new Error('Missing Charon Crest QA fixtures');",
  "  charon.player.destroyedFollowers = [{ card: map.get(Number(deadCard.id)) ?? deadCard }];",
  "  gainCrest(charon.player, 'Charon, Stygian Oarswoman', charonCard);",
  "  const charonActions = [];",
  "  const charonBoardSizes = [];",
  "  for (const turn of [1, 2]) {",
  "    charon.player.personalTurn = turn;",
  "    charonActions.push(...applyCrestTurnStartOrdered(charon.player, charon.opponent, 0, 1, charon.stats, charon.rng, map));",
  "    tickCrests(charon.player, charon.opponent, 0, 1, charon.stats, charon.rng, map, charonActions);",
  "    charonBoardSizes.push(charon.player.board.length);",
  "  }",
  "",
  "  return {",
  "    crestCount: crestCards.length,",
  "    capacity: { accepted: capacityResults, duplicateAccepted, active: capacity.player.crests.length },",
  "    order: {",
  "      grimnirThenMarwynn: orderRun(['Grimnir, Heavenly Gale', 'Marwynn, Despair Manifest']),",
  "      marwynnThenGrimnir: orderRun(['Marwynn, Despair Manifest', 'Grimnir, Heavenly Gale'])",
  "    },",
  "    charon: { boardSizes: charonBoardSizes, activeAfterSecondStart: hasCrest(charon.player, 'Charon, Stygian Oarswoman'), actions: charonActions }",
  "  };",
  "}",
  ""
].join("\n");

src = src.slice(0, index) + helper + "\n" + src.slice(index);
fs.writeFileSync(path, src);
console.log("Materialized Crest lifecycle behavior QA");
