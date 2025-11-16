import mongoose from 'mongoose';

const DebateSchema = new mongoose.Schema({
  code: { type:String, index:true },
  topic: String,
  host: { name: String, userId: { type: mongoose.Schema.Types.ObjectId, ref:'User' } },
  players: [{ name:String, userId: { type: mongoose.Schema.Types.ObjectId, ref:'User' }, team:String }],
  scores: { A:Number, B:Number },
  messages: [{ name:String, text:String, ts:Date }],
  logs: [{ ts:Date, who:String, text:String }],
  startedAt: Date,
  finishedAt: Date,
  owners: [{ type: mongoose.Schema.Types.ObjectId, ref:'User' }] // para que aparezca a host y participantes
});

export default mongoose.model('Debate', DebateSchema);
