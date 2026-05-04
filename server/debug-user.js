const axios = require('axios');
axios.get('http://localhost:5000/api/user/69f65b3e235ccd91460f67a1')
  .then(res => console.log("Success:", res.data))
  .catch(err => console.log("Error:", err.message));
