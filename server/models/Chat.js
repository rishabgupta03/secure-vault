const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema({
  vaultId: String,
  senderId: String,
  message: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Chat", ChatSchema);