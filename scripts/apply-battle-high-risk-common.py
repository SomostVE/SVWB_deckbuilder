from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
text = ENGINE.read_text(encoding="utf-8")


def once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f"Missing anchor: {label}")
    text = text.replace(old, new, 1)

# Imported data commonly uses a dash after Necromancy rather than a colon.
text = text.replace(
    r'/Necromancy\s*\(?\s*(\d+)\s*\)?\s*:\s*(.*)$/i',
    r'/Necromancy\s*\(?\s*(\d+)\s*\)?\s*[-–—:]\s*(.*)$/i'
)
text = text.replace(
    r'/Necromancy\s*\(?\s*(\d+)\s*\)?\s*:/i',
    r'/Necromancy\s*\(?\s*(\d+)\s*\)?\s*[-–—:]/i'
)

# Ability-destruction immunity and hand-granted keywords must survive instance -> board conversion.
once(
    '  const keywords = [...(card.keywords ?? [])];',
    '  const keywords = [...new Set([...(card.keywords ?? []), ...(inst.grantedKeywords ?? [])])];',
    'instance granted keywords',
)
once(
    'function destroyUnit(player, unit) { if (unit.superEvolved && player.isActive) return false; unit.defense = 0; return true; }',
    'function destroyUnit(player, unit) { if (unit.abilityDestructionImmune) return false; if (unit.superEvolved && player.isActive) return false; unit.defense = 0; return true; }',
    'ability destruction immunity',
)
once(
    'function bounce(player, unit) { if (unit.type === "Follower") notifyFollowerLeavesField(player, unit); player.board = player.board.filter(item => item.uid !== unit.uid); const item = instance(player, unit.card); if (player.hand.length >= 9) { toCemetery(player, item, false); return false; } player.hand.push(item); return true; }',
    '''function bounce(player, unit) {
  if (unit?.banishOnLeave) return banish(player, unit);
  if (unit.type === "Follower") notifyFollowerLeavesField(player, unit);
  player.board = player.board.filter(item => item.uid !== unit.uid);
  const item = instance(player, unit.card);
  if (player.hand.length >= 9) { toCemetery(player, item, false); return false; }
  player.hand.push(item);
  return true;
}''',
    'banish-on-leave bounce',
)

# Ghost-style leave-field replacement in cleanup and explicit destruction.
once(
    '''      player.board = player.board.filter(item => item.uid !== unit.uid);
      toCemetery(player, { uid: unit.uid, card: unit.card }, true);
      player.destroyedFollowers.push({ card: unit.card });''',
    '''      player.board = player.board.filter(item => item.uid !== unit.uid);
      if (unit.banishOnLeave) player.banished.push({ uid: unit.uid, card: unit.card });
      else {
        toCemetery(player, { uid: unit.uid, card: unit.card }, true);
        player.destroyedFollowers.push({ card: unit.card });
      }''',
    'cleanup leave replacement',
)
once(
    '''  player.board = player.board.filter(item => item.uid !== unit.uid);
  toCemetery(player, { uid: unit.uid, card: unit.card }, true);
  if (unit.type === "Follower") {
    player.destroyedFollowers.push({ card: unit.card });''',
    '''  player.board = player.board.filter(item => item.uid !== unit.uid);
  if (unit?.banishOnLeave) player.banished.push({ uid: unit.uid, card: unit.card });
  else toCemetery(player, { uid: unit.uid, card: unit.card }, true);
  if (unit.type === "Follower" && !unit?.banishOnLeave) {
    player.destroyedFollowers.push({ card: unit.card });''',
    'destroyObject leave replacement',
)

