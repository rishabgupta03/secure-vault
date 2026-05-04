const mongoose = require("mongoose");

const ChatChannelSchema = new mongoose.Schema({
  vaultId: String,
  name: String,
  type: { type: String, default: "channel" }, // 'channel' or 'direct'
  members: [String], // Array of userIds (mostly for 'direct', but can be used for private channels)
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("ChatChannel", ChatChannelSchema);
