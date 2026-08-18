from pathlib import Path

path = Path("js/battle-engine-v5.js")
source = path.read_text(encoding="utf-8")
marker = "export function inspectRunecraftExtendedRules"
if marker in source:
    print("Runecraft extended QA already materialized.")
    raise SystemExit(0)

anchor = 'export function inspectEffectiveCost(card, { spellboost = 0, costDelta = 0 } = {}) {'
if anchor not in source:
    raise RuntimeError("Runecraft extended QA anchor missing")

qa = r'''// [[battle-runecraft-extended-qa]]
export function inspectRunecraftExtendedRules({ cards = [] } = {}) {
  const map = new Map(cards.map(card => [Number(card.id), card]));
  prepareOriginalCardMap(map);
  const byName = name => findByName(map, name);
  const makePair = seed => {
    const rng = createRng(`runecraft-extended:${seed}`);
    const stats = createStats();
    const player = makePlayer("You", [], { style: "spell-combo" }, map, rng);
    const opponent = makePlayer("Opponent", [], {}, map, rng);
    player.isActive = true;
    opponent.isActive = false;
    player.personalTurn = 7;
    player.maxPp = player.pp = 10;
    return { player, opponent, rng, stats };
  };
  const dummy = (id, name, attack = 1, defense = 3, keywords = [], traits = []) => ({
    id, name, class: "Runecraft", type: "Follower", cost: 1, attack, defense, text: "", keywords, traits, relatedCards: []
  });

  // Persistent Runecraft Crest start-turn effects.
  const elm = makePair("elmott");
  gainCrest(elm.player, "Elmott, Remembrance Aflame", byName("Elmott, Remembrance Aflame"));
  elm.opponent.hp = 20;
  applyRunecraftCrestTurnStart(elm.player, elm.opponent, 0, 1, elm.stats, elm.rng, map);
  const elmottStartDamage = 20 - elm.opponent.hp;

  const cag = makePair("cagliostro");
  cag.player.earthSigils = 1;
  gainCrest(cag.player, "Cagliostro, Genius Alchemist", byName("Cagliostro, Genius Alchemist"));
  applyRunecraftCrestTurnStart(cag.player, cag.opponent, 0, 1, cag.stats, cag.rng, map);
  const cagliostroStart = {
    earthSigils: cag.player.earthSigils,
    ars: cag.player.hand.filter(item => norm(item.card?.name) === "ars magna").length
  };

  const berg = makePair("bergent");
  gainCrest(berg.player, "Bergent, Rejected Artes", byName("Bergent, Rejected Artes"));
  applyRunecraftCrestTurnStart(berg.player, berg.opponent, 0, 1, berg.stats, berg.rng, map);
  const bergentStart = berg.player.board.filter(unit => norm(unit.name) === "onion patch").length;

  // End-turn Runecraft Crests.
  const pas = makePair("pascale");
  gainCrest(pas.player, "Pascale's Dance", byName("Pascale's Dance"));
  pas.player.earthSigils = 10;
  pas.player.deck = [instance(pas.player, dummy(-88201, "QA Draw"))];
  const pasUnit = boardFollower(instance(pas.player, dummy(-88202, "QA Double", 2, 3)));
  pas.player.board = [pasUnit];
  applyRunecraftCrestTurnEnd(pas.player, pas.opponent, 0, 1, pas.stats, pas.rng, map);
  const pascaleEnd = { attack: pasUnit.attack, defense: pasUnit.defense, earthSigils: pas.player.earthSigils, hand: pas.player.hand.length };

  const juno = makePair("juno");
  gainCrest(juno.player, "Juno, Visionary Alchemist", byName("Juno, Visionary Alchemist"));
  juno.player.earthSigils = 1;
  applyRunecraftCrestTurnEnd(juno.player, juno.opponent, 0, 1, juno.stats, juno.rng, map);
  const junoEnd = { earthSigils: juno.player.earthSigils, guardians: juno.player.board.filter(unit => norm(unit.name) === "guardian golem").length };

  // Countdown Crest Last Words.
  const ins = makePair("insomniac");
  ins.player.board = [boardFollower(instance(ins.player, dummy(-88203, "QA Ally", 1, 3)))];
  ins.opponent.board = [boardFollower(instance(ins.opponent, dummy(-88204, "QA Enemy", 1, 3)))];
  runecraftCrestLastWords({ name: "Insomniac Witch" }, ins.player, ins.opponent, 0, 1, ins.stats, ins.rng, map, []);
  const insomniacLastWords = { allied: ins.player.board.length, enemy: ins.opponent.board.length };

  // Entry reactions.
  const enr = makePair("enraptured");
  enr.player.hp = 10;
  const student = boardFollower(instance(enr.player, byName("Enraptured Student")));
  const crystal = boardFollower(instance(enr.player, byName("Crystalspawn")));
  enr.player.board = [student, crystal];
  applyEntryEvents({ player: enr.player, opponent: enr.opponent, playerIndex: 0, enemyIndex: 1, stats: enr.stats, rng: enr.rng, cardMap: map }, crystal);
  const enrapturedHeal = enr.player.hp - 10;

  const emp = makePair("emperor");
  emp.player.earthSigils = 1;
  const emperor = boardFollower(instance(emp.player, byName("Emperor of Elements")));
  const guardian = boardFollower(instance(emp.player, byName("Guardian Golem")));
  emp.player.board = [emperor, guardian];
  applyEntryEvents({ player: emp.player, opponent: emp.opponent, playerIndex: 0, enemyIndex: 1, stats: emp.stats, rng: emp.rng, cardMap: map }, guardian);
  const emperorEntry = { evolved: guardian.evolved, earthSigils: emp.player.earthSigils };

  const gin = makePair("ginger");
  const ginger = boardFollower(instance(gin.player, byName("Ginger, Disastrous Word")));
  const gingerGolem = boardFollower(instance(gin.player, byName("Guardian Golem")));
  const boostTarget = instance(gin.player, byName("Mysterian Missile"));
  gin.player.hand = [boostTarget];
  gin.player.board = [ginger, gingerGolem];
  applyEntryEvents({ player: gin.player, opponent: gin.opponent, playerIndex: 0, enemyIndex: 1, stats: gin.stats, rng: gin.rng, cardMap: map }, gingerGolem);
  const gingerEntry = { rush: hasU(gingerGolem, "Rush"), spellboost: boostTarget.spellboost };

  const noble = makePair("noble");
  noble.player.shikigamiDestroyedBaseAttackThisTurn = 4;
  noble.player.shikigamiDestroyedBaseDefenseThisTurn = 5;
  const nobleCard = byName("Noble Shikigami");
  const nobleUnit = boardFollower(instance(noble.player, nobleCard));
  const nobleBase = { attack: nobleUnit.attack, defense: nobleUnit.defense };
  noble.player.board = [nobleUnit];
  applyEntryEvents({ player: noble.player, opponent: noble.opponent, playerIndex: 0, enemyIndex: 1, stats: noble.stats, rng: noble.rng, cardMap: map }, nobleUnit);
  const nobleEntry = { attack: nobleUnit.attack - nobleBase.attack, defense: nobleUnit.defense - nobleBase.defense };

  // Lilanthim Crest fires at the end of the opponent's turn and evolves the summoned copy.
  const lil = makePair("lilanthim");
  gainCrest(lil.player, "Lilanthim, Anathema of Predation", byName("Lilanthim, Anathema of Predation"));
  lil.player.earthSigils = 0;
  applyRunecraftOpponentTurnEndCrests(lil.player, lil.opponent, 0, 1, lil.stats, lil.rng, map);
  const lilUnit = lil.player.board.find(unit => norm(unit.name) === "lilanthim, anathema of predation");
  const lilanthimEnd = { summoned: Boolean(lilUnit), evolved: Boolean(lilUnit?.evolved) };

  // Calge-Danthla summons two Storm Crystalspawns; each increases Faith.
  const cal = makePair("calge");
  cal.player.faithActive = true;
  cal.player.faith = 0;
  const calgeCard = byName("Calge-Danthla, Eld Crystals");
  resolveRunecraftCardText("Summon 2 copies of Crystalspawn and give them Storm.", { card: calgeCard, player: cal.player, opponent: cal.opponent, playerIndex: 0, enemyIndex: 1, stats: cal.stats, rng: cal.rng, cardMap: map });
  const calgeUnits = cal.player.board.filter(isCrystalspawn);
  const calgeFanfare = { count: calgeUnits.length, storm: calgeUnits.filter(unit => hasU(unit, "Storm")).length, faith: cal.player.faith };

  // Tico evolution discount.
  const tic = makePair("tico-discount");
  const missile = instance(tic.player, byName("Mysterian Missile"));
  tic.player.hand = [missile];
  resolveRunecraftCardText("Reduce the cost of all Mysteria spells in your hand by 1.", { card: byName("Tico, Mysterian Spellcrafter"), player: tic.player, opponent: tic.opponent, playerIndex: 0, enemyIndex: 1, stats: tic.stats, rng: tic.rng, cardMap: map });
  const ticoDiscount = missile.costDelta;

  // Elmott silence removes card abilities before damage.
  const sil = makePair("elmott-silence");
  const wardCard = { ...dummy(-88205, "QA Ward", 1, 5, ["Ward"]), text: "Ward Last Words: Draw a card." };
  const ward = boardFollower(instance(sil.opponent, wardCard));
  sil.opponent.board = [ward];
  resolveRunecraftCardText("Select an enemy follower on the field, remove all abilities from it, and deal it 3 damage.", { card: byName("Elmott, Remembrance Aflame"), player: sil.player, opponent: sil.opponent, playerIndex: 0, enemyIndex: 1, stats: sil.stats, rng: sil.rng, cardMap: map });
  const elmottSilence = { defense: ward.defense, ward: hasU(ward, "Ward"), triggeredText: getUnitTriggeredText(ward, "lastWords") };

  // Lhynkal Super-Evolve deck injection.
  const lhi = makePair("lhynkal-inject");
  const lhynkalCard = byName("Lhynkal, Wandering Fool");
  resolveRunecraftCardText("Add 10 copies of Lhynkal, Wandering Fool to your deck.", { card: lhynkalCard, sourceUnit: boardFollower(instance(lhi.player, lhynkalCard)), player: lhi.player, opponent: lhi.opponent, playerIndex: 0, enemyIndex: 1, stats: lhi.stats, rng: lhi.rng, cardMap: map });
  const lhynkalInjection = lhi.player.deck.filter(item => norm(item.card?.name) === "lhynkal, wandering fool").length;

  return {
    elmottStartDamage,
    cagliostroStart,
    bergentStart,
    pascaleEnd,
    junoEnd,
    insomniacLastWords,
    enrapturedHeal,
    emperorEntry,
    gingerEntry,
    nobleEntry,
    lilanthimEnd,
    calgeFanfare,
    ticoDiscount,
    elmottSilence,
    lhynkalInjection
  };
}

'''
source = source.replace(anchor, qa + anchor, 1)
path.write_text(source, encoding="utf-8")
print("Runecraft extended behavior QA materialized.")
