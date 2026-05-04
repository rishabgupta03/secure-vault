const axios = require("axios");

axios.post("http://localhost:5000/api/login", {
  email: "mansi",
  password: "123"
})
.then(res => console.log("Login Success:", res.status))
.catch(err => console.log("Login Error:", err.message));
