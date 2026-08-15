import {
  executeGenericEffects,
  getCountdown,
  getTriggeredText
} from "./battle-rules.js";

const MAX_ROUNDS = 20;
const MAX_ACTIONS = 24;
const STANDARD = new Set([
  "Aura","Ambush","Bane","Barrier","Clash","Combo","Countdown","Crest","Drain","Engage","Enhance","Evolve","Fanfare","Intimidate","Last Words","Necromancy","On Spellboost","Overflow","Rally","Reanimate","Rush","Spellboost","Storm","Super-Evolve","Ward"
]);

export function simulateBattle({ playerDeck, opponentDeck, cardMap, playerStrategy = {}, opponentStrategy = {}, seed = "deci-builder", playerSide = "random", recordFrames = true }) {
  prepareCardMap(cardMap);
  const rng = createRng(seed);
  const side = playerSide === "first" ? 0 : playerSide === "second" ? 1 : (rng() < .5 ? 0 : 1);
  const first = side === 0 ? 0 : 1;
  const second = 1 - first;
  const players = [makePlayer("You", playerDeck, playerStrategy, cardMap, rng), makePlayer("Opponent", opponentDeck, opponentStrategy, cardMap, rng)];
  players[first].goingFirst = true;
  players[second].goingSecond = true;
  players[second].bonusPpAvailable = true;
  const stats = createStats();
  const frames = [];

  drawCards(players[0], 4, stats, 0);
  drawCards(players[1], 4, stats, 1);
  snap(frames, players, { round: 0, active: first, phase: "opening", action: "Both players draw 4 cards." }, stats, recordFrames);
  mulligan(players[0], rng, stats, 0, frames, players, recordFrames);
  mulligan(players[1], rng, stats, 1, frames, players, recordFrames);

  let winner = null;
  let lastRound = 0;
  outer: for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    lastRound = round;
    for (const active of [first, second]) {
      const enemy = 1 - active;
      const p = players[active], o = players[enemy];
      p.isActive = true; o.isActive = false;
      p.personalTurn += 1;
      p.cardsPlayedThisTurn = 0;
      p.spellsPlayedThisTurn = 0;
      p.evolutionActionUsed = false;
      p.maxPp = Math.min(10, p.maxPp + 1);
      p.pp = p.maxPp;
      if (p.goingSecond && p.personalTurn === 6 && p.bonusPpUses < 2) p.bonusPpAvailable = true;
      readyBoard(p);

      const start = turnStart(p, o, active, enemy, stats, rng, cardMap);
      snap(frames, players, { round, active, phase: "turn-start", action: compact(`${p.name} starts turn ${p.personalTurn} with ${p.pp}/${p.maxPp} PP.`, start) }, stats, recordFrames);
      if (o.hp <= 0) { winner = active; break outer; }

      drawCards(p, 1, stats, active);
      if (p.deckOut) { winner = enemy; snap(frames, players, { round, active, phase: "draw", action: `${p.name} cannot draw from an empty deck and loses.` }, stats, recordFrames); break outer; }
      snap(frames, players, { round, active, phase: "draw", action: `${p.name} draws a card.` }, stats, recordFrames);

      useBonusPpIfUseful(p);

      let safety = 0;
      while (safety++ < MAX_ACTIONS) {
        const engage = bestEngage(p, o);
        const play = bestPlay(p, o);
        if (!engage && !play) break;
        if (engage && (!play || engage.score > play.score)) {
          const result = resolveEngage(engage.unit, p, o, active, enemy, stats, rng, cardMap);
          snap(frames, players, { round, active, phase: "play", action: compact(`${p.name} engages ${engage.unit.name}${engage.cost ? ` (${engage.cost} PP)` : ""}.`, result.actions) }, stats, recordFrames);
        } else {
          const result = playCard(play.instance, play.mode, p, o, active, enemy, stats, rng, cardMap);
          snap(frames, players, { round, active, phase: "play", action: compact(`${p.name} plays ${play.instance.card.name} (${play.mode.cost} PP${play.mode.kind !== "base" ? ` · ${cap(play.mode.kind)}` : ""}).`, result.actions) }, stats, recordFrames);
        }
        if (o.hp <= 0) { winner = active; break outer; }
      }

      const evo = maybeEvolve(p, o, active, enemy, stats, rng, cardMap);
      if (evo) snap(frames, players, { round, active, phase: evo.super ? "super-evolve" : "evolve", action: evo.action }, stats, recordFrames);
      if (o.hp <= 0) { winner = active; break outer; }

      attackPhase(p, o, active, enemy, stats, frames, players, round, rng, cardMap, recordFrames);
      if (o.hp <= 0) { winner = active; break outer; }

      const end = turnEnd(p, o, active, enemy, stats, rng, cardMap);
      stats.ppWasted[active] += Math.max(0, Math.min(p.pp, p.maxPp));
      snap(frames, players, { round, active, phase: "turn-end", action: compact(`${p.name} ends turn ${p.personalTurn}.`, end) }, stats, recordFrames);
      if (o.hp <= 0) { winner = active; break outer; }
      p.isActive = false;
    }
  }

  const coverage = [analyzeDeckCoverage(playerDeck, cardMap), analyzeDeckCoverage(opponentDeck, cardMap)];
  return { frames, coverage, summary: { winner: winner == null ? "Draw / turn limit" : players[winner].name, winnerIndex: winner, rounds: lastRound, finalHp: players.map(p => p.hp), stats, experimental: coverage.some(c => c.unsupported || c.partial) } };
}

export function analyzeDeckCoverage(deck, cardMap) {
  prepareCardMap(cardMap);
  let total = 0, full = 0, partial = 0, unsupported = 0;
  const partialCards = [], unsupportedCards = [], mechanics = new Map();
  for (const [id, qty] of normalizeDeck(deck)) {
    const card = cardMap.get(Number(id));
    const n = Number(qty) || 0; total += n;
    const s = analyzeCardSupport(card);
    if (s.level === "full") full += n;
    else if (s.level === "partial") { partial += n; if (card) partialCards.push(card.name); }
    else { unsupported += n; unsupportedCards.push(card?.name ?? `Card ${id}`); }
    for (const m of s.mechanics ?? []) mechanics.set(m, (mechanics.get(m) ?? 0) + n);
  }
  return { total, full, partial, unsupported, modeledPercent: total ? Math.round((full + partial * .72) / total * 100) : 0, partialCards: uniq(partialCards).slice(0,18), unsupportedCards: uniq(unsupportedCards).slice(0,18), mechanics: [...mechanics].sort((a,b)=>b[1]-a[1]).slice(0,14).map(([name,count])=>({name,count})) };
}

