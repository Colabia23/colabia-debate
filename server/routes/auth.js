import { Router } from 'express';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';

const router = Router();

router.post('/register', async (req, res)=>{
  try{
    const { name, email, password } = req.body;
    if(!name || !email || !password) return res.status(400).send('Datos incompletos');
    const exists = await User.findOne({ email });
    if(exists) return res.status(409).send('Ese email ya está registrado');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash });
    req.session.user = { _id: user._id, name: user.name, email: user.email };
    res.redirect('/debate');
  }catch(e){
    console.error(e);
    res.status(500).send('Error al registrar');
  }
});

router.post('/login', async (req, res)=>{
  try{
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if(!user) return res.status(401).send('Credenciales inválidas');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if(!ok) return res.status(401).send('Credenciales inválidas');
    req.session.user = { _id: user._id, name: user.name, email: user.email };
    res.redirect('/debate');
  }catch(e){
    console.error(e);
    res.status(500).send('Error al iniciar sesión');
  }
});

router.post('/logout', (req, res)=>{
  req.session.destroy(()=> res.redirect('/'));
});

export default router;
