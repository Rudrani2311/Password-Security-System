const db = require("./database");

const users = db.prepare("SELECT * FROM users").all();

console.log(users);