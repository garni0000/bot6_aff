const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  username: String,
  referrer_id: Number,
  invited_count: { type: Number, default: 0 },
  tickets: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  joined_channels: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
