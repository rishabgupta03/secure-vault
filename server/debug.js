const mongoose = require("mongoose");
const VaultKey = require("./models/VaultKey");

mongoose.connect("mongodb://127.0.0.1:27017/spv")
  .then(async () => {
    const keys = await VaultKey.find();
    console.log("Found keys:", keys);
    process.exit();
  });
