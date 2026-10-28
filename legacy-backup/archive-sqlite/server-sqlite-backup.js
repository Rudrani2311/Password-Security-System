const express = require("express");
const db = require("./database");
const bcrypt = require("bcrypt");

function logSecurityEvent(userId, eventType) {
    db.prepare(`
        INSERT INTO security_logs (user_id, event_type, timestamp)
        VALUES (?, ?, ?)
    `).run(userId, eventType, new Date().toISOString());
}

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.json({ message: "Password Security System is running" });
});

app.get("/api/password-status/:username", (req, res) => {
    const { username } = req.params;

    const user = db.prepare(`
        SELECT username, password_changed_at, password_expiry_date
        FROM users
        WHERE username = ?
    `).get(username);

    if (!user) {
        return res.status(404).json({
            message: "User not found"
        });
    }

    const currentDate = new Date();
    const expiryDate = new Date(user.password_expiry_date);

    const timeDifference = expiryDate - currentDate;
    const daysRemaining = Math.ceil(
        timeDifference / (1000 * 60 * 60 * 24)
    );

    let status;

    if (currentDate >= expiryDate) {
        status = "EXPIRED";
    } else if (daysRemaining <= 5) {
        status = "NEAR_EXPIRY";
    } else {
        status = "ACTIVE";
    }

    res.json({
        username: user.username,
        passwordChangedAt: user.password_changed_at,
        passwordExpiryDate: user.password_expiry_date,
        daysRemaining: daysRemaining,
        status: status
    });
});

app.get("/api/security-logs/:username", (req, res) => {
    const { username } = req.params;

    const user = db.prepare(`
        SELECT id, username
        FROM users
        WHERE username = ?
    `).get(username);

    if (!user) {
        return res.status(404).json({
            message: "User not found"
        });
    }

    const logs = db.prepare(`
        SELECT event_type, timestamp
        FROM security_logs
        WHERE user_id = ?
        ORDER BY id DESC
    `).all(user.id);

    res.json({
        username: user.username,
        logs: logs
    });
});

app.post("/api/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            message: "Username and password are required"
        });
    }

    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

    if (!user) {
        return res.status(401).json({
            message: "Invalid username or password"
        });
    }

    const passwordCorrect = bcrypt.compareSync(password, user.password_hash);

    if (!passwordCorrect) {
        logSecurityEvent(user.id, "LOGIN_FAILED");

        return res.status(401).json({
            message: "Invalid username or password"
        });
    }

    const currentDate = new Date();
    const expiryDate = new Date(user.password_expiry_date);

    if (currentDate >= expiryDate) {
        logSecurityEvent(user.id, "PASSWORD_EXPIRED");

        return res.status(403).json({
            message: "Password expired. Please change your password."
        });
    }

    logSecurityEvent(user.id, "LOGIN_SUCCESS");

    res.json({
        message: "Login successful",
        username: user.username
    });
});

app.post("/api/change-password", (req, res) => {
    const { username, currentPassword, newPassword } = req.body;

    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    const currentPasswordCorrect = bcrypt.compareSync(
        currentPassword,
        user.password_hash
    );

    if (!currentPasswordCorrect) {
        return res.status(401).json({
            message: "Current password is incorrect"
        });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({
            message: "Password must be at least 8 characters long"
        });
    }

    if (!/[A-Z]/.test(newPassword)) {
        return res.status(400).json({
            message: "Password must contain at least one uppercase letter"
        });
    }

    if (!/[a-z]/.test(newPassword)) {
        return res.status(400).json({
            message: "Password must contain at least one lowercase letter"
        });
    }

    if (!/[0-9]/.test(newPassword)) {
        return res.status(400).json({
            message: "Password must contain at least one number"
        });
    }

    if (!/[^A-Za-z0-9]/.test(newPassword)) {
        return res.status(400).json({
            message: "Password must contain at least one special character"
        });
    }

    if (newPassword === currentPassword) {
        return res.status(400).json({
            message: "New password cannot be the same as the current password"
        });
    }

    const passwordHistory = db.prepare(`
        SELECT password_hash
        FROM password_history
        WHERE user_id = ?
    `).all(user.id);

    for (const oldPassword of passwordHistory) {
        if (bcrypt.compareSync(newPassword, oldPassword.password_hash)) {
            return res.status(400).json({
                message: "You cannot reuse a previous password"
            });
        }
    }

    const newPasswordHash = bcrypt.hashSync(newPassword, 12);

    const changedAt = new Date();
    const expiryDate = new Date(changedAt);
    expiryDate.setDate(expiryDate.getDate() + 30);

    db.prepare(`
        INSERT INTO password_history (user_id, password_hash, created_at)
        VALUES (?, ?, ?)
    `).run(
        user.id,
        user.password_hash,
        changedAt.toISOString()
    );

    db.prepare(`
        UPDATE users
        SET password_hash = ?,
            password_changed_at = ?,
            password_expiry_date = ?
        WHERE id = ?
    `).run(
        newPasswordHash,
        changedAt.toISOString(),
        expiryDate.toISOString(),
        user.id
    );

    logSecurityEvent(user.id, "PASSWORD_CHANGED");

    res.json({
        message: "Password changed successfully",
        passwordExpiryDate: expiryDate.toISOString()
    });
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});