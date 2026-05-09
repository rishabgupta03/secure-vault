const mongoose = require("mongoose");
const Vault = require("./models/Vault");

async function run() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/securevault");
  
  // Find ANY vault
  const vault = await Vault.findOne({});
  if (!vault) {
    console.log("No vaults found in DB");
    process.exit(0);
  }

  // Find a file in the vault
  if (vault.files.length === 0) {
    console.log("Vault has no files");
    process.exit(0);
  }

  const file = vault.files[0];
  const fileIdStr = file._id.toString();
  console.log("File ID String:", fileIdStr);
  console.log("File ID Type:", typeof file._id);

  // Test the query from server.js
  const result = await Vault.findOne({
    $or: [
      { "files._id": new mongoose.Types.ObjectId(fileIdStr) },
      { "files._id": fileIdStr }
    ]
  });

  console.log("Query matched:", !!result);
  process.exit(0);
}

run();