export function analyzeCardSupport(card) {
  if (!card) return { level:"unsupported", reason:"Missing card", mechanics:[] };
  const text = norm(card.text), mechanics = new Set();
  const relatedNames = new Set((card.__relatedNames ?? []).map(norm));
  for (const k of card.keywords ?? []) {
    const key = String(k).trim();
    if (STANDARD.has(key)) mechanics.add(key);
    else if (!relatedNames.has(norm(key)) && /^(Barrier|Aura|Ambush|Intimidate|Clash|Rally|Reanimate|Crest|Engage|On Spellboost)$/.test(key)) mechanics.add(key);
  }
  const checks = [["Spellboost",/spellboost/],["Mode",/select a mode/],["Rally",/rally\s*\(?\s*\d+/],["Crest",/crest/],["Engage",/engage/],["Reanimate",/reanimate/],["Skybound Art",/skybound art/],["Barrier",/barrier/],["Aura",/\baura\b/],["Ambush",/ambush/],["Intimidate",/intimidate/],["Earth Rite",/earth rite/],["Invoke",/\binvoke\b/]];
  for (const [m,re] of checks) if (re.test(text)) mechanics.add(m);
  if (/\b(?:fuse|transmute|apocalypse|faith)\b/.test(text)) return { level: card.type === "Follower" ? "partial" : "unsupported", reason:"Mechanic not modeled yet", mechanics:[...mechanics] };
  if (/copy (?:an?|the)|transform .* into a copy|choose .* from your deck/i.test(text)) return { level:"partial", reason:"Copy/search choice is approximated", mechanics:[...mechanics] };
  if (/crest/.test(text)) return { level:"partial", reason:"Crest is stored; card-specific persistent crest triggers are partially modeled", mechanics:[...mechanics] };
  if (/whenever|once on each|when .* (?:takes damage|enters the field|is destroyed|attacks)/.test(text)) return { level:"partial", reason:"Reactive trigger is modeled for common cases", mechanics:[...mechanics] };
  if (/damage .* reduced|can'?t take more than|prevent .* damage/.test(text)) return { level:"partial", reason:"Damage prevention is approximated", mechanics:[...mechanics] };
  const recognized = !text || card.type === "Follower" || /draw|restore|recover|deal .*damage|destroy|banish|return|discard|give|gain|summon|add .*hand|play point|countdown|enhance|accelerate|spellboost|necromancy|overflow|combo|rally|reanimate|select a mode|earth rite|evolve|super-evolve|ward|rush|storm|bane|drain|barrier|aura|ambush|intimidate/.test(text);
  return recognized ? { level:"full", reason:"Covered by Battle Sim v2 rules", mechanics:[...mechanics] } : { level:"partial", reason:"Unique text is approximated", mechanics:[...mechanics] };
}

function createStats(){const p=()=>[0,0];return{damageDealt:p(),cardsPlayed:p(),attacks:p(),draws:p(),unsupportedEffects:p(),evolutions:p(),superEvolutions:p(),healing:p(),followersLost:p(),cardsGenerated:p(),cardsBurned:p(),ppSpent:p(),ppWasted:p(),spellsPlayed:p(),lastWordsTriggered:p(),strikeTriggered:p()};}
function makePlayer(name, deck, strategy, cardMap, rng){
  const p={name,strategy:normStrategy(strategy),hp:20,maxHp:20,maxPp:0,pp:0,ep:2,sep:2,shadows:0,rally:0,earthSigils:0,crests:[],bonusPpAvailable:false,bonusPpUses:0,goingFirst:false,goingSecond:false,personalTurn:0,cardsPlayedThisTurn:0,spellsPlayedThisTurn:0,evolutionsThisMatch:0,evolutionActionUsed:false,nextSerial:0,deck:[],hand:[],board:[],cemetery:[],banished:[],destroyedFollowers:[],deckOut:false,isActive:false};
  for(const[id,qty]of normalizeDeck(deck)){const c=cardMap.get(Number(id));if(!c)continue;for(let i=0;i<qty;i++)p.deck.push(instance(p,c));}
  shuffle(p.deck,rng);return p;
}
function instance(p,card){return{uid:`${p.name}-${p.nextSerial++}`,card,spellboost:0,costDelta:0,attackBonus:0,defenseBonus:0,x:initialX(card)};}
function initialX(card){const m=String(card?.text??"").match(/X starts at\s*(-?\d+)/i);return m?Number(m[1]):0;}
function normalizeDeck(deck){if(deck instanceof Map)return[...deck.entries()].map(([i,q])=>[+i,+q]);if(!Array.isArray(deck))return[];return deck.map(e=>Array.isArray(e)?[+e[0],+e[1]]:[+(e.cardId??e.id),+(e.qty??e.quantity??1)]).filter(([i,q])=>Number.isFinite(i)&&q>0);}
function normStrategy(s){return{style:s?.style??"midrange",label:s?.label??"Baseline",mulliganMaxCost:+(s?.mulliganMaxCost??3),faceBias:clamp(+(s?.faceBias??.5),0,1),tradeBias:clamp(+(s?.tradeBias??.5),0,1),priorities:Array.isArray(s?.priorities)?s.priorities:[]};}

function mulligan(p,rng,stats,idx,frames,players,record){const out=p.hand.filter(x=>+x.card.cost>p.strategy.mulliganMaxCost&&!/maximum play points|draw/i.test(norm(x.card.text)));if(!out.length)return;const ids=new Set(out.map(x=>x.uid));p.hand=p.hand.filter(x=>!ids.has(x.uid));const rep=[];while(rep.length<out.length&&p.deck.length)rep.push(p.deck.shift());p.hand.push(...rep);p.deck.push(...out);shuffle(p.deck,rng);snap(frames,players,{round:0,active:idx,phase:"mulligan",action:`${p.name} redraws ${out.length} opening card${out.length===1?"":"s"}.`},stats,record);}
function drawCards(p,n,stats,idx){let d=0;for(let i=0;i<n;i++){if(!p.deck.length){p.deckOut=true;break;}const x=p.deck.shift();stats.draws[idx]++;d++;if(p.hand.length>=9){toCemetery(p,x);stats.cardsBurned[idx]++;}else p.hand.push(x);}return d;}
function useBonusPpIfUseful(p){if(!p.bonusPpAvailable)return;if(getModesForHand(p).length)return;p.pp+=1;if(!getModesForHand(p).length){p.pp-=1;return;}p.bonusPpAvailable=false;p.bonusPpUses+=1;}

function getModesForHand(p){const out=[];for(const inst of p.hand)for(const mode of modes(inst,p))out.push({instance:inst,mode});return out;}
function modes(inst,p){const c=inst.card,text=String(c.text??""),base=costOf(inst),out=[];const enh=[...text.matchAll(/Enhance\s*\(?\s*(\d+)\s*\)?\s*:/gi)].map(m=>+m[1]).filter(n=>n<=p.pp).sort((a,b)=>b-a);if(enh.length){const n=enh[0];for(const m of expandModes(section(text,`enhance ${n}`)))out.push({kind:m.i?"mode":"enhance",cost:n,text:m.text,modeIndex:m.i,scoreBonus:5});return out;}if(base<=p.pp&&(c.type==="Spell"||p.board.length<5)){for(const m of expandModes(baseText(text)))out.push({kind:m.i?"mode":"base",cost:base,text:m.text,modeIndex:m.i,scoreBonus:0});}const acc=[...text.matchAll(/Accelerate\s*\(?\s*(\d+)\s*\)?\s*:/gi)].map(m=>+m[1]).filter(n=>n<=p.pp).sort((a,b)=>a-b)[0];if(acc!=null)for(const m of expandModes(section(text,`accelerate ${acc}`)))out.push({kind:"accelerate",cost:acc,text:m.text,modeIndex:m.i,scoreBonus:base>p.pp?4:-1});return out;}
function costOf(inst){let c=(+inst.card.cost||0)+(+inst.costDelta||0);const t=norm(inst.card.text);const red=+(t.match(/(?:on )?spellboost\s*:\s*(?:subtract|reduce)(?: the cost of this card by)?\s*(\d+)/i)?.[1]??0);if(red)c-=red*(+inst.spellboost||0);else if(/(?:on )?spellboost\s*:\s*subtract 1 from this card'?s cost/.test(t))c-=+inst.spellboost||0;return Math.max(0,c);}
function expandModes(text){const choices=[...String(text).matchAll(/(?:^|\s)(\d+)\.\s*/g)];if(!/select a mode/i.test(text)||!choices.length)return[{i:0,text}];return choices.map((m,j)=>({i:+m[1],text:String(text).slice(m.index+m[0].length,choices[j+1]?.index??String(text).length).split(/\b(?:Evolve|Super-Evolve|Last Words|Strike|Engage)\s*:/i)[0].trim()}));}
function baseText(text){const f=section(text,"fanfare");if(f)return f;const i=String(text).search(/\b(?:Last Words|Strike|Clash|Evolve|Super-Evolve|Enhance|Accelerate|Engage|On Spellboost|At the start of your turn|At the end of your turn)\s*\(?\s*\d*\s*\)?\s*:/i);return i<0?String(text):String(text).slice(0,i).trim();}
function section(text,label){const s=String(text),target=norm(label).replace(/[()]/g,"");const re=/(Last Words|On Spellboost|Super-Evolve|Evolve|Strike|Clash|Fanfare|At the start of your turn|At the end of your turn|Enhance\s*\(?\s*\d+\s*\)?|Accelerate\s*\(?\s*\d+\s*\)?|Engage\s*\(?\s*\d*\s*\)?)\s*:/gi;const a=[];let m;while((m=re.exec(s)))a.push({label:norm(m[1]).replace(/[()]/g,""),start:m.index,end:re.lastIndex});const hit=a.find(x=>x.label===target);if(!hit)return"";const next=a.find(x=>x.start>hit.start);return s.slice(hit.end,next?.start??s.length).trim();}
function bestPlay(p,o){return getModesForHand(p).map(x=>({...x,score:scorePlay(x,p,o)})).sort((a,b)=>b.score-a.score||b.mode.cost-a.mode.cost)[0]??null;}
function scorePlay(x,p,o){const c=x.instance.card,t=norm(x.mode.text||c.text),cost=x.mode.cost,style=p.strategy.style;let s=cost*1.7+x.mode.scoreBonus;if(c.type==="Follower"&&x.mode.kind!=="accelerate")s+=2;if(/draw/.test(t))s+=p.hand.length<=5?4:1;if(/destroy|banish|damage to .*enemy follower/.test(t))s+=o.board.some(u=>u.type==="Follower")?6:-2;if(/enemy leader/.test(t)||has(c,"Storm"))s+=o.hp<=12?7:2;if(/restore .*leader/.test(t))s+=p.hp<=13?7:-1;if(/maximum play points/.test(t))s+=style==="ramp"&&p.maxPp<7?12:1;if(style==="aggro"&&cost<=3)s+=3;if(style==="spell-combo"&&(c.type==="Spell"||x.mode.kind==="accelerate"))s+=5;if(/select a mode/i.test(c.text))s+=2;return s;}

function playCard(inst,mode,p,o,pi,oi,stats,rng,cardMap){p.hand=p.hand.filter(x=>x.uid!==inst.uid);p.pp-=mode.cost;p.cardsPlayedThisTurn++;stats.cardsPlayed[pi]++;stats.ppSpent[pi]+=mode.cost;const c=inst.card,actions=[];let source=null;if(mode.kind!=="accelerate"){if(c.type==="Follower"){source=boardFollower(inst);p.board.push(source);p.rally++;}else if(c.type==="Amulet"){source=boardAmulet(inst);p.board.push(source);if((c.traits??[]).includes("Earth Sigil"))p.earthSigils++;}}
  const result=resolveText(mode.text||c.text,{card:c,instance:inst,sourceUnit:source,player:p,opponent:o,playerIndex:pi,enemyIndex:oi,stats,rng,cardMap});actions.push(...result.actions);
  if(c.type==="Spell"||mode.kind==="accelerate"){stats.spellsPlayed[pi]++;p.spellsPlayedThisTurn++;toCemetery(p,inst);spellboostHand(p,1,cardMap,actions);}
  actions.push(...cleanup(p,o,pi,oi,stats,rng,cardMap),...cleanup(o,p,oi,pi,stats,rng,cardMap));return{actions};}
function boardFollower(inst){const c=inst.card,a=(+c.attack||0)+(+inst.attackBonus||0),d=(+c.defense||0)+(+inst.defenseBonus||0),ks=[...(c.keywords??[])];return{uid:inst.uid,cardId:+c.id,card:c,name:c.name,image:c.image,type:"Follower",attack:a,defense:d,maxDefense:d,keywords:ks,barrier:has(c,"Barrier")?1:0,ambush:has(c,"Ambush"),aura:has(c,"Aura"),intimidate:has(c,"Intimidate"),summonedThisTurn:true,canAttackLeader:has(c,"Storm"),canAttackFollower:has(c,"Storm")||has(c,"Rush"),attacked:false,attacksMade:0,maxAttacks:+(String(c.text??"").match(/can attack (\d+) times per turn/i)?.[1]??1),evolved:false,superEvolved:false,reactedThisTurn:false};}
function boardAmulet(inst){const c=inst.card;return{uid:inst.uid,cardId:+c.id,card:c,name:c.name,image:c.image,type:"Amulet",attack:0,defense:0,maxDefense:0,countdown:getCountdown(c),keywords:[...(c.keywords??[])],engagedThisTurn:false,summonedThisTurn:true,attacked:true,evolved:false,superEvolved:false};}

function resolveText(raw,ctx){let text=String(raw??"").trim(),actions=[];if(!text)return{actions,applied:false,unresolved:false};
  const nec=text.match(/Necromancy\s*\(?\s*(\d+)\s*\)?\s*:\s*(.*)$/i);if(nec){if(ctx.player.shadows<+nec[1])return{actions:[`Necromancy ${nec[1]} unavailable`],applied:false,unresolved:false};ctx.player.shadows-=+nec[1];actions.push(`Necromancy ${nec[1]}`);text=nec[2];}
  const rally=text.match(/Rally\s*\(?\s*(\d+)\s*\)?\s*:\s*(.*)$/i);if(rally){if(ctx.player.rally<+rally[1])return{actions:[`Rally ${ctx.player.rally}/${rally[1]}`],applied:false,unresolved:false};actions.push(`Rally ${rally[1]}`);text=rally[2];}
  const combo=text.match(/Combo\s*\(?\s*(\d+)\s*\)?\s*:\s*(.*)$/i);if(combo){if(ctx.player.cardsPlayedThisTurn<+combo[1])return{actions:[`Combo ${ctx.player.cardsPlayedThisTurn}/${combo[1]}`],applied:false,unresolved:false};text=combo[2];}
  const sb=text.match(/Super Skybound Art\s*\(?\s*(\d+)?\s*\)?\s*:\s*(.*)$/i);if(sb){const need=+(sb[1]??15);if(ctx.player.personalTurn+ctx.player.evolutionsThisMatch<need)return{actions:[],applied:false,unresolved:false};text=sb[2];actions.push("Super Skybound Art");}
  const sba=text.match(/Skybound Art\s*\(?\s*(\d+)?\s*\)?\s*:\s*(.*)$/i);if(sba&&!/Super Skybound Art/i.test(text)){const need=+(sba[1]??10);if(ctx.player.personalTurn+ctx.player.evolutionsThisMatch<need)return{actions:[],applied:false,unresolved:false};text=sba[2];actions.push("Skybound Art");}
  if(/if overflow is active/i.test(text)&&ctx.player.maxPp<7)text=text.replace(/if overflow is active[^.]*\.?/ig,"");else if(/if overflow is active/i.test(text))text=text.replace(/if overflow is active[, ]*/ig,"");
  if(/Earth Rite\s*\(?\s*(\d+)?\s*\)?\s*:/i.test(text)){const n=+(text.match(/Earth Rite\s*\(?\s*(\d+)?/i)?.[1]??1);if(ctx.player.earthSigils<n)return{actions:[`Earth Rite ${ctx.player.earthSigils}/${n}`],applied:false,unresolved:false};ctx.player.earthSigils-=n;text=text.replace(/Earth Rite\s*\(?\s*\d*\s*\)?\s*:/i,"");actions.push(`Earth Rite ${n}`);}
  const x=ctx.instance?.x??0;text=text.replace(/if X is at least\s*(\d+)\s*,\s*([^.]*)\.?/gi,(_,n,e)=>x>=+n?`${e}.`:"");
  const doN=text.match(/Do this (\d+) times?\s*:\s*["“](.*?)["”]/i);if(doN){for(let i=0;i<+doN[1];i++){const r=resolveText(doN[2],ctx);actions.push(...r.actions);}text=text.replace(doN[0],"");}
  for(const m of [...text.matchAll(/Spellboost your hand(?:\s+(\d+|one|two|three|four|five)\s+times?)?/gi)]){const n=word(m[1]??"one")||1;spellboostHand(ctx.player,n,ctx.cardMap,actions);text=text.replace(m[0],"");actions.push(`Spellboost ×${n}`);}
  for(const m of [...text.matchAll(/Reanimate\s*\(?\s*(\d+)\s*\)?/gi)]){const u=reanimate(ctx.player,+m[1],ctx.playerIndex,ctx.cardMap,ctx.rng);if(u)actions.push(`Reanimate ${u.name}`);text=text.replace(m[0],"");}
  if(/return your hand to (?:the )?deck/i.test(text)){const n=ctx.player.hand.length;ctx.player.deck.push(...ctx.player.hand);ctx.player.hand=[];shuffle(ctx.player.deck,ctx.rng);actions.push(`return ${n} hand cards to deck`);text=text.replace(/return your hand to (?:the )?deck\.?/i,"");}
  if(/recover all (?:of )?your play points/i.test(text)){ctx.player.pp=ctx.player.maxPp;actions.push("recover all PP");text=text.replace(/recover all (?:of )?your play points\.?/i,"");}
  const crest=text.match(/Gain Crest\s*:\s*([^.;]+)/i);if(crest){gainCrest(ctx.player,crest[1].trim(),ctx.card);actions.push(`Crest: ${crest[1].trim()}`);text=text.replace(crest[0],"");}
  const grant=text.match(/Give (?:this follower|it) (Ward|Rush|Storm|Bane|Drain|Barrier|Aura|Ambush|Intimidate)/i);if(grant&&ctx.sourceUnit){giveKeyword(ctx.sourceUnit,grant[1]);actions.push(grant[1]);text=text.replace(grant[0],"");}
  for(const m of [...text.matchAll(/deal (\d+) damage to (a random|random|an|a|the) enemy follower/gi)]){const random=/random/i.test(m[2]);const target=chooseTarget(ctx.opponent.board,!random);if(target){damageUnit(target,+m[1],ctx.opponent,ctx.player,ctx,actions);actions.push(`${m[1]} to ${target.name}`);}text=text.replace(m[0],"");}
  for(const m of [...text.matchAll(/deal (\d+) damage to (?:all|each) enemy followers?/gi)]){for(const u of ctx.opponent.board.filter(u=>u.type==="Follower"))damageUnit(u,+m[1],ctx.opponent,ctx.player,ctx,actions);actions.push(`${m[1]} to enemy board`);text=text.replace(m[0],"");}
  if(/destroy (?:an|a|the) enemy follower/i.test(text)){const u=chooseTarget(ctx.opponent.board,true);if(u&&destroyUnit(ctx.opponent,u)){actions.push(`destroy ${u.name}`);}text=text.replace(/destroy (?:an|a|the) enemy follower\.?/i,"");}
  if(/destroy (?:a random|random) enemy follower/i.test(text)){const u=chooseTarget(ctx.opponent.board,false);if(u&&destroyUnit(ctx.opponent,u))actions.push(`destroy ${u.name}`);text=text.replace(/destroy (?:a random|random) enemy follower\.?/i,"");}
  if(/banish (?:an|a|the) enemy follower/i.test(text)){const u=chooseTarget(ctx.opponent.board,true);if(u){banish(ctx.opponent,u);actions.push(`banish ${u.name}`);}text=text.replace(/banish (?:an|a|the) enemy follower\.?/i,"");}
  if(/return (?:an|a|the) enemy follower to (?:its owner'?s|their) hand/i.test(text)){const u=chooseTarget(ctx.opponent.board,true);if(u){bounce(ctx.opponent,u);actions.push(`return ${u.name}`);}text=text.replace(/return (?:an|a|the) enemy follower to (?:its owner'?s|their) hand\.?/i,"");}
  const xd=text.match(/deal X damage to (?:an|a|the) enemy follower/i);if(xd){const target=chooseTarget(ctx.opponent.board,true);if(target){damageUnit(target,x,ctx.opponent,ctx.player,ctx,actions);actions.push(`${x} to ${target.name}`);}text=text.replace(xd[0],"");}
  const xa=text.match(/deal X damage to all enemy followers/i);if(xa){for(const u of ctx.opponent.board.filter(u=>u.type==="Follower"))damageUnit(u,x,ctx.opponent,ctx.player,ctx,actions);actions.push(`${x} to enemy board`);text=text.replace(xa[0],"");}
  const split=text.match(/deal X damage split between all enemy followers/i);if(split){let left=x;const targets=[...ctx.opponent.board.filter(u=>u.type==="Follower")];while(left>0&&targets.length){const u=targets[Math.floor(ctx.rng()*targets.length)];damageUnit(u,1,ctx.opponent,ctx.player,ctx,actions);left--;}actions.push(`${x} split damage`);text=text.replace(split[0],"");}
  const context=effectContext(ctx);const core=executeGenericEffects(text,context);actions.push(...core.actions);return{applied:actions.length>0||core.applied,actions:uniq(actions),unresolved:core.unresolved};}

function effectContext(ctx){return{card:ctx.card,sourceUnit:ctx.sourceUnit,player:ctx.player,opponent:ctx.opponent,playerIndex:ctx.playerIndex,enemyIndex:ctx.enemyIndex,stats:ctx.stats,rng:ctx.rng,draw:(p,n,i)=>drawCards(p,n,ctx.stats,i),chooseEnemyFollower:board=>chooseTarget(board,true),chooseAlliedFollower:(board,ex)=>board.filter(u=>u.type==="Follower"&&u!==ex).sort((a,b)=>b.attack+b.defense-a.attack-a.defense)[0]??ex,chooseHandFollower:hand=>hand.filter(x=>x.card.type==="Follower").sort((a,b)=>+b.card.cost-+a.card.cost)[0]??null,buffUnit:(u,a,d)=>{u.attack+=+a||0;u.defense+=+d||0;u.maxDefense+=+d||0;},buffHand:(x,a,d)=>{x.attackBonus=(+x.attackBonus||0)+(+a||0);x.defenseBonus=(+x.defenseBonus||0)+(+d||0);},relatedCards:c=>related(c,ctx.cardMap),summon:(p,c,n,i)=>summon(p,c,n,i,ctx.stats),addToHand:(p,c,n,i)=>addHand(p,c,n,i,ctx.stats),cleanup:p=>p===ctx.player?cleanup(ctx.player,ctx.opponent,ctx.playerIndex,ctx.enemyIndex,ctx.stats,ctx.rng,ctx.cardMap):cleanup(ctx.opponent,ctx.player,ctx.enemyIndex,ctx.playerIndex,ctx.stats,ctx.rng,ctx.cardMap),banish:(p,u)=>banish(p,u),returnToHand:(p,u)=>bounce(p,u)};}

function spellboostHand(p,n,cardMap,actions=[]){for(let k=0;k<n;k++)for(const inst of p.hand){inst.spellboost=(+inst.spellboost||0)+1;const t=section(inst.card.text,"on spellboost");if(!t)continue;const red=+(t.match(/(?:subtract|reduce).*?(\d+)\s*(?:from|cost)/i)?.[1]??(/subtract 1 from this card'?s cost/i.test(t)?1:0));if(red)inst.costDelta=(+inst.costDelta||0)-red;const xi=+(t.match(/Increase X by\s*(\d+)/i)?.[1]??0);if(xi)inst.x=(+inst.x||0)+xi;const stat=t.match(/give this follower\s*\+(\d+)\s*\/\s*\+(\d+)/i);if(stat){inst.attackBonus=(+inst.attackBonus||0)+ +stat[1];inst.defenseBonus=(+inst.defenseBonus||0)+ +stat[2];}const threshold=+(t.match(/if X is at least\s*(\d+)/i)?.[1]??Infinity);if(inst.x>=threshold&&/transform this card into/i.test(t)){const name=t.match(/transform this card into (?:an?\s+)?(.+?)(?:\.|$)/i)?.[1]?.trim();const target=name?findByName(cardMap,name):null;if(target)inst.card=target;}}}
function reanimate(p,cost,idx,cardMap,rng){const pool=p.destroyedFollowers.filter(x=>(+x.card.cost||0)<=cost);if(!pool.length||p.board.length>=5)return null;const max=Math.max(...pool.map(x=>+x.card.cost||0)),eligible=pool.filter(x=>(+x.card.cost||0)===max),src=eligible[Math.floor(rng()*eligible.length)],inst=instance(p,src.card),u=boardFollower(inst);u.keywords=uniq([...u.keywords,"Departed"]);p.board.push(u);p.rally++;return u;}
function related(card,map){const ids=new Set([...(card?.relatedCards??[]).map(Number),...(card?.relations??[]).map(r=>Number(r.id))]);return[...ids].map(id=>map.get(id)).filter(Boolean);}
function findByName(map,name){const n=norm(name);return[...map.values()].find(c=>norm(c.name)===n)??null;}
function summon(p,c,n,idx,stats){const out=[];for(let i=0;i<n&&p.board.length<5;i++){const inst=instance(p,c);if(c.type==="Follower"){const u=boardFollower(inst);p.board.push(u);p.rally++;out.push(u);}else if(c.type==="Amulet"){const u=boardAmulet(inst);p.board.push(u);out.push(u);}else break;}return out.length;}
function addHand(p,c,n,idx,stats){let k=0;for(let i=0;i<n;i++){const x=instance(p,c);if(p.hand.length>=9){toCemetery(p,x);stats.cardsBurned[idx]++;}else{p.hand.push(x);k++;}}return k;}
function gainCrest(p,name,card){if(p.crests.some(c=>norm(c.name)===norm(name)))return false;if(p.crests.length>=5)return false;p.crests.push({name,card});return true;}
function giveKeyword(u,k){if(!u.keywords.includes(k))u.keywords.push(k);if(k==="Barrier")u.barrier=1;if(k==="Aura")u.aura=true;if(k==="Ambush")u.ambush=true;if(k==="Intimidate")u.intimidate=true;if(k==="Storm"){u.canAttackLeader=true;u.canAttackFollower=true;}if(k==="Rush")u.canAttackFollower=true;}

function turnStart(p,o,pi,oi,stats,rng,map){const a=[];for(const u of p.board)if(u.type==="Follower")u.reactedThisTurn=false;for(const am of [...p.board].filter(u=>u.type==="Amulet"&&Number.isFinite(u.countdown))){am.countdown--;a.push(`${am.name} countdown ${Math.max(0,am.countdown)}`);if(am.countdown<=0)a.push(...destroyObject(p,o,am,pi,oi,stats,rng,map,true));}invokeCards(p,o,pi,oi,stats,rng,map,a);for(const u of [...p.board]){const t=getTriggeredText(u.card,"turnStart");if(t){const r=resolveText(t,{card:u.card,sourceUnit:u,player:p,opponent:o,playerIndex:pi,enemyIndex:oi,stats,rng,cardMap:map});a.push(...r.actions.map(x=>`${u.name}: ${x}`));}}a.push(...cleanup(p,o,pi,oi,stats,rng,map),...cleanup(o,p,oi,pi,stats,rng,map));return a;}
function turnEnd(p,o,pi,oi,stats,rng,map){const a=[];for(const u of [...p.board]){const t=getTriggeredText(u.card,"turnEnd");if(t){const r=resolveText(t,{card:u.card,sourceUnit:u,player:p,opponent:o,playerIndex:pi,enemyIndex:oi,stats,rng,cardMap:map});a.push(...r.actions.map(x=>`${u.name}: ${x}`));}}a.push(...cleanup(p,o,pi,oi,stats,rng,map),...cleanup(o,p,oi,pi,stats,rng,map));return a;}
function invokeCards(p,o,pi,oi,stats,rng,map,actions){for(const inst of [...p.deck]){const t=String(inst.card.text??"");if(!/Invoke this card/i.test(t))continue;const need=+(t.match(/evolved at least\s*(\d+) times this match/i)?.[1]??Infinity);if(p.evolutionsThisMatch<need||p.board.length>=5)continue;p.deck=p.deck.filter(x=>x.uid!==inst.uid);const u=boardFollower(inst);p.board.push(u);p.rally++;actions.push(`Invoke ${u.name}`);const after=t.match(/When this card is Invoked[, :]\s*([^]*?)(?:\n\n|Fanfare:|$)/i)?.[1]??"";if(after){const r=resolveText(after,{card:u.card,instance:inst,sourceUnit:u,player:p,opponent:o,playerIndex:pi,enemyIndex:oi,stats,rng,cardMap:map});actions.push(...r.actions);}if(/return this card to your hand/i.test(after)){p.board=p.board.filter(x=>x.uid!==u.uid);if(p.hand.length<9)p.hand.push(inst);}break;}}
function readyBoard(p){for(const u of p.board){if(u.type==="Follower"){u.summonedThisTurn=false;u.canAttackLeader=true;u.canAttackFollower=true;u.attacked=false;u.attacksMade=0;}else if(u.type==="Amulet")u.engagedThisTurn=false;}}

function engageInfo(u){const m=String(u.card.text??"").match(/Engage\s*\(?\s*(\d+)?\s*\)?\s*:/i);return m?{cost:+(m[1]??0),text:section(u.card.text,`engage${m[1]?` ${m[1]}`:""}`)}:null;}
function bestEngage(p,o){return p.board.filter(u=>u.type==="Amulet"&&!u.engagedThisTurn).map(u=>({unit:u,...engageInfo(u)})).filter(x=>x.text!=null&&x.cost<=p.pp).map(x=>({...x,score:/draw|destroy|damage|restore|summon/i.test(x.text)?5:2})).sort((a,b)=>b.score-a.score)[0]??null;}
function resolveEngage(u,p,o,pi,oi,stats,rng,map){const e=engageInfo(u);if(!e)return{actions:[]};p.pp-=e.cost;stats.ppSpent[pi]+=e.cost;u.engagedThisTurn=true;return resolveText(e.text,{card:u.card,sourceUnit:u,player:p,opponent:o,playerIndex:pi,enemyIndex:oi,stats,rng,cardMap:map});}

function maybeEvolve(p,o,pi,oi,stats,rng,map){if(p.evolutionActionUsed)return null;const normalTurn=p.goingFirst?5:4,superTurn=p.goingFirst?7:6;const candidates=p.board.filter(u=>u.type==="Follower"&&!u.evolved&&!u.superEvolved&&!u.attacked);if(!candidates.length)return null;const wants=o.board.some(u=>u.type==="Follower")||p.strategy.faceBias>.7||o.hp<=10;if(!wants)return null;const useSuper=p.personalTurn>=superTurn&&p.sep>0&&(o.board.length>=2||o.hp<=8);const useNormal=p.personalTurn>=normalTurn&&p.ep>0;if(!useSuper&&!useNormal)return null;const superMode=useSuper;const u=[...candidates].sort((a,b)=>b.attack+b.defense-a.attack-a.defense)[0],bonus=superMode?3:2;p[superMode?"sep":"ep"]--;p.evolutionActionUsed=true;u.attack+=bonus;u.defense+=bonus;u.maxDefense+=bonus;u.canAttackFollower=true;u.evolved=true;u.superEvolved=superMode;p.evolutionsThisMatch++;if(superMode)stats.superEvolutions[pi]++;else stats.evolutions[pi]++;const acts=[];const ev=getTriggeredText(u.card,"evolve");if(ev)acts.push(...resolveText(ev,{card:u.card,sourceUnit:u,player:p,opponent:o,playerIndex:pi,enemyIndex:oi,stats,rng,cardMap:map}).actions);if(superMode){const se=getTriggeredText(u.card,"superEvolve");if(se)acts.push(...resolveText(se,{card:u.card,sourceUnit:u,player:p,opponent:o,playerIndex:pi,enemyIndex:oi,stats,rng,cardMap:map}).actions);}acts.push(...cleanup(o,p,oi,pi,stats,rng,map));return{super:superMode,action:compact(`${p.name} ${superMode?"super-evolves":"evolves"} ${u.name}.`,acts)};}

function attackPhase(p,o,pi,oi,stats,frames,players,round,rng,map,record){for(const atk of [...p.board].filter(u=>u.type==="Follower")){while(p.board.includes(atk)&&atk.attacksMade<atk.maxAttacks){const wards=attackable(o.board).filter(u=>hasU(u,"Ward"));const foes=attackable(o.board);const canF=atk.canAttackFollower,canL=atk.canAttackLeader&&!wards.length;let target=null,leader=false;if(wards.length&&canF)target=tradeTarget(atk,wards,p.strategy);else if(canL&&shouldFace(atk,p,o,foes,rng))leader=true;else if(canF&&foes.length)target=tradeTarget(atk,foes,p.strategy);else if(canL)leader=true;else break;atk.attacksMade++;atk.attacked=atk.attacksMade>=atk.maxAttacks;stats.attacks[pi]++;if(atk.ambush){atk.ambush=false;atk.keywords=atk.keywords.filter(k=>k!=="Ambush");}const acts=[];if(leader){const d=Math.max(0,atk.attack);o.hp-=d;stats.damageDealt[pi]+=d;if(hasU(atk,"Drain"))heal(p,d,stats,pi,acts);acts.push(...strike(atk,p,o,pi,oi,stats,rng,map));snap(frames,players,{round,active:pi,phase:"attack",action:compact(`${atk.name} attacks ${o.name}'s leader for ${d}.`,acts)},stats,record);if(o.hp<=0)return;continue;}
        if(target){const clashA=getTriggeredText(atk.card,"clash"),clashT=getTriggeredText(target.card,"clash");if(clashA)acts.push(...resolveText(clashA,{card:atk.card,sourceUnit:atk,player:p,opponent:o,playerIndex:pi,enemyIndex:oi,stats,rng,cardMap:map}).actions);if(clashT)acts.push(...resolveText(clashT,{card:target.card,sourceUnit:target,player:o,opponent:p,playerIndex:oi,enemyIndex:pi,stats,rng,cardMap:map}).actions);acts.push(...cleanup(p,o,pi,oi,stats,rng,map),...cleanup(o,p,oi,pi,stats,rng,map));if(!p.board.includes(atk)||!o.board.includes(target)){snap(frames,players,{round,active:pi,phase:"attack",action:compact(`${atk.name} clashes with ${target.name}.`,acts)},stats,record);break;}
          const out=Math.max(0,atk.attack),inc=Math.max(0,target.attack);damageUnit(target,out,o,p,{player:p,opponent:o,playerIndex:pi,enemyIndex:oi,stats,rng,cardMap:map},acts);damageUnit(atk,inc,p,o,{player:p,opponent:o,playerIndex:pi,enemyIndex:oi,stats,rng,cardMap:map},acts);if(hasU(atk,"Bane"))target.defense=0;if(hasU(target,"Bane"))atk.defense=0;if(hasU(atk,"Drain"))heal(p,out,stats,pi,acts);const targetDied=target.defense<=0; if(atk.superEvolved&&targetDied){o.hp-=1;stats.damageDealt[pi]+=1;acts.push("Super-Evolution deals 1 leader damage");if(o.hp<=0){snap(frames,players,{round,active:pi,phase:"attack",action:compact(`${atk.name} destroys ${target.name}.`,acts)},stats,record);return;}}
          acts.push(...cleanup(o,p,oi,pi,stats,rng,map),...cleanup(p,o,pi,oi,stats,rng,map));if(p.board.includes(atk))acts.push(...strike(atk,p,o,pi,oi,stats,rng,map));snap(frames,players,{round,active:pi,phase:"attack",action:compact(`${atk.name} attacks ${target.name}.`,acts)},stats,record);if(o.hp<=0)return;continue;}break;}}}
function attackable(board){return board.filter(u=>u.type==="Follower"&&!u.intimidate&&!u.ambush);}
function damageUnit(u,n,owner,sourceOwner,ctx,actions){let amount=Math.max(0,+n||0);const event=amount>0;if(u.superEvolved&&owner.isActive){amount=0;actions.push(`${u.name} Invincible`);}else if(u.barrier>0&&amount>0){u.barrier--;amount=0;actions.push(`${u.name} Barrier`);}u.defense-=amount;if(event&&u.defense>0)reactDamage(u,owner,sourceOwner,ctx,actions);return amount;}
function reactDamage(u,owner,opponent,ctx,actions){if(u.reactedThisTurn)return;const m=String(u.card.text??"").match(/once on each of your turns, when this follower takes damage but isn'?t destroyed,\s*([^.]*)/i);if(!m||!owner.isActive)return;u.reactedThisTurn=true;const r=resolveText(m[1],{card:u.card,sourceUnit:u,player:owner,opponent,playerIndex:owner===ctx.player?ctx.playerIndex:ctx.enemyIndex,enemyIndex:owner===ctx.player?ctx.enemyIndex:ctx.playerIndex,stats:ctx.stats,rng:ctx.rng,cardMap:ctx.cardMap});actions.push(...r.actions);}
function chooseTarget(board,targeted){return board.filter(u=>u.type==="Follower"&&(!targeted||(!u.aura&&!u.ambush))).sort((a,b)=>b.attack+b.defense-a.attack-a.defense)[0]??null;}
function tradeTarget(a,t,s){return[...t].sort((x,y)=>{const kx=a.attack>=x.defense?1:0,ky=a.attack>=y.defense?1:0;if(kx!==ky)return ky-kx;return s.tradeBias>=.65?(y.attack+y.defense)-(x.attack+x.defense):x.defense-y.defense;})[0]??null;}
function shouldFace(a,p,o,foes,rng){if(a.attack>=o.hp||p.strategy.style==="aggro"||!foes.length)return true;return p.strategy.faceBias>=.65||rng()<p.strategy.faceBias;}
function strike(a,p,o,pi,oi,stats,rng,map){const t=getTriggeredText(a.card,"strike");if(!t)return[];stats.strikeTriggered[pi]++;const r=resolveText(t,{card:a.card,sourceUnit:a,player:p,opponent:o,playerIndex:pi,enemyIndex:oi,stats,rng,cardMap:map});return["Strike",...r.actions,...cleanup(o,p,oi,pi,stats,rng,map)];}
function heal(p,n,stats,i,a){const h=Math.max(0,Math.min(n,p.maxHp-p.hp));p.hp+=h;stats.healing[i]+=h;if(h)a.push(`Drain heals ${h}`);}

function cleanup(p,o,pi,oi,stats,rng,map){const a=[];let guard=0;while(guard++<12){const dead=p.board.filter(u=>u.type==="Follower"&&u.defense<=0);if(!dead.length)break;for(const u of dead){p.board=p.board.filter(x=>x.uid!==u.uid);toCemetery(p,{uid:u.uid,card:u.card});p.destroyedFollowers.push({card:u.card});stats.followersLost[pi]++;const lw=getTriggeredText(u.card,"lastWords");if(lw){stats.lastWordsTriggered[pi]++;const r=resolveText(lw,{card:u.card,sourceUnit:u,player:p,opponent:o,playerIndex:pi,enemyIndex:oi,stats,rng,cardMap:map});a.push(`${u.name} Last Words${r.actions.length?`: ${r.actions.join(" · ")}`:""}`);}}}return a;}
function destroyObject(p,o,u,pi,oi,stats,rng,map,last){p.board=p.board.filter(x=>x.uid!==u.uid);toCemetery(p,{uid:u.uid,card:u.card});if(u.type==="Follower")p.destroyedFollowers.push({card:u.card});if(!last)return[];const lw=getTriggeredText(u.card,"lastWords");if(!lw)return[];stats.lastWordsTriggered[pi]++;const r=resolveText(lw,{card:u.card,sourceUnit:u,player:p,opponent:o,playerIndex:pi,enemyIndex:oi,stats,rng,cardMap:map});return[`${u.name} Last Words`,...r.actions];}
function toCemetery(p,x){p.cemetery.push(x);p.shadows++;}
function destroyUnit(p,u){if(u.superEvolved&&p.isActive)return false;u.defense=0;return true;}
function banish(p,u){if(u.superEvolved&&p.isActive)return false;p.board=p.board.filter(x=>x.uid!==u.uid);p.banished.push({uid:u.uid,card:u.card});return true;}
function bounce(p,u){p.board=p.board.filter(x=>x.uid!==u.uid);const x=instance(p,u.card);if(p.hand.length>=9){toCemetery(p,x);return false;}p.hand.push(x);return true;}

function snap(frames,players,meta,stats,record){if(!record)return;frames.push({index:frames.length,round:meta.round,active:meta.active,phase:meta.phase,action:meta.action,players:players.map(p=>({name:p.name,hp:p.hp,maxHp:p.maxHp,pp:p.pp,maxPp:p.maxPp,ep:p.ep,sep:p.sep,shadows:p.shadows,rally:p.rally,bonusPpAvailable:p.bonusPpAvailable,personalTurn:p.personalTurn,deckCount:p.deck.length,cemeteryCount:p.cemetery.length,hand:p.hand.map(cardView),board:p.board.map(unitView),crests:p.crests.map(c=>c.name)})),stats:cloneStats(stats)});}
function cardView(x){const c=x.card;return{id:+c.id,name:c.name,image:c.image,type:c.type,cost:costOf(x),attack:(+c.attack||0)+(+x.attackBonus||0),defense:(+c.defense||0)+(+x.defenseBonus||0),spellboost:+x.spellboost||0,x:+x.x||0,keywords:[...(c.keywords??[])]};}
function unitView(u){const{card,...v}=u;return{...v,keywords:[...(u.keywords??[])]};}
function cloneStats(s){return Object.fromEntries(Object.entries(s).map(([k,v])=>[k,Array.isArray(v)?[...v]:v]));}
function compact(base,a){const d=(a??[]).map(String).filter(Boolean);return d.length?`${base} · ${d.slice(0,6).join(" · ")}${d.length>6?" · …":""}`:base;}
function prepareCardMap(map){if(!map?.values)return;for(const c of map.values()){const names=[];for(const id of c.relatedCards??[]){const t=map.get(Number(id));if(t)names.push(t.name);}for(const r of c.relations??[]){const t=map.get(Number(r.id));if(t)names.push(t.name);}c.__relatedNames=uniq(names);}}
function has(c,k){return(c.keywords??[]).includes(k)||new RegExp(`\\b${k.replace("-","[- ]")}\\b`,`i`).test(String(c.text??""));}
function hasU(u,k){return(u.keywords??[]).includes(k)||(k==="Barrier"&&u.barrier>0)||(k==="Ambush"&&u.ambush)||(k==="Aura"&&u.aura)||(k==="Intimidate"&&u.intimidate);}
function norm(v){return String(v??"").toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g," ").trim();}
function uniq(a){return[...new Set(a.filter(Boolean).map(String))];}
function cap(v){const s=String(v??"");return s?s[0].toUpperCase()+s.slice(1):"";}
function word(v){const m={a:1,an:1,one:1,two:2,three:3,four:4,five:5};return/^\d+$/.test(String(v))?+v:(m[norm(v)]??0);}
function createRng(seedValue){let seed=2166136261;for(const ch of String(seedValue??"")){seed^=ch.charCodeAt(0);seed=Math.imul(seed,16777619);}seed>>>=0;return()=>{seed+=0x6D2B79F5;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function shuffle(a,r){for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
