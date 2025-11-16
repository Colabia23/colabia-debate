// /public/js/debate-socket.js
const $ = s=>document.querySelector(s);
const lobby = $("#lobby");
const room = $("#room");
const hostName = $("#hostName");
const joinName = $("#joinName");
const topic = $("#topic");
const roomCode = $("#roomCode");
const createHint = $("#createHint");
const roomTopic = $("#roomTopic");
const roomIdEl = $("#roomId");
const hostLabel = $("#hostLabel");
const teamA = $("#teamA");
const teamB = $("#teamB");
const scoreA = $("#scoreA");
const scoreB = $("#scoreB");
const currentTurn = $("#currentTurn");
const timerEl = $("#timer");
const participantsEl = $("#participants");
const myCardsGrid = document.getElementById('myCards');
const chatLog = $("#chatLog");
const chatText = $("#chatText");
const configPanel = $("#configPanel");
const turnSeconds = $("#turnSeconds");

let ioSocket = null;
let activeCode = null;
let isHost = false;
let isJurado = false;

let myName = null;
let selectedCardIndex = -1;

async function getMe(){
  try{ const r = await fetch('/api/me',{credentials:'include'}); if(!r.ok) return null; return await r.json(); }catch{return null;}
}


function ensureAuth(){ return fetch('/api/me',{credentials:'include'}).then(r=>r.status===200); }

function renderRoom(r){
  if(!r) return;
  roomTopic.textContent = r.topic;
  roomIdEl.textContent = r.code;
  hostLabel.textContent = r.host?.name || '—';
  teamA.innerHTML = (r.players||[]).filter(p=>p.team==='A').map(p=>`<li>${p.name}${p.role==='jurado'?' <span class=\'badge\'>Jurado</span>':''}${p.name===r.host?.name?' <span class=\'badge\'>Host</span>':''}</li>`).join("");
  if(teamB) teamB.innerHTML = (r.players||[]).filter(p=>p.team==='B').map(p=>`<li>${p.name}${p.role==='jurado'?' <span class=\'badge\'>Jurado</span>':''}${p.name===r.host?.name?' <span class=\'badge\'>Host</span>':''}</li>`).join("");
  scoreA.textContent = r.scores?.A ?? 0;
  scoreB.textContent = r.scores?.B ?? 0;
  currentTurn.textContent = r.turnName || '—';
  timerEl.textContent = r.timeLeft != null ? fmt(r.timeLeft) : '--:--';
  // participants list (host destacado)
  participantsEl.innerHTML = (r.players||[]).map(p=>{
    const mark = (p.name===r.host?.name) ? '<span class="badge">Host</span>' : '';
    const cls = (p.name===r.host?.name) ? 'host' : '';
    return `<li class="${cls}">${p.name} ${mark}</li>`;
  }).join("");
  // show config only for host
  configPanel.style.display = isHost ? 'block' : 'none';
  const btnExport = document.getElementById('btnExport'); if(btnExport){ btnExport.href = `/api/debates/${r.code}/export.csv`; }

  // Detect my role (jurado) for enabling score controls
  (async () => {
    const me = await getMe(); const my = me?.name;
    isJurado = !!(r.players||[]).find(p=>p.name===my && p.role==='jurado');
    const enable = (isHost || isJurado);
    ['aPlus','aMinus','bPlus','bMinus'].forEach(id=>{ const el=document.getElementById(id); if(el) el.disabled=!enable; });
  })();

  if(isHost && r.timeLeft != null){ turnSeconds.value = r.timeLeftDefault ?? 90; }

  if(isHost){
    participantsEl.querySelectorAll('li').forEach((li,i)=>{
      const name = (r.players||[])[i]?.name;
      if(!name) return;
      const sel = document.createElement('select');
      sel.innerHTML = `<option value="player">Jugador</option><option value="jurado">Jurado</option>`;
      sel.style.marginLeft = '8px';
      sel.onchange = async ()=>{
        const target = (r.players||[])[i];
        if(!target) return;
        await fetch(`/api/rooms/${r.code}/role`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ userId: target.userId, role: sel.value }) });
      };
      li.appendChild(sel);
    });
  }

}

function fmt(sec){ const m=String(Math.floor(sec/60)).padStart(2,"0"); const s=String(sec%60).padStart(2,"0"); return `${m}:${s}`; }

