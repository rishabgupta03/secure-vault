const mongoose = require("mongoose");
const ChatMessage = require("./models/ChatMessage");

mongoose.connect("mongodb://127.0.0.1:27017/spv")
  .then(async () => {
    const msgs = await ChatMessage.find();
    console.log("Messages:");
    msgs.forEach(m => console.log(m.senderId, m.encryptedContent.substring(0,20)));
    process.exit();
  });
