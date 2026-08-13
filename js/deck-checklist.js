import { state } from './state.js';
import { calculateAdvancedStats } from './tools-common.js';

const SEARCH_KEY='svwb-pending-checklist-search';
const pendingSearch=sessionStorage.getItem(SEARCH_KEY);
if(pendingSearch){state.search=pendingSearch;sessionStorage.removeItem(SEARCH_KEY);}

let scheduled=false;
wait();

function wait(){
  if(!state.cardMap?.size)return setTimeout(wait,120);
  const root=document.getElementById('deck-analysis');
  if(!root)return;
  new MutationObserver(schedule).observe(root,{childList:true});
  schedule();
}

function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;render();});
}

function render(){
  const root=document.getElementById('deck-analysis');
  if(!root||root.querySelector('.smart-deck-checklist'))return;
  const s=calculateAdvancedStats(state.deck,state.cardMap);
  const data=[
    ['Early game',s.playableT2,8,5,'role:"Early Game"'],
    ['Draw',s.draw,4,2,'role:Draw'],
    ['Removal',s.removal,4,2,'role:Removal'],
    ['Finishers',s.finishers,2,1,'role:Finisher'],
    ['Ward',s.ward,3,1,'keyword:Ward'],
    ['Board clear',s.boardClear,1,1,'role:"Board Clear"']
  ];
  const section=document.createElement('section');
  section.className='analysis-section smart-deck-checklist';
  const title=document.createElement('h3');title.textContent='Deck checklist';
  const grid=document.createElement('div');grid.className='deck-checklist-grid';
  for(const [name,value,good,low,query] of data){
    const status=value>=good?'Good':value>=low?'Low':'Missing';
    const button=document.createElement('button');button.type='button';button.className='deck-check-item checklist-'+status.toLowerCase();
    const icon=document.createElement('span');icon.className='deck-check-status';icon.textContent=status==='Good'?'✓':status==='Low'?'⚠':'!';
    const copy=document.createElement('span');const strong=document.createElement('strong');strong.textContent=name;const small=document.createElement('small');small.textContent=value+' · '+status;copy.append(strong,small);button.append(icon,copy);
    button.title='Show matching cards';
    button.addEventListener('click',()=>{sessionStorage.setItem(SEARCH_KEY,query);location.reload();});
    grid.appendChild(button);
  }
  const help=document.createElement('div');help.className='deck-checklist-help';help.textContent='Click a role to show matching cards.';
  section.append(title,grid,help);root.appendChild(section);
}
