const mongoose = require("mongoose");

const VaultKeySchema = new mongoose.Schema({
  vaultId: String,
  userId: String,
  encryptedChatKey: String // The AES-256-GCM key for the vault chat, encrypted with the user's RSA public key
});

module.exports = mongoose.model("VaultKey", VaultKeySchema);
