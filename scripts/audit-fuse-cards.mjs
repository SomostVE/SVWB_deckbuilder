import fs from 'node:fs';
import { analyzeCardSupport } from '../js/battle-engine-v5.js';
const cards = JSON.parse(fs.readFileSync('data/official/cards.json','utf8'));
const list = Array.isArray(cards) ? cards : (cards.cards ?? []);
const ids = new Set([90073120,90073130,90074110,90071210,90071220,90072110,90072120,90073110]);
const hits = list.filter(c => /\b(?:Fuse|Fusion)\b/i.test(String(c.text ?? '')) || (c.keywords ?? []).some(k => /^(?:Fuse|Fusion)$/i.test(String(k))) || ids.has(Number(c.id)));
console.log(`Fuse/Fusion + chain cards: ${hits.length}`);
for (const c of hits) {
  console.log(JSON.stringify({id:c.id,name:c.name,class:c.class,type:c.type,cost:c.cost,attack:c.attack,defense:c.defense,keywords:c.keywords,traits:c.traits,text:c.text,relatedCards:c.relatedCards,support:analyzeCardSupport(c)}));
}
