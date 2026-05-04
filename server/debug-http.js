const http = require("http");

const data = JSON.stringify({
  email: "mansi",
  password: "123"
});

const options = {
  hostname: "localhost",
  port: 5000,
  path: "/api/login",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": data.length
  }
};

const req = http.request(options, (res) => {
  let body = "";
  res.on("data", d => body += d);
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("Response:", body.substring(0, 100));
  });
});

req.on("error", (e) => {
  console.error("Error:", e.message);
});

req.write(data);
req.end();
