import mongoose from 'mongoose';

const CardSchema = new mongoose.Schema({
  id: String,
  label: String,
  points: Number,
  time: Number,
  target: String
}, { _id: false });

const HandSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cards: [CardSchema]
}, { _id: false });

const MaterialSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, enum: ['link', 'pdf'], default: 'link' },
  url: { type: String, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const PlayerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: String,
  role: { type: String, enum: ['player', 'jurado', 'host'], default: 'player' },
  team: { type: String, enum: ['A', 'B'], default: 'A' }
}, { _id: false });

const RoomSchema = new mongoose.Schema({
  code: { type: String, unique: true, index: true },
  topic: { type: String, default: 'Debate general' },
  host: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String
  },
  players: [PlayerSchema],
  scores: {
    A: { type: Number, default: 0 },
    B: { type: Number, default: 0 }
  },
  turnName: { type: String, default: null },
  timeLeft: { type: Number, default: 90 },
  logs: [{ ts: Date, who: String, text: String }],
  hands: [HandSchema],
  materials: [MaterialSchema],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Room', RoomSchema);
