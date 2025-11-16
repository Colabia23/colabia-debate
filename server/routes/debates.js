import { Router } from 'express';
import Debate from '../models/Debate.js';

const router = Router();
router.use((req,res,next)=>{
  if(!req.session.user) return res.status(401).json({error:'unauthorized'});
  next();
});

router.get('/debates/mine', async (req,res)=>{
  const list = await Debate.find({ owners: req.session.user._id }).sort({ finishedAt: -1 }).limit(50);
  res.json(list);
});

export default router;


// Export acta CSV por código
router.get('/debates/:code/export.csv', async (req,res)=>{
  try{
    const code = req.params.code.toUpperCase();
    const d = await Debate.findOne({ code });
    if(!d) return res.status(404).send('No encontrado');
    // Check ownership
    if(!d.owners.find(o=> String(o)===String(req.session.user._id))) return res.status(403).send('Prohibido');
    let csv = 'Campo,Valor\n';
    csv += `Codigo,${d.code}\n`;
    csv += `Tema,${(d.topic||'').replace(',', ' ')}\n`;
    csv += `Host,${d.host?.name||''}\n`;
    csv += `Participantes,${(d.players||[]).map(p=>p.name).join(' | ')}\n`;
    csv += `Puntaje A,${d.scores?.A||0}\n`;
    csv += `Puntaje B,${d.scores?.B||0}\n`;
    csv += `Inicio,${d.startedAt||''}\n`;
    csv += `Fin,${d.finishedAt||''}\n`;
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="acta-${d.code}.csv"`);
    res.send(csv);
  }catch(e){ console.error(e); res.status(500).send('Error'); }
});
