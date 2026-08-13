import { state } from './state.js';
import { calculateAdvancedStats } from './tools-common.js';

function render(){
  const root=document.getElementById('deck-analysis');
  if(!root||!state.cardMap?.size||root.querySelector('.smart-deck-checklist'))return;
  const s=calculateAdvancedStats(state.deck,state.cardMap);
  const section=document.createElement('section');
  section.className='analysis-section smart-deck-checklist';
  section.textContent=`Deck checklist · Early game ${s.playableT2} · Draw ${s.draw} · Removal ${s.removal} · Finishers ${s.finishers} · Ward ${s.ward} · Board clear ${s.boardClear}`;
  root.appendChild(section);
}
setInterval(render,500);
