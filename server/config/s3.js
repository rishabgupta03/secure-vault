const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  accessKeyId: "YOUR_ACCESS_KEY",
  secretAccessKey: "YOUR_SECRET_KEY",
  region: "ap-south-1"
});

module.exports = s3;



