const mongoose = require("mongoose");

const FileKeySchema = new mongoose.Schema({
  fileId: String,
  userId: String,
  encryptedKey: String
}, { timestamps: true });

module.exports = mongoose.model("FileKey", FileKeySchema);




