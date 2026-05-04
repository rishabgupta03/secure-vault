const mongoose = require("mongoose");

const VaultSchema = new mongoose.Schema({
  userId: String,
  name: String,
  description: String,
  visibility: String,
  role: String,
  encryption: String,
  pin: String,

  // 👥 TEAM
  members: [
    {
      userId: String,
      role: String,
      avatar: String,
      joinedAt: { type: Date, default: Date.now }
    }
  ],

  // 📂 FILE SYSTEM
  files: [
    {
      name: String,
      size: Number,
      key: String,
      encrypted: Boolean,
      uploadedBy: String,
      createdAt: { type: Date, default: Date.now },
      lastDiffSummary: String,
      versions: [
        {
          version: Number,
          key: String,
          size: Number,
          uploadedBy: String,
          createdAt: { type: Date, default: Date.now },
          diffSummary: String
        }
      ]
    }
  ],

  // 📊 STORAGE
  storageUsed: { type: Number, default: 0 },

  // 📜 ACTIVITY LOG
  activity: [
    {
      action: String,
      userId: String,
      createdAt: { type: Date, default: Date.now }
    }
  ],

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Vault", VaultSchema);