# Hand reactions to the opponent super-evolving.
helpers = r'''
// [[battle-high-risk-common-helpers]]
function highRiskEnemySuperEvolveHandTriggers(player) {
  const actions = [];
  for (const item of player.hand ?? []) {
    const name = norm(item.card?.name);
    let keyword = null;
    if (name === "inspirational one") keyword = "Bane";
    if (name === "dogged one") keyword = "Storm";
    if (!keyword) continue;
    item.grantedKeywords ??= [];
    if (!item.grantedKeywords.includes(keyword)) item.grantedKeywords.push(keyword);
    actions.push(`${item.card.name}: gains ${keyword} in hand`);
  }
  return actions;
}

function highRiskHandTurnEndTriggers(player) {
  const actions = [];
  for (const item of player.hand ?? []) {
    if (Number(item.card?.id) !== 90014320) continue;
    item.costDelta = (Number(item.costDelta) || 0) - 1;
    actions.push("Annihilating Onslaught: cost -1 in hand");
  }
  return actions;
}

function highRiskDrawMatching(ctx, count, predicate, label) {
  let drawn = 0;
  for (let i = 0; i < count; i += 1) {
    const item = drawMatchingCard(ctx.player, predicate, ctx.stats, ctx.playerIndex, ctx.rng);
    if (!item) break;
    drawn += 1;
  }
  ctx.__sideActions?.push?.(`${label}: draw ${drawn}`);
  return drawn;
}

function highRiskSummonDeckCard(ctx, predicate) {
  if (ctx.player.board.length >= 5) return null;
  const candidates = ctx.player.deck.filter(item => predicate(item.card));
  if (!candidates.length) return null;
  const item = candidates[Math.floor(ctx.rng() * candidates.length)];
  ctx.player.deck = ctx.player.deck.filter(entry => entry.uid !== item.uid);
  const unit = item.card.type === "Amulet" ? boardAmulet(item) : boardFollower(item);
  ctx.player.board.push(unit);
  if (unit.type === "Follower") ctx.player.rally += 1;
  ctx.__sideActions?.push?.(`summon from deck ${unit.name}`, ...applyEntryEvents(ctx, unit));
  return unit;
}

function highRiskOtherAlliedFollower(ctx) {
  return ctx.player.board.filter(unit => unit.type === "Follower" && unit.uid !== ctx.sourceUnit?.uid)
    .sort((a,b) => (Number(b.attack)+Number(b.defense))-(Number(a.attack)+Number(a.defense)))[0] ?? null;
}

function highRiskGrantKeyword(unit, keyword) {
  if (!unit) return;
  giveKeyword(unit, keyword);
  if (keyword === "Storm") { unit.canAttackFollower = true; unit.canAttackLeader = true; }
  else if (keyword === "Rush") unit.canAttackFollower = true;
}

function highRiskAlliedGroup(ctx, { other = False, className = null, trait = null } = {}) {
  return ctx.player.board.filter(unit => {
    if (unit.type !== "Follower") return false;
    if (other && unit.uid === ctx.sourceUnit?.uid) return false;
    if (className && norm(unit.card?.class) !== norm(className)) return false;
    if (trait && !(unit.card?.traits ?? []).some(value => norm(value) === norm(trait))) return false;
    return true;
  });
}

'''.replace('other = False', 'other = false')
once('function resolveHighRiskGenericText(textValue, ctx) {', helpers + 'function resolveHighRiskGenericText(textValue, ctx) {', 'high-risk common helpers')

# Dispatch opponent-hand super-evolve triggers in both manual and ability paths.
once(
    '''  // [[battle-swordcraft-manual-super-evolve-event]]
  if (superMode) actions.push(...applySwordcraftSuperEvolveHandTriggers(player));''',
    '''  // [[battle-high-risk-enemy-hand-super-evolve-event]]
  if (superMode) actions.push(...highRiskEnemySuperEvolveHandTriggers(opponent));
  // [[battle-swordcraft-manual-super-evolve-event]]
  if (superMode) actions.push(...applySwordcraftSuperEvolveHandTriggers(player));''',
    'manual enemy super-evolve hand event',
)
once(
    '''  // [[battle-swordcraft-ability-super-evolve-event]]
  actions.push(...applySwordcraftSuperEvolveHandTriggers(ctx.player));''',
    '''  // [[battle-high-risk-enemy-hand-ability-super-evolve-event]]
  actions.push(...highRiskEnemySuperEvolveHandTriggers(ctx.opponent));
  // [[battle-swordcraft-ability-super-evolve-event]]
  actions.push(...applySwordcraftSuperEvolveHandTriggers(ctx.player));''',
    'ability enemy super-evolve hand event',
)

# In-hand end-turn effects execute independently of board units.
once(
    '''function turnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];''',
    '''function turnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  actions.push(...highRiskHandTurnEndTriggers(player));''',
    'hand turn-end triggers',
)

# Generic preflight: consume compound mechanics before broad grammar handlers.
anchor = '''function resolveHighRiskGenericText(textValue, ctx) {
  let text = String(textValue ?? "");
  const actions = [];
'''
if anchor not in text:
    raise SystemExit('Missing high-risk resolver anchor for common preflight')
