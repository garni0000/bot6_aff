const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  userId: Number,
  amount: Number,
  paymentMethod: String,
  country: String,
  phone: String,
  email: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
