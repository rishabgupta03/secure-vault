const mongoose = require("mongoose");

const ChatMessageSchema = new mongoose.Schema({
  channelId: String,
  vaultId: String,
  senderId: String,
  encryptedContent: String, // Base64 ciphertext
  iv: String, // Base64 initialization vector
  tag: String, // Base64 authentication tag
  timestamp: { type: Date, default: Date.now },
  readBy: [String] // Array of userIds who have read this message
});

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
