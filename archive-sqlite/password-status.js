const db = require("./database");

const username = "testuser";

const user = db.prepare(`
    SELECT username, password_changed_at, password_expiry_date
    FROM users
    WHERE username = ?
`).get(username);

if (!user) {
    console.log("User not found.");
    process.exit();
}

const currentDate = new Date();
const expiryDate = new Date(user.password_expiry_date);

const timeDifference = expiryDate - currentDate;
const daysRemaining = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));

let status;

if (currentDate >= expiryDate) {
    status = "EXPIRED";
} else if (daysRemaining <= 5) {
    status = "NEAR_EXPIRY";
} else {
    status = "ACTIVE";
}

console.log({
    username: user.username,
    passwordChangedAt: user.password_changed_at,
    passwordExpiryDate: user.password_expiry_date,
    daysRemaining: daysRemaining,
    status: status
});