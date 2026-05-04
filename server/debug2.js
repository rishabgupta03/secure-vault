const mongoose = require("mongoose");
const VaultKey = require("./models/VaultKey");

mongoose.connect("mongodb://127.0.0.1:27017/spv")
  .then(async () => {
    // Viewer ID from user logs
    const viewerId = "69f65b3e235ccd91460f67a1";
    await VaultKey.deleteOne({ userId: viewerId });
    console.log("Deleted key for viewer", viewerId);
    process.exit();
  });
