const db = require("./database");

const expiredDate = new Date();
expiredDate.setDate(expiredDate.getDate() - 1);

db.prepare(`
    UPDATE users
    SET password_expiry_date = ?
    WHERE username = ?
`).run(expiredDate.toISOString(), "testuser");

console.log("Test user's password has been set to expired.");
console.log("Expiry date:", expiredDate.toISOString());