preflight = r'''function resolveHighRiskGenericText(textValue, ctx) {
  let text = String(textValue ?? "");
  const actions = [];
  ctx.__sideActions = actions;

  // [[battle-high-risk-common-preflight]]
  // Generic Skybound labels use the standard 10/15 turn+evolution gauges.
  const sky = skyboundCountForInstance(ctx);
  const superSky = text.match(/Super Skybound Art\s*:\s*([\s\S]*)$/i);
  if (superSky) {
    if (sky >= 15) text = `${text.slice(0, superSky.index)} ${superSky[1]}`.trim();
    else text = text.slice(0, superSky.index).trim();
  }
  const skybound = text.match(/Skybound Art\s*:\s*([\s\S]*)$/i);
  if (skybound) {
    if (sky >= 10) text = `${text.slice(0, skybound.index)} ${skybound[1]}`.trim();
    else text = text.slice(0, skybound.index).trim();
  }

  // Structural labels/state that do not themselves perform an action.
  text = text.replace(/\bCountdown\s*\(?\s*\d+\s*\)?\.?/gi, " ");
  text = text.replace(/\bActivates in hand\.?/gi, " ");
  text = text.replace(/^Earth Sigil\.?/i, () => { ctx.player.earthSigils += 1; actions.push(`Earth Sigils +1 (${ctx.player.earthSigils})`); return " "; });
  const leaveBanish = /When this card leaves the field, banish it\.?/i;
  if (leaveBanish.test(text) && ctx.sourceUnit) { ctx.sourceUnit.banishOnLeave = true; actions.push(`${ctx.sourceUnit.name}: banish on leave`); text = text.replace(leaveBanish, " "); }
  const banishThis = /Banish this card\.?/i;
  if (banishThis.test(text) && ctx.sourceUnit) { banish(ctx.player, ctx.sourceUnit); actions.push(`banish ${ctx.sourceUnit.name}`); text = text.replace(banishThis, " "); }

  // Draw/tutor primitives.
  for (const match of [...text.matchAll(/Draw\s+(?:(\d+)\s+)?(?:(Forestcraft|Swordcraft|Runecraft|Dragoncraft|Abysscraft|Havencraft|Portalcraft|Neutral)\s+)?followers?\.?/gi)]) {
    const count = Number(match[1] || 1); const cls = match[2] ? norm(match[2]) : null;
    const drawn = highRiskDrawMatching(ctx, count, card => card.type === "Follower" && (!cls || norm(card.class) === cls), "follower tutor");
    actions.push(`draw ${drawn}/${count} follower${count === 1 ? "" : "s"}`); text = text.replace(match[0], " ");
  }
  for (const match of [...text.matchAll(/Draw\s+(?:a|an|one|1)\s+(\d+)-cost spell\.?/gi)]) {
    const cost = Number(match[1]); const drawn = highRiskDrawMatching(ctx, 1, card => card.type === "Spell" && Number(card.cost) === cost, `${cost}-cost spell tutor`);
    actions.push(`draw ${drawn} ${cost}-cost spell`); text = text.replace(match[0], " ");
  }
  const wardDraw = text.match(/Draw X cards\.\s*X is the number of allied followers on the field with Ward\.?/i);
  if (wardDraw) { const x = ctx.player.board.filter(unit => unit.type === "Follower" && hasU(unit, "Ward")).length; const drawn = drawCards(ctx.player, x, ctx.stats, ctx.playerIndex); actions.push(`draw ${drawn}/${x} from allied Ward count`); text = text.replace(wardDraw[0], " "); }

  // Resource changes.
  for (const match of [...text.matchAll(/Gain\s+(\d+)\s+shadows?\.?/gi)]) { ctx.player.shadows += Number(match[1]); actions.push(`Shadows +${match[1]}`); text = text.replace(match[0], " "); }
  for (const match of [...text.matchAll(/Recover\s+(\d+)\s+evolution points?\.?/gi)]) { const n=Number(match[1]); ctx.player.ep=Math.min(2,(Number(ctx.player.ep)||0)+n); actions.push(`EP +${n}`); text=text.replace(match[0]," "); }
  for (const match of [...text.matchAll(/Gain\s+(\d+)\s+max play points?\.?/gi)]) { const n=Number(match[1]); ctx.player.maxPp=Math.min(10,(Number(ctx.player.maxPp)||0)+n); actions.push(`max PP +${n}`); text=text.replace(match[0]," "); }
  const classCost = text.match(/Reduce the cost of all (Forestcraft|Swordcraft|Runecraft|Dragoncraft|Abysscraft|Havencraft|Portalcraft|Neutral) cards in your hand by\s*(\d+)\.?/i);
  if (classCost) { let n=0; for(const item of ctx.player.hand){ if(norm(item.card?.class)===norm(classCost[1])){item.costDelta=(Number(item.costDelta)||0)-Number(classCost[2]); n+=1;}} actions.push(`${classCost[1]} hand cost -${classCost[2]} ×${n}`); text=text.replace(classCost[0]," "); }
  const sbN = text.match(/Spellboost your hand\s+(\d+)\s+times?\.?/i);
  if (sbN) { spellboostHand(ctx.player, Number(sbN[1]), ctx.cardMap, actions); text=text.replace(sbN[0]," "); }
  const sbX = /Spellboost your hand X times\.\s*X is this follower'?s attack\.?/i;
  if (sbX.test(text)) { const x=Math.max(0,Number(ctx.sourceUnit?.attack)||0); spellboostHand(ctx.player,x,ctx.cardMap,actions); actions.push(`Spellboost hand ×${x}`); text=text.replace(sbX," "); }
  const gauge = text.match(/Increase the Skybound Art gauges of all cards in your hand by\s*(\d+)\.?/i);
  if (gauge) { const n=Number(gauge[1]); for(const item of ctx.player.hand) item.skyboundEvolutions=(Number(item.skyboundEvolutions)||0)+n; actions.push(`hand Skybound gauges +${n}`); text=text.replace(gauge[0]," "); }

  // Evolution primitives and common conditions.
  const evolveSelf = /Evolve this follower\.?/i;
  if (evolveSelf.test(text) && ctx.sourceUnit) { evolveUnitByAbility(ctx, ctx.sourceUnit, actions); text=text.replace(evolveSelf," "); }
  const superSelf = /Super-evolve this follower\.?/i;
  if (superSelf.test(text) && ctx.sourceUnit) { superEvolveUnitByAbility(ctx, ctx.sourceUnit, actions); text=text.replace(superSelf," "); }
  const maxPpEvolve = /If you have 10 max play points, evolve this follower\.?/i;
  if (maxPpEvolve.test(text)) { if((Number(ctx.player.maxPp)||0)>=10 && ctx.sourceUnit) evolveUnitByAbility(ctx,ctx.sourceUnit,actions); text=text.replace(maxPpEvolve," "); }
  const overflowEvolve = /If you'?re in Overflow, evolve this follower\.?/i;
  if (overflowEvolve.test(text)) { if((Number(ctx.player.maxPp)||0)>=7 && ctx.sourceUnit) evolveUnitByAbility(ctx,ctx.sourceUnit,actions); text=text.replace(overflowEvolve," "); }
  const evolvedAllyEvolve = /If there'?s an evolved allied follower on the field, evolve this follower\.?/i;
  if (evolvedAllyEvolve.test(text)) { if(ctx.player.board.some(unit=>unit.type==="Follower" && unit.uid!==ctx.sourceUnit?.uid && (unit.evolved||unit.superEvolved)) && ctx.sourceUnit) evolveUnitByAbility(ctx,ctx.sourceUnit,actions); text=text.replace(evolvedAllyEvolve," "); }
  const superAllyDamage = text.match(/If there'?s a super-evolved allied follower on the field, select an enemy follower on the field and deal it\s*(\d+)\s*damage\.?/i);
  if (superAllyDamage) { if(ctx.player.board.some(unit=>unit.type==="Follower"&&unit.uid!==ctx.sourceUnit?.uid&&unit.superEvolved)){ const target=choosePlannedTarget(ctx,ctx.opponent.board.filter(unit=>unit.type==="Follower")); if(target) damageUnit(target,Number(superAllyDamage[1]),ctx.opponent,ctx.player,ctx,actions);} text=text.replace(superAllyDamage[0]," "); }
  const evolveOther = /Select another unevolved allied follower on the field and evolve it(?: and this follower)?\.?/i;
  const evolveOtherMatch=text.match(evolveOther);
  if(evolveOtherMatch){ const target=ctx.player.board.find(unit=>unit.type==="Follower"&&unit.uid!==ctx.sourceUnit?.uid&&!unit.evolved&&!unit.superEvolved); if(target)evolveUnitByAbility(ctx,target,actions); if(/and this follower/i.test(evolveOtherMatch[0])&&ctx.sourceUnit)evolveUnitByAbility(ctx,ctx.sourceUnit,actions); text=text.replace(evolveOther," "); }
  const superOther=/Select another unevolved allied follower on the field and super-evolve it\.?/i;
  if(superOther.test(text)){ const target=ctx.player.board.find(unit=>unit.type==="Follower"&&unit.uid!==ctx.sourceUnit?.uid&&!unit.evolved&&!unit.superEvolved); if(target)superEvolveUnitByAbility(ctx,target,actions); text=text.replace(superOther," "); }
  const evolveAll=/Evolve all unevolved allied followers on the field\.?/i;
  if(evolveAll.test(text)){ for(const unit of [...ctx.player.board]) if(unit.type==="Follower"&&!unit.evolved&&!unit.superEvolved)evolveUnitByAbility(ctx,unit,actions); text=text.replace(evolveAll," "); }
  const superAll=/Super-evolve all unevolved allied followers on the field\.?/i;
  if(superAll.test(text)){ for(const unit of [...ctx.player.board]) if(unit.type==="Follower"&&!unit.evolved&&!unit.superEvolved)superEvolveUnitByAbility(ctx,unit,actions); text=text.replace(superAll," "); }

  // Targeted keyword grants/removal and attack locks.
  for (const match of [...text.matchAll(/Select another allied follower on the field and give it\s+(Bane|Storm|Rush|Ward|Barrier|Ambush|Aura|Intimidate)\.?/gi)]) { const target=highRiskOtherAlliedFollower(ctx); if(target)highRiskGrantKeyword(target, match[1][0].toUpperCase()+match[1].slice(1).toLowerCase()); actions.push(`other ally gains ${match[1]}`); text=text.replace(match[0]," "); }
  const selectAllyRush=/Select an allied follower on the field and give it Rush\.?/i;
  if(selectAllyRush.test(text)){ const target=ctx.player.board.find(unit=>unit.type==="Follower")??null; if(target)highRiskGrantKeyword(target,"Rush"); text=text.replace(selectAllyRush," "); }
  const shikiStorm=/Select an allied Shikigami follower on the field and give it Storm\.?/i;
  if(shikiStorm.test(text)){ const target=ctx.player.board.find(unit=>unit.type==="Follower"&&(unit.card?.traits??[]).some(t=>norm(t)==="shikigami")); if(target)highRiskGrantKeyword(target,"Storm"); text=text.replace(shikiStorm," "); }
  const removeSelfWard=/Remove Ward from this follower\.?/i;
  if(removeSelfWard.test(text)&&ctx.sourceUnit){ ctx.sourceUnit.keywords=ctx.sourceUnit.keywords.filter(k=>norm(k)!=="ward"); actions.push(`${ctx.sourceUnit.name}: remove Ward`); text=text.replace(removeSelfWard," "); }
  const removeTargetWard=/Select an enemy follower on the field and remove Ward from it\.?/i;
  if(removeTargetWard.test(text)){ const target=choosePlannedTarget(ctx,ctx.opponent.board.filter(unit=>unit.type==="Follower")); if(target)target.keywords=target.keywords.filter(k=>norm(k)!=="ward"); text=text.replace(removeTargetWard," "); }
  const cantAttack=/Give this follower ["“]Can'?t attack followers or leaders\.?["”](?: until the end of the turn)?\.?/i;
  if(cantAttack.test(text)&&ctx.sourceUnit){ctx.sourceUnit.canAttackLeader=false;ctx.sourceUnit.canAttackFollower=false;ctx.sourceUnit.highRiskAttackLockThisTurn=true;actions.push(`${ctx.sourceUnit.name}: attack locked this turn`);text=text.replace(cantAttack," ");}
  const staticCant=/Can'?t attack followers or leaders\.?/i;
  if(staticCant.test(text)&&ctx.sourceUnit){ctx.sourceUnit.permanentAttackLock=true;ctx.sourceUnit.canAttackLeader=false;ctx.sourceUnit.canAttackFollower=false;actions.push(`${ctx.sourceUnit.name}: permanent attack lock`);text=text.replace(staticCant," ");}
  const abilityImmune=/Can'?t be destroyed by abilities\.?/i;
  if(abilityImmune.test(text)&&ctx.sourceUnit){ctx.sourceUnit.abilityDestructionImmune=true;actions.push(`${ctx.sourceUnit.name}: ability-destruction immune`);text=text.replace(abilityImmune," ");}
  const attacksN=text.match(/Give this follower ["“]Can attack\s*(\d+)\s*times per turn\.?["”]/i);
  if(attacksN&&ctx.sourceUnit){ const n=Number(attacksN[1]);ctx.sourceUnit.baseMaxAttacks=Math.max(n,Number(ctx.sourceUnit.baseMaxAttacks)||1);ctx.sourceUnit.maxAttacks=Math.max(n,Number(ctx.sourceUnit.maxAttacks)||1);actions.push(`${ctx.sourceUnit.name}: attack ×${n}`);text=text.replace(attacksN[0]," ");}

  // Group buffs + keyword grants, including class-restricted variants.
  for(const match of [...text.matchAll(/Give all (other )?allied(?:(?:\s+(Forestcraft|Swordcraft|Runecraft|Dragoncraft|Abysscraft|Havencraft|Portalcraft|Neutral))?) followers on the field\s*\+(\d+)\/\+(\d+)(?:\s+and\s+(Rush|Ward|Barrier|Storm|Bane|Ambush|Aura|Intimidate))?\.?/gi)]){
    const units=highRiskAlliedGroup(ctx,{other:Boolean(match[1]),className:match[2]||null});const a=Number(match[3]),d=Number(match[4]);for(const unit of units){buff(unit,a,d);if(match[5])highRiskGrantKeyword(unit,match[5][0].toUpperCase()+match[5].slice(1).toLowerCase());}actions.push(`group buff ${units.length}: +${a}/+${d}${match[5]?` ${match[5]}`:""}`);text=text.replace(match[0]," ");
  }
  for(const match of [...text.matchAll(/Give all (other )?allied(?:(?:\s+(Forestcraft|Swordcraft|Runecraft|Dragoncraft|Abysscraft|Havencraft|Portalcraft|Neutral))?) followers on the field\s+(Rush|Ward|Barrier|Storm|Bane|Ambush|Aura|Intimidate)\.?/gi)]){
    const units=highRiskAlliedGroup(ctx,{other:Boolean(match[1]),className:match[2]||null});for(const unit of units)highRiskGrantKeyword(unit,match[3][0].toUpperCase()+match[3].slice(1).toLowerCase());actions.push(`group keyword ${match[3]} ×${units.length}`);text=text.replace(match[0]," ");
  }
  const classHandBuff=text.match(/Give all (Forestcraft|Swordcraft|Runecraft|Dragoncraft|Abysscraft|Havencraft|Portalcraft|Neutral) followers in your hand\s*\+(\d+)\/\+(\d+)\.?/i);
  if(classHandBuff){let n=0;for(const item of ctx.player.hand){if(item.card?.type==="Follower"&&norm(item.card?.class)===norm(classHandBuff[1])){item.attackBonus=(Number(item.attackBonus)||0)+Number(classHandBuff[2]);item.defenseBonus=(Number(item.defenseBonus)||0)+Number(classHandBuff[3]);n+=1;}}actions.push(`${classHandBuff[1]} hand buff ×${n}`);text=text.replace(classHandBuff[0]," ");}
  const leftmostAttack=text.match(/Give the leftmost allied (Forestcraft|Swordcraft|Runecraft|Dragoncraft|Abysscraft|Havencraft|Portalcraft|Neutral) follower on the field ["“]Can attack\s*(\d+)\s*times per turn\.?["”]/i);
  if(leftmostAttack){const target=ctx.player.board.find(unit=>unit.type==="Follower"&&norm(unit.card?.class)===norm(leftmostAttack[1]));if(target){const n=Number(leftmostAttack[2]);target.baseMaxAttacks=Math.max(n,Number(target.baseMaxAttacks)||1);target.maxAttacks=Math.max(n,Number(target.maxAttacks)||1;}text=text.replace(leftmostAttack[0]," ");}

  // Common target removal/bounce.
  const returnOther=/Select another allied card on the field and return it to hand\.?/i;
  if(returnOther.test(text)){const target=ctx.player.board.find(unit=>unit.uid!==ctx.sourceUnit?.uid)??null;if(target)bounce(ctx.player,target);actions.push(`return allied card ${target?.name??"unavailable"}`);text=text.replace(returnOther," ");}
  const returnEnemy=/Select an enemy follower on the field and return it to hand\.?/i;
  if(returnEnemy.test(text)){const target=choosePlannedTarget(ctx,ctx.opponent.board.filter(unit=>unit.type==="Follower"));if(target)bounce(ctx.opponent,target);actions.push(`return enemy follower ${target?.name??"unavailable"}`);text=text.replace(returnEnemy," ");}
  const destroyHighest=/Destroy a random enemy follower with the highest attack\.?/i;
  if(destroyHighest.test(text)){const pool=ctx.opponent.board.filter(unit=>unit.type==="Follower");const max=Math.max(-Infinity,...pool.map(unit=>Number(unit.attack)||0));const candidates=pool.filter(unit=>(Number(unit.attack)||0)===max);const target=candidates.length?candidates[Math.floor(ctx.rng()*candidates.length)]:null;if(target)destroyUnit(ctx.opponent,target);actions.push(`destroy highest-attack enemy ${target?.name??"unavailable"}`);text=text.replace(destroyHighest," ");}
  const destroyTwo=/Select 2 enemy followers on the field and destroy them\.?/i;
  if(destroyTwo.test(text)){const targets=[...ctx.opponent.board].filter(unit=>unit.type==="Follower").sort((a,b)=>followerThreatValue(b)-followerThreatValue(a)).slice(0,2);for(const target of targets)destroyUnit(ctx.opponent,target);actions.push(`destroy ${targets.length} selected enemies`);text=text.replace(destroyTwo," ");}
  const destroySuper=/Select a super-evolved enemy follower on the field and destroy it\.?/i;
  if(destroySuper.test(text)){const target=ctx.opponent.board.find(unit=>unit.type==="Follower"&&unit.superEvolved)??null;if(target)destroyUnit(ctx.opponent,target);text=text.replace(destroySuper," ");}
  const banishLow=text.match(/Select an enemy follower on the field with\s*(\d+)\s*defense or less and banish it\.?/i);
  if(banishLow){const target=choosePlannedTarget(ctx,ctx.opponent.board.filter(unit=>unit.type==="Follower"&&(Number(unit.defense)||0)<=Number(banishLow[1])));if(target)banish(ctx.opponent,target);text=text.replace(banishLow[0]," ");}
  const banishAllLow=text.match(/Banish all enemy followers with\s*(\d+)\s*defense or less(?: instead)?\.?/i);
  if(banishAllLow){for(const target of [...ctx.opponent.board].filter(unit=>unit.type==="Follower"&&(Number(unit.defense)||0)<=Number(banishAllLow[1])))banish(ctx.opponent,target);text=text.replace(banishAllLow[0]," ");}
  const banishSelected=/Select an enemy follower on the field and banish it\.?/i;
  if(banishSelected.test(text)){const target=choosePlannedTarget(ctx,ctx.opponent.board.filter(unit=>unit.type==="Follower"));if(target)banish(ctx.opponent,target);text=text.replace(banishSelected," ");}

  // Attack-scaled target/split damage and all-followers damage.
  const attackDamage=/Select an enemy follower on the field and deal it X damage\.\s*X is this follower'?s attack\.?/i;
  if(attackDamage.test(text)){const x=Math.max(0,Number(ctx.sourceUnit?.attack)||0);const target=choosePlannedTarget(ctx,ctx.opponent.board.filter(unit=>unit.type==="Follower"));if(target)damageUnit(target,x,ctx.opponent,ctx.player,ctx,actions);actions.push(`attack-scaled damage ${x}`);text=text.replace(attackDamage," ");}
  const splitAttack=/Deal X damage split between all enemy followers\.\s*X is this follower'?s attack\.?/i;
  if(splitAttack.test(text)){let x=Math.max(0,Number(ctx.sourceUnit?.attack)||0);const original=x;const pool=ctx.opponent.board.filter(unit=>unit.type==="Follower");while(x>0&&pool.length){damageUnit(pool[Math.floor(ctx.rng()*pool.length)],1,ctx.opponent,ctx.player,ctx,actions);x-=1;}actions.push(`attack split damage ${original}`);text=text.replace(splitAttack," ");}
  const allFollowers=text.match(/Deal\s*(\d+)\s*damage to all followers\.?/i);
  if(allFollowers){const n=Number(allFollowers[1]);for(const unit of ctx.player.board.filter(unit=>unit.type==="Follower"))damageUnit(unit,n,ctx.player,ctx.opponent,ctx,actions);for(const unit of ctx.opponent.board.filter(unit=>unit.type==="Follower"))damageUnit(unit,n,ctx.opponent,ctx.player,ctx,actions);actions.push(`${n} damage all followers`);text=text.replace(allFollowers[0]," ");}

  // Healing / temporary states.
  const fullHeal=/Fully restore the defense of this follower and restore the same amount to your leader\.?/i;
  if(fullHeal.test(text)&&ctx.sourceUnit){const amount=Math.max(0,(Number(ctx.sourceUnit.maxDefense)||0)-(Number(ctx.sourceUnit.defense)||0));ctx.sourceUnit.defense=ctx.sourceUnit.maxDefense;healPlayer(ctx.player,amount,ctx.stats,ctx.playerIndex);actions.push(`fully heal self/leader ${amount}`);text=text.replace(fullHeal," ");}
  const allAlliesHeal=text.match(/Restore\s*(\d+)\s*defense to all allies\.?/i);
  if(allAlliesHeal){const n=Number(allAlliesHeal[1]);healPlayer(ctx.player,n,ctx.stats,ctx.playerIndex);for(const unit of ctx.player.board.filter(unit=>unit.type==="Follower"))unit.defense=Math.min(Number(unit.maxDefense)||unit.defense,(Number(unit.defense)||0)+n);actions.push(`restore ${n} to all allies`);text=text.replace(allAlliesHeal[0]," ");}

  // Deck summons / deck maintenance.
  const summonClass=text.match(/Summon a random (Forestcraft|Swordcraft|Runecraft|Dragoncraft|Abysscraft|Havencraft|Portalcraft|Neutral) follower that costs\s*(\d+)\s*or less from your deck\.?/i);
  if(summonClass){highRiskSummonDeckCard(ctx,card=>card.type==="Follower"&&norm(card.class)===norm(summonClass[1])&&(Number(card.cost)||0)<=Number(summonClass[2]));text=text.replace(summonClass[0]," ");}
  const summonAmulets=text.match(/Summon\s*(\d+)\s*random differently named amulets that cost\s*(\d+)\s*or less from your deck\.?/i);
  if(summonAmulets){const count=Number(summonAmulets[1]),max=Number(summonAmulets[2]);const seen=new Set();let n=0;for(let i=0;i<count;i++){const unit=highRiskSummonDeckCard(ctx,card=>card.type==="Amulet"&&(Number(card.cost)||0)<=max&&!seen.has(norm(card.name)));if(!unit)break;seen.add(norm(unit.name));n+=1;}actions.push(`summon ${n} different amulets from deck`);text=text.replace(summonAmulets[0]," ");}
  const dupes=/Banish all duplicates from your deck\.?/i;
  if(dupes.test(text)){const seen=new Set(),keep=[],ban=[];for(const item of ctx.player.deck){const key=norm(item.card?.name);if(seen.has(key))ban.push(item);else{seen.add(key);keep.push(item);}}ctx.player.deck=keep;ctx.player.banished.push(...ban.map(item=>({uid:item.uid,card:item.card})));actions.push(`banish ${ban.length} deck duplicates`);text=text.replace(dupes," ");}

  // Delayed/conditional board-wide wording.
  const ifSpells=text.match(/If you have at least\s*(\d+)\s*spells in your hand, deal\s*(\d+)\s*damage to all enemy followers\.?/i);
  if(ifSpells){if(ctx.player.hand.filter(item=>item.card?.type==="Spell").length>=Number(ifSpells[1]))for(const unit of ctx.opponent.board.filter(unit=>unit.type==="Follower"))damageUnit(unit,Number(ifSpells[2]),ctx.opponent,ctx.player,ctx,actions);text=text.replace(ifSpells[0]," ");}
  const ifAmulets=text.match(/If there are at least\s*(\d+)\s*allied amulets on the field, deal\s*(\d+)\s*damage to all enemies\.?/i);
  if(ifAmulets){if(ctx.player.board.filter(unit=>unit.type==="Amulet").length>=Number(ifAmulets[1])){for(const unit of ctx.opponent.board.filter(unit=>unit.type==="Follower"))damageUnit(unit,Number(ifAmulets[2]),ctx.opponent,ctx.player,ctx,actions);const dealt=damageLeader(ctx.opponent,Number(ifAmulets[2]));ctx.stats.damageDealt[ctx.playerIndex]+=dealt;}text=text.replace(ifAmulets[0]," ");}

  // Named special-pronoun bridge: Amorous Necromancer's Super-Evolve refers to
  // the Ghosts created by its Evolve ability.
  if(norm(ctx.card?.name)==="amorous necromancer" && /Give them Drain\.?/i.test(text)){for(const unit of ctx.player.board.filter(unit=>norm(unit.name)==="ghost"))highRiskGrantKeyword(unit,"Drain");actions.push("Amorous Necromancer: Ghosts gain Drain");text=text.replace(/Give them Drain\.?/i," ");}
'''
text = text.replace(anchor, preflight, 1)

ENGINE.write_text(text, encoding="utf-8")
print("Materialized generic high-risk resources and board actions.")