function appendMsg(text){
  const el = document.createElement('div');
  el.className = 'msg';
  el.innerHTML = text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function connectSocket(){
  if(ioSocket) return;
  ioSocket = io();
  ioSocket.on('connect', ()=>{});
  ioSocket.on('room:update', data=> { renderRoom(data); });
  ioSocket.on('hand:update', hand=> renderHand(hand));
  ioSocket.on('room:tick', t=> timerEl.textContent = fmt(t));
  ioSocket.on('chat:msg', html=> appendMsg(html));
}

document.getElementById("btnCreate")?.addEventListener("click", async ()=>{
  if(!(await ensureAuth())){ location.href='/auth'; return; }
  const res = await fetch('/api/rooms', {method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body: JSON.stringify({topic: topic.value.trim()||'Debate general', displayName: (hostName.value||'').trim()})});
  if(!res.ok) return alert('Error creando sala');
  const data = await res.json();
  activeCode = data.code; isHost = true;
  createHint.textContent = `Sala creada: ${data.code} (copiado)`; try{ await navigator.clipboard.writeText(data.code);}catch{}
  lobby.style.display='none'; room.style.display='';
  connectSocket();
  ioSocket.emit('room:join', { code: data.code });
  const me = await getMe(); myName = me?.name || null; ioSocket.emit('hand:get', { code: data.code, userName: myName });
});

document.getElementById("btnJoin")?.addEventListener("click", async ()=>{
  if(!(await ensureAuth())){ location.href='/auth'; return; }
  const code = (roomCode.value||'').trim().toUpperCase();
  const res = await fetch('/api/rooms/join', {method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body: JSON.stringify({code, displayName: (joinName.value||'').trim()})});
  if(!res.ok) return alert('No se pudo unir');
  const data = await res.json();
  activeCode = data.code; isHost = false;
  lobby.style.display='none'; room.style.display='';
  connectSocket();
  ioSocket.emit('room:join', { code: data.code });
  const me = await getMe(); myName = me?.name || null; ioSocket.emit('hand:get', { code: data.code, userName: myName });
});

document.getElementById("btnStartRound")?.addEventListener("click", ()=>{
  if(!ioSocket || !activeCode) return;
  ioSocket.emit('room:start', { code: activeCode, turnSeconds: parseInt(turnSeconds.value||'90',10) });
});
document.getElementById("btnCopyCode")?.addEventListener("click", async ()=>{
  if(!activeCode) return; try{ await navigator.clipboard.writeText(activeCode);}catch{}
});
document.getElementById("btnSend")?.addEventListener("click", ()=>{
  const t = (chatText.value||'').trim(); if(!t) return;
  ioSocket.emit('chat:send', { code: activeCode, text: t });
  chatText.value='';
});
document.getElementById("btnFinish")?.addEventListener("click", ()=>{
  if(!ioSocket || !activeCode) return;
  ioSocket.emit('room:finish', { code: activeCode });
});
document.getElementById("btnApplyConfig")?.addEventListener("click", ()=>{
  if(!ioSocket || !activeCode) return;
  ioSocket.emit('room:config', { code: activeCode, turnSeconds: parseInt(turnSeconds.value||'90',10) });
});


function renderHand(hand){
  if(!Array.isArray(hand)) return;
  myCardsGrid.innerHTML = hand.map((c,i)=>`<button class="card-chip" data-i="${i}">${c.label}</button>`).join('');
  myCardsGrid.querySelectorAll('.card-chip').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      myCardsGrid.querySelectorAll('.card-chip').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); selectedCardIndex = +btn.dataset.i;
      document.getElementById('btnUseCard').disabled = false;
    });
  });
}
document.getElementById('btnUseCard')?.addEventListener('click', ()=>{
  if(selectedCardIndex<0) return;
  ioSocket.emit('card:use', { code: activeCode, userName: myName, cardIndex: selectedCardIndex });
  selectedCardIndex = -1; document.getElementById('btnUseCard').disabled = true;
});


['aPlus','aMinus','bPlus','bMinus'].forEach(id=>{
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('click', async ()=>{
    if(!activeCode) return;
    const team = (id.startsWith('a')?'A':'B');
    const delta = (id.endsWith('Plus')? 1 : -1);
    const res = await fetch(`/api/rooms/${activeCode}/score`, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ team, delta }) });
    if(!res.ok){ alert('Sin permiso para ajustar puntaje'); return; }
    // pide actualización al servidor vía canal de sala
    if(ioSocket) ioSocket.emit('room:join', { code: activeCode });
  });
});
