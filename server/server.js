import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import morgan from 'morgan';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';
import debatesRoutes from './routes/debates.js';
import { ensureAuth } from './middleware/auth.js';
import mongoose from 'mongoose';

dotenv.config();
const app = express();
const __dirname = path.resolve();

// Mongo connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/debate_site';
await mongoose.connect(MONGO_URI);

// Middlewares
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'supersecret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000*60*60*24*7 },
  store: MongoStore.create({ mongoUrl: MONGO_URI, collectionName: 'sessions' })
}));

// Static
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/auth', authRoutes);
app.use('/api', roomRoutes);
app.use('/api', debatesRoutes);

// Auth gate for flows
app.get('/start', (req, res)=>{
  if(req.session.user) return res.redirect('/debate');
  return res.redirect('/auth');
});

app.get('/auth', (req, res)=>{
  return res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

app.get('/api/me', (req, res)=>{
  if(!req.session.user) return res.status(401).json({ error: 'unauthorized' });
  res.json({ id: req.session.user._id, name: req.session.user.name, email: req.session.user.email });
});

app.get('/debate', ensureAuth, (req, res)=>{
  return res.sendFile(path.join(__dirname, 'public', 'debate.html'));
});

// Home fallback
app.get('/', (req, res)=>{
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });
app.set('io', io);

import Room from './models/Room.js';
import Debate from './models/Debate.js';

const timers = new Map(); // code -> {interval, endsAt, turnSeconds}

io.use((socket, next)=>{
  // simple session check
  const req = socket.request;
  // express-session not bound to socket by default; trust API flow, allow join then validate per event
  next();
});


// === Cards helpers ===
function cardDeck(){
  return {
    bonus: [
      { id:"cita_dorada", label:"Cita Dorada (+2 si aportas fuente académica)", points:+2 },
      { id:"claridad_cristal", label:"Claridad Cristal (+1 si sintetizas ≤150 caracteres)", points:+1 },
      { id:"apoyo_visual", label:"Apoyo Visual (+1 si usas evidencia visual)", points:+1 },
      { id:"pregunta_poderosa", label:"Pregunta Poderosa (+1 si generas contraargumento fuerte)", points:+1 },
      { id:"consenso", label:"Consenso Parcial (+1 si reconoces un punto del rival)", points:+1 }
    ],
    sabotage: [
      { id:"pide_evidencia", label:"Pide Evidencia (rival debe citar o −2)", points:-2, target:"rival" },
      { id:"veto", label:"Veto (anula carta rival reciente)", points:0, target:"rival" },
      { id:"silencio_estrategico", label:"Silencio Estratégico (−15 s al turno rival)", time:-15, target:"rival" },
      { id:"duda_metodologica", label:"Duda Metodológica (−1 si la fuente no es primaria)", points:-1, target:"rival" },
      { id:"falacia", label:"Detectar Falacia (−1 si señalas una falacia concreta)", points:-1, target:"rival" }
    ],
    utility: [
      { id:"extra_tiempo", label:"Extra Tiempo (+15 s a tu turno)", time:+15 },
      { id:"cambio_turno", label:"Cambio de Turno (pasa el turno a tu compañero)", points:0 },
      { id:"robar_1", label:"Robar 1 (recibe una carta adicional)", points:0 },
      { id:"descartar_1", label:"Descartar 1 (cambia una carta)", points:0 },
      { id:"revelar", label:"Revelar (muestra 1 carta aleatoria del rival)", points:0 }
    ]
  };
}
function pick(arr, n=1){ return [...arr].sort(()=>0.5-Math.random()).slice(0,n); }
function dealHand(){
  const deck = cardDeck();
  const pool = [...pick(deck.bonus,6), ...pick(deck.sabotage,6), ...pick(deck.utility,6)];
  return pick(pool, 4);
}

io.on('connection', (socket)=>{
  socket.on('room:join', async ({ code })=>{
    
const room = await Room.findOne({ code });
if(!room) return;
socket.join(code);
// no-op: hands dealt on create/join API already; but ensure minimal structure
if(!room.hands) room.hands = [];
await room.save();
io.to(code).emit('room:update', room.toJSON());

  });


socket.on('hand:get', async ({ code, userName })=>{
  const r = await Room.findOne({ code });
  if(!r) return;
  const p = r.players.find(x=>x.name===userName);
  if(!p) return;
  const h = (r.hands||[]).find(x=>String(x.userId)===String(p.userId));
  socket.emit('hand:update', h ? h.cards : []);
});

socket.on('chat:send', async ({ code, text })=>{

    const safe = String(text||'').slice(0,500);
    io.to(code).emit('chat:msg', `<span class="muted">${new Date().toLocaleTimeString()}</span> · ${safe.replace(/</g,'&lt;')}`);
  });

  socket.on('room:start', async ({ code, turnSeconds })=>{
    const room = await Room.findOne({ code });
    if(!room) return;
    room.turnName = room.players[0]?.name || null;
    room.timeLeft = Math.max(30, Math.min(300, parseInt(turnSeconds||90,10)));
    await room.save();
    io.to(code).emit('room:update', room.toJSON());

    // start timer
    if(timers.has(code)) clearInterval(timers.get(code).interval);
    const interval = setInterval(async ()=>{
      const r = await Room.findOne({ code });
      if(!r) return;
      r.timeLeft = Math.max(0, (r.timeLeft||0)-1);
      await r.save();
      io.to(code).emit('room:tick', r.timeLeft);
      if(r.timeLeft<=0){
        // rotate turn
        const names = r.players.map(p=>p.name);
        const idx = names.indexOf(r.turnName);
        r.turnName = names[(idx+1) % names.length] || null;
        r.timeLeft = Math.max(30, Math.min(300, parseInt(turnSeconds||90,10)));
        await r.save();
        io.to(code).emit('room:update', r.toJSON());
      }
    }, 1000);
    timers.set(code, { interval });
  });


socket.on('card:use', async ({ code, userName, cardIndex=0 })=>{
  const r = await Room.findOne({ code });
  if(!r) return;
  const p = r.players.find(x=>x.name===userName);
  if(!p) return;
  if(!r.hands) r.hands = [];
  const h = r.hands.find(x=>String(x.userId)===String(p.userId)) || r.hands.find(x=>x.userId==null && (x.ownerName===userName));
  // Fallback by name if userId undefined (guest style)
  let hand = h ? h.cards : [];
  if(!hand || !hand.length) return;
  const idx = Math.max(0, Math.min(cardIndex, hand.length-1));
  const card = hand[idx];
  // apply effects
    // draw
    if(card.draw){
      const deck = cardDeck(); const pool = [...deck.bonus, ...deck.sabotage, ...deck.utility];
      hand.push(pool[Math.floor(Math.random()*pool.length)]);
    }
    // swap: replace chosen with random new (already removed below so push a new one)
    if(card.swap){
      const deck = cardDeck(); const pool = [...deck.bonus, ...deck.sabotage, ...deck.utility];
      hand.push(pool[Math.floor(Math.random()*pool.length)]);
    }
    // reveal: just emit a chat message about rival random card label (privacy-friendly)
    if(card.reveal){
      const rivalTeam = p.team==='A'?'B':'A';
      const rival = r.players.find(x=>x.team===rivalTeam);
      io.to(code).emit('chat:msg', `<em>Una carta del rival fue revelada.</em>`);
    }
    // switch: pass turn to next
    if(card.switch){
      const names = r.players.map(pp=>pp.name);
      const idx = names.indexOf(r.turnName);
      r.turnName = names[(idx+1)%names.length] || null;
    }
    // veto: no-op simple (señal en chat)
    if(card.veto){
      io.to(code).emit('chat:msg', `<em>Carta anterior vetada.</em>`);
    }

  if(card.points){
    const team = (card.target==='rival') ? (p.team==='A'?'B':'A') : p.team;
    r.scores[team] = (r.scores[team]||0) + card.points;
  }
  if(typeof card.time === 'number'){
    r.timeLeft = Math.max(5, (r.timeLeft||90) + card.time);
  }
  // remove card
  hand.splice(idx,1);
  await r.save();
  io.to(code).emit('chat:msg', `<strong>${userName}</strong> usa: ${card.label}`);
  io.to(code).emit('room:update', r.toJSON());
});

socket.on('room:config', async ({ code, turnSeconds })=>{

    const r = await Room.findOne({ code });
    if(!r) return;
    r.timeLeft = Math.max(30, Math.min(300, parseInt(turnSeconds||90,10)));
    await r.save();
    io.to(code).emit('room:update', r.toJSON());
  });

  socket.on('room:finish', async ({ code })=>{
    const r = await Room.findOne({ code });
    if(!r) return;
    if(timers.has(code)) { clearInterval(timers.get(code).interval); timers.delete(code); }
    // guardar debate
    await Debate.create({
      code: r.code, topic: r.topic, host: r.host,
      players: r.players, scores: r.scores, messages: [],
      startedAt: r.createdAt, finishedAt: new Date(),
      owners: [r.host.userId, ...r.players.map(p=>p.userId)].filter(Boolean)
    });
    io.to(code).emit('chat:msg', `<strong>Debate finalizado.</strong>`);
  });
});

// Start
const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log(`http://localhost:${PORT}`));

