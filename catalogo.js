/* ARCANA SCAN — Catálogo público real, sem obras de demonstração */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const img=(url,cls)=>{const im=document.createElement('img');im.src=url||'LOGO.png';im.alt='Capa da obra';im.loading='lazy';im.className=cls;return im};
function card(w){const a=document.createElement('a');a.className='arcana-live-card';a.href='obra.html?slug='+encodeURIComponent(w.slug);a.append(img(w.cover_url,'arcana-live-cover'));const title=document.createElement('strong');title.textContent=w.title;a.append(title);return a}
function fill(id,works){const track=$(id);if(!track)return;track.style.animation='none';track.replaceChildren();track.classList.add('arcana-live-track');if(!works.length){const p=document.createElement('p');p.className='arcana-live-empty';p.textContent='As histórias serão reveladas em breve.';track.append(p);return}for(const w of works)track.append(card(w))}
async function load(){try{const r=await fetch('/api/catalog/works',{cache:'no-store'});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Falha no catálogo');const works=d.works||[];
for(const id of ['archiveTrack','forgeTrack','popularTrack','relicsTrack','hostingTrack'])fill(id,works);
const cont=$('continueTrack');if(cont){cont.replaceChildren();if(works.length)for(const w of works.slice(0,8))cont.append(card(w));else cont.textContent='Seu próximo universo começa aqui.'}
const updates=$('updatesContainer');if(updates){updates.replaceChildren();const grid=document.createElement('div');grid.className='arcana-live-grid';for(const w of works.filter(x=>Number(x.chapter_count)>0).slice(0,24))grid.append(card(w));if(!grid.childElementCount){const p=document.createElement('p');p.className='arcana-live-empty';p.textContent='Nenhum capítulo publicado ainda.';updates.append(p)}else updates.append(grid)}
const pagination=$('updatesPagination');if(pagination)pagination.replaceChildren();
}catch(e){for(const id of ['archiveTrack','forgeTrack','popularTrack','relicsTrack','hostingTrack']){const el=$(id);if(el){el.style.animation='none';el.textContent='Não foi possível carregar o catálogo agora.'}}const up=$('updatesContainer');if(up)up.textContent='Atualizações indisponíveis temporariamente.';console.error('ARCANA catalog:',e.message)}}
load();
})();
