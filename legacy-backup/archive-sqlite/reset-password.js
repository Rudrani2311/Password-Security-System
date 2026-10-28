const db = require("./database");
const bcrypt = require("bcrypt");

const username = "testuser";
const newPassword = "Password1@";

const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

if (!user) {
    console.log("User not found.");
    process.exit();
}

const passwordHash = bcrypt.hashSync(newPassword, 12);

const changedAt = new Date();
const expiryDate = new Date(changedAt);
expiryDate.setDate(expiryDate.getDate() + 30);

db.prepare(`
    UPDATE users
    SET password_hash = ?,
        password_changed_at = ?,
        password_expiry_date = ?
    WHERE username = ?
`).run(
    passwordHash,
    changedAt.toISOString(),
    expiryDate.toISOString(),
    username
);

console.log("Test password reset successfully.");
console.log("Username:", username);
console.log("Password:", newPassword);