// /public/js/debate-api.js
const $ = s=>document.querySelector(s);
const lobby = $("#lobby");
const room = $("#room");
const hostName = $("#hostName");
const topic = $("#topic");
const joinName = $("#joinName");
const roomCode = $("#roomCode");
const createHint = $("#createHint");
const roomTopic = $("#roomTopic");
const roomIdEl = $("#roomId");
const hostLabel = $("#hostLabel");
const teamA = $("#teamA");
const scoreA = $("#scoreA");
const scoreB = $("#scoreB");
const currentTurn = $("#currentTurn");
const timerEl = $("#timer");
const myCards = $("#myCards");
const chatLog = $("#chatLog");
const chatText = $("#chatText");
let poll = null;
let roomCodeActive = null;

function li(items){ return items.map(x=>`<li>${x}</li>`).join(""); }
function fmt(sec){ const m=String(Math.floor(sec/60)).padStart(2,"0"); const s=String(sec%60).padStart(2,"0"); return `${m}:${s}`; }

async function ensureAuth(){
  const r = await fetch('/api/me', {credentials:'include'});
  if(r.status===401){ location.href='/auth'; return false; }
  return true;
}

async function startPolling(code){
  stopPolling();
  roomCodeActive = code;
  poll = setInterval(async()=>{
    try{
      const res = await fetch(`/api/rooms/${code}`, {credentials:'include'});
      if(!res.ok) return;
      const data = await res.json();
      renderRoom(data);
    }catch{}
  }, 1500);
}
function stopPolling(){ if(poll){ clearInterval(poll); poll=null; } }

function enterRoomUI(data){
  lobby.style.display = "none";
  room.style.display = "";
  renderRoom(data);
}

function renderRoom(data){
  if(!data) return;
  roomTopic.textContent = data.topic;
  roomIdEl.textContent = data.code;
  hostLabel.textContent = data.host?.name || '—';
  teamA.innerHTML = li((data.players||[]).filter(p=>p.team==='A').map(p=>p.name));
  scoreA.textContent = data.scores?.A ?? 0;
  scoreB.textContent = data.scores?.B ?? 0;
  currentTurn.textContent = data.turnName || '—';
  timerEl.textContent = fmt(data.timeLeft ?? 0);
  // cards/chat to be implemented in next block with websockets
}

document.getElementById("btnCreate")?.addEventListener("click", async ()=>{
  if(!(await ensureAuth())) return;
  const name = hostName.value.trim();
  const t = topic.value.trim() || "Debate general";
  if(!name){ alert("Ingresa tu nombre"); return; }
  const res = await fetch('/api/rooms', {
    method:'POST', headers:{'Content-Type':'application/json'},
    credentials:'include',
    body: JSON.stringify({ topic:t, displayName:name })
  });
  if(!res.ok){ alert("Error creando sala"); return; }
  const data = await res.json();
  createHint.textContent = `Sala creada: ${data.code} (copiado)`;
  try{ await navigator.clipboard.writeText(data.code); }catch{}
  enterRoomUI(data);
  startPolling(data.code);
});

document.getElementById("btnJoin")?.addEventListener("click", async ()=>{
  if(!(await ensureAuth())) return;
  const name = joinName.value.trim();
  const code = roomCode.value.trim().toUpperCase();
  if(!name || !code){ alert("Completa tu nombre y el código"); return; }
  const res = await fetch('/api/rooms/join', {
    method:'POST', headers:{'Content-Type':'application/json'},
    credentials:'include',
    body: JSON.stringify({ code, displayName:name })
  });
  if(!res.ok){ alert("No se pudo unir, verifica el código"); return; }
  const data = await res.json();
  enterRoomUI(data);
  startPolling(data.code);
});

document.getElementById("btnCopyCode")?.addEventListener("click", async ()=>{
  const code = roomIdEl.textContent.trim();
  if(!code) return;
  try{ await navigator.clipboard.writeText(code); }catch{}
});

// Guard: si se visita /debate sin auth, backend redirige, pero aquí reforzamos
(async()=>{
  await ensureAuth();
})();
