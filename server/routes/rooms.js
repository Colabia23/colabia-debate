import { Router } from 'express';
import { nanoid } from 'nanoid';
import Room from '../models/Room.js';

function cardDeck(){
  return {
    bonus:[{id:'cita_dorada',label:'Cita Dorada (+2 si aportas fuente académica)',points:2}],
    utility:[{id:'extra_tiempo',label:'Extra Tiempo (+15 s a tu turno)',time:15}],
    sabotage:[{id:'pide_evidencia',label:'Pide Evidencia (rival debe citar o −2)',points:-2,target:'rival'}]
  };
}
function pick(arr,n=1){ return [...arr].sort(()=>0.5-Math.random()).slice(0,n); }
function dealHand(){ const d=cardDeck(); const pool=[...pick(d.bonus,3),...pick(d.utility,3),...pick(d.sabotage,3)]; return pick(pool,4);}

const router = Router();

// Auth guard middleware for API
router.use((req,res,next)=>{
  if(!req.session.user) return res.status(401).json({error:'unauthorized'});
  next();
});

router.post('/rooms', async (req, res)=>{
  try{
    const { topic, displayName } = req.body;
    const code = nanoid(6).toUpperCase();
    const name = displayName?.trim() || req.session.user.name;
    const room = await Room.create({
      code,
      topic: topic?.trim() || 'Debate general',
      host: { userId: req.session.user._id, name },
      players: [{ userId: req.session.user._id, name, team: 'A' }],
      turnName: null,
      timeLeft: 90,
      hands: [{ userId: req.session.user._id, cards: dealHand() }]
    });
    res.json(room);
  }catch(e){
    console.error(e);
    res.status(500).json({error:'cannot_create_room'});
  }
});

router.post('/rooms/join', async (req, res)=>{
  try{
    const { code, displayName } = req.body;
    const room = await Room.findOne({ code: (code||'').toUpperCase() });
    if(!room) return res.status(404).json({error:'room_not_found'});
    const name = displayName?.trim() || req.session.user.name;
    // assign team less populated
    const countA = room.players.filter(p=>p.team==='A').length;
    const countB = room.players.filter(p=>p.team==='B').length;
    const team = countA <= countB ? 'A':'B';
    // if already inside, update name
    const existing = room.players.find(p=>String(p.userId)===String(req.session.user._id));
    if(existing){
      existing.name = name; existing.team = existing.team || team;
    }else{
      room.players.push({ userId: req.session.user._id, name, team });
    }
    // give hand if not present
    if(!room.hands) room.hands = [];
    if(!room.hands.find(h=>String(h.userId)===String(req.session.user._id))){ room.hands.push({ userId: req.session.user._id, cards: dealHand() }); }
    await room.save();
    res.json(room);
  }catch(e){
    console.error(e);
    res.status(500).json({error:'cannot_join_room'});
  }
});

router.get('/rooms/:code', async (req,res)=>{
  try{
    const room = await Room.findOne({ code: req.params.code.toUpperCase() });
    if(!room) return res.status(404).json({error:'room_not_found'});
    res.json(room);
  }catch(e){
    console.error(e);
    res.status(500).json({error:'cannot_get_room'});
  }
});

export default router;


// Set role (host only)
router.post('/rooms/:code/role', async (req,res)=>{ // emit after role/score
  try{
    const room = await Room.findOne({ code: req.params.code.toUpperCase() });
    if(!room) return res.status(404).json({error:'room_not_found'});
    if(String(room.host.userId) !== String(req.session.user._id)) return res.status(403).json({error:'forbidden'});
    const { userId, role } = req.body;
    const p = room.players.find(x=> String(x.userId)===String(userId));
    if(!p) return res.status(404).json({error:'player_not_found'});
    p.role = role === 'jurado' ? 'jurado' : 'player';
    await room.save();
    res.json({ok:true});
  }catch(e){ console.error(e); res.status(500).json({error:'cannot_set_role'}); }
});

// Add score (host or jurado)
router.post('/rooms/:code/score', async (req,res)=>{
  try{
    const room = await Room.findOne({ code: req.params.code.toUpperCase() });
    if(!room) return res.status(404).json({error:'room_not_found'});
    const meId = String(req.session.user._id);
    const isHost = String(room.host.userId) === meId;
    const isJurado = !!room.players.find(p=> String(p.userId)===meId && p.role==='jurado');
    if(!isHost && !isJurado) return res.status(403).json({error:'forbidden'});
    const { team, delta } = req.body;
    if(!['A','B'].includes(team)) return res.status(400).json({error:'bad_team'});
    room.scores[team] = (room.scores[team]||0) + parseInt(delta||0,10);
    await room.save();
    res.json({ok:true});
  }catch(e){ console.error(e); res.status(500).json({error:'cannot_add_score'}); }
});

// Materiales de apoyo: listar
router.get('/rooms/:code/materials', async (req, res)=>{
  try{
    const room = await Room.findOne({ code: req.params.code.toUpperCase() });
    if(!room) return res.status(404).json({error:'room_not_found'});
    res.json(room.materials || []);
  }catch(e){
    console.error(e);
    res.status(500).json({error:'cannot_get_materials'});
  }
});

// Crear material (solo host)
router.post('/rooms/:code/materials', async (req, res)=>{
  try{
    const room = await Room.findOne({ code: req.params.code.toUpperCase() });
    if(!room) return res.status(404).json({error:'room_not_found'});

    const meId = String(req.session.user._id);
    const isHost = String(room.host.userId) === meId;
    if(!isHost) return res.status(403).json({error:'forbidden'});

    const { title, type, url } = req.body;
    if(!title || !url){
      return res.status(400).json({error:'missing_fields'});
    }

    if(!room.materials) room.materials = [];
    room.materials.push({
      title: String(title).trim(),
      type: (type === 'pdf' ? 'pdf' : 'link'),
      url: String(url).trim(),
      uploadedBy: req.session.user._id
    });

    await room.save();

    // Notificar a la sala por socket (si existe io en app)
    const io = req.app.get('io');
    if(io){
      io.to(room.code).emit('materials:update', room.materials);
    }

    res.json(room.materials);
  }catch(e){
    console.error(e);
    res.status(500).json({error:'cannot_add_material'});
  }
});

// Eliminar material (solo host)
router.delete('/rooms/:code/materials/:materialId', async (req, res)=>{
  try{
    const room = await Room.findOne({ code: req.params.code.toUpperCase() });
    if(!room) return res.status(404).json({error:'room_not_found'});

    const meId = String(req.session.user._id);
    const isHost = String(room.host.userId) === meId;
    if(!isHost) return res.status(403).json({error:'forbidden'});

    room.materials = (room.materials || []).filter(m=> String(m._id) !== String(req.params.materialId));
    await room.save();

    const io = req.app.get('io');
    if(io){
      io.to(room.code).emit('materials:update', room.materials);
    }

    res.json({ok:true});
  }catch(e){
    console.error(e);
    res.status(500).json({error:'cannot_delete_material'});
  }
});
