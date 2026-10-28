const db = require("./database");

const expiryDate = new Date();
expiryDate.setDate(expiryDate.getDate() + 30);

db.prepare(`
    UPDATE users
    SET password_expiry_date = ?
    WHERE username = ?
`).run(
    expiryDate.toISOString(),
    "testuser"
);

console.log("Test user's password expiry has been restored.");
console.log("Expiry date:", expiryDate.toISOString());