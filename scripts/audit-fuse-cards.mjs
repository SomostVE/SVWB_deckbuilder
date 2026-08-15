import fs from 'node:fs';
import { analyzeCardSupport } from '../js/battle-engine-v5.js';
const cards = JSON.parse(fs.readFileSync('data/official/cards.json','utf8'));
const list = Array.isArray(cards) ? cards : (cards.cards ?? []);
const hits = list.filter(c => /\b(?:Fuse|Fusion)\b/i.test(String(c.text ?? '')) || (c.keywords ?? []).some(k => /^(?:Fuse|Fusion)$/i.test(String(k))));
console.log(`Fuse/Fusion cards: ${hits.length}`);
for (const c of hits) {
  console.log(JSON.stringify({id:c.id,name:c.name,class:c.class,type:c.type,cost:c.cost,keywords:c.keywords,traits:c.traits,text:c.text,relatedCards:c.relatedCards,support:analyzeCardSupport(c)}));
}
