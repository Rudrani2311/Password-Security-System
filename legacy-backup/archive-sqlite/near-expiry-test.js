const db = require("./database");

const nearExpiryDate = new Date();
nearExpiryDate.setDate(nearExpiryDate.getDate() + 4);

db.prepare(`
    UPDATE users
    SET password_expiry_date = ?
    WHERE username = ?
`).run(
    nearExpiryDate.toISOString(),
    "testuser"
);

console.log("Test user's password has been set to near expiry.");
console.log("Expiry date:", nearExpiryDate.toISOString());