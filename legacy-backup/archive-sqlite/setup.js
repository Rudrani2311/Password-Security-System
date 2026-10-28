const db = require("./database");
const bcrypt = require("bcrypt");

const username = "testuser";
const password = "Test@1234";

const passwordHash = bcrypt.hashSync(password, 12);

const changedAt = new Date();
const expiryDate = new Date(changedAt);
expiryDate.setDate(expiryDate.getDate() + 30);

const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, password_changed_at, password_expiry_date)
    VALUES (?, ?, ?, ?)
`);

insertUser.run(
    username,
    passwordHash,
    changedAt.toISOString(),
    expiryDate.toISOString()
);

console.log("Test user created.");
console.log("Username:", username);
console.log("Password:", password);