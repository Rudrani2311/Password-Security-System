require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const bcrypt = require("bcrypt");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { ObjectId } = require("mongodb");
const { connectDatabase, getDatabase } = require("./mongo");

const app = express();

const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
    app.set("trust proxy", 1);
}

app.disable("x-powered-by");
app.use(helmet());

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many login attempts. Please try again after 15 minutes." }
});

app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    credentials: true
}));

app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB_NAME,
        collectionName: "sessions"
    }),
    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60
    }
}));

function getUserId(req) {
    return new ObjectId(req.session.userId);
}

async function logSecurityEvent(userId, eventType) {
    try {
        const db = getDatabase();
        await db.collection("security_logs").insertOne({
            user_id: userId,
            event_type: eventType,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.error("Failed to log security event:", e.message);
    }
}

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate(error => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            message: "Authentication required"
        });
    }

    next();
}

async function requireActiveLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            message: "Authentication required"
        });
    }

    try {
        const db = getDatabase();

        const user = await db.collection("users").findOne({
            _id: getUserId(req)
        });

        if (!user) {
            return res.status(401).json({
                message: "User session is invalid"
            });
        }

        const expiryDate = new Date(user.password_expiry_date);

        const passwordExpired =
            !user.password_expiry_date ||
            Number.isNaN(expiryDate.getTime()) ||
            new Date() >= expiryDate;

        req.session.passwordExpired = passwordExpired;

        if (passwordExpired) {
            return res.status(403).json({
                message: "Password expired. Please change your password."
            });
        }

        next();
    } catch (error) {
        console.log(error);

        return res.status(500).json({
            message: "Server error"
        });
    }
}

app.post("/api/register", async (req, res) => {
    try {
        const { fullName, email, username, password } = req.body || {};

        if (
            typeof fullName !== "string" ||
            typeof email !== "string" ||
            typeof username !== "string" ||
            typeof password !== "string" ||
            !fullName.trim() ||
            !email.trim() ||
            !username.trim() ||
            !password
        ) {
            return res.status(400).json({
                message: "Full name, email, username, and password are required"
            });
        }

        const cleanFullName = fullName.trim();
        const cleanEmail = email.trim().toLowerCase();
        const cleanUsername = username.trim();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            return res.status(400).json({
                message: "Please enter a valid email address"
            });
        }

        if (cleanUsername.length < 3) {
            return res.status(400).json({
                message: "Username must be at least 3 characters long"
            });
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
            return res.status(400).json({
                message: "Username may only contain letters, numbers, underscores, and hyphens"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must be at least 8 characters long"
            });
        }

        if (!/[A-Z]/.test(password)) {
            return res.status(400).json({
                message: "Password must contain at least one uppercase letter"
            });
        }

        if (!/[a-z]/.test(password)) {
            return res.status(400).json({
                message: "Password must contain at least one lowercase letter"
            });
        }

        if (!/[0-9]/.test(password)) {
            return res.status(400).json({
                message: "Password must contain at least one number"
            });
        }

        if (!/[^A-Za-z0-9]/.test(password)) {
            return res.status(400).json({
                message: "Password must contain at least one special character"
            });
        }

        const db = getDatabase();

        const existingUser = await db.collection("users").findOne({
            $or: [
                { username: cleanUsername },
                { email: cleanEmail }
            ]
        });

        if (existingUser) {
            if (existingUser.username && existingUser.username.toLowerCase() === cleanUsername.toLowerCase()) {
                return res.status(409).json({
                    message: "Username is already taken"
                });
            }
            return res.status(409).json({
                message: "Email address is already registered"
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const createdAt = new Date();
        const expiryDate = new Date(createdAt);
        expiryDate.setDate(expiryDate.getDate() + 30);

        const newUser = {
            fullName: cleanFullName,
            email: cleanEmail,
            username: cleanUsername,
            password_hash: passwordHash,
            password_changed_at: createdAt.toISOString(),
            password_expiry_date: expiryDate.toISOString(),
            created_at: createdAt.toISOString()
        };

        await db.collection("users").insertOne(newUser);

        res.status(201).json({
            message: "Account created successfully. Please log in.",
            username: cleanUsername
        });
    } catch (error) {
        console.log(error);

        res.status(500).json({
            message: "Server error during registration"
        });
    }
});

app.get("/api/me", requireLogin, async (req, res) => {
    try {
        const db = getDatabase();

        const user = await db.collection("users").findOne({
            _id: getUserId(req)
        });

        if (!user) {
            return res.status(401).json({
                message: "User session is invalid"
            });
        }

        const expiryDate = new Date(user.password_expiry_date);

        const passwordExpired =
            !user.password_expiry_date ||
            Number.isNaN(expiryDate.getTime()) ||
            new Date() >= expiryDate;

        req.session.passwordExpired = passwordExpired;

        res.json({
            fullName: user.fullName || user.username,
            email: user.email || "",
            username: user.username,
            passwordExpired: passwordExpired
        });
    } catch (error) {
        console.log(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});

app.post("/api/login", loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body || {};

        if (
            typeof username !== "string" ||
            typeof password !== "string" ||
            !username.trim() ||
            !password
        ) {
            return res.status(400).json({
                message: "Username and password are required"
            });
        }

        const identifier = username.trim();
        const db = getDatabase();

        const user = await db.collection("users").findOne({
            $or: [
                { username: identifier },
                { email: identifier.toLowerCase() }
            ]
        });

        if (!user) {
            return res.status(401).json({
                message: "Invalid username or password"
            });
        }

        const passwordCorrect = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordCorrect) {
            await logSecurityEvent(user._id, "LOGIN_FAILED");
            return res.status(401).json({
                message: "Invalid username or password"
            });
        }

        const currentDate = new Date();
        const expiryDate = new Date(user.password_expiry_date);

        const passwordExpired =
            !user.password_expiry_date ||
            Number.isNaN(expiryDate.getTime()) ||
            currentDate >= expiryDate;

        await regenerateSession(req);

        req.session.userId = user._id.toString();
        req.session.username = user.username;
        req.session.passwordExpired = passwordExpired;

        if (passwordExpired) {
            await logSecurityEvent(user._id, "PASSWORD_EXPIRED");
            return res.status(403).json({
                message: "Password expired. Please change your password.",
                requiresPasswordChange: true
            });
        }

        await logSecurityEvent(user._id, "LOGIN_SUCCESS");

        res.json({
            message: "Login successful",
            username: user.username,
            fullName: user.fullName || user.username
        });
    } catch (error) {
        console.log(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});

app.post("/api/logout", requireLogin, async (req, res) => {
    try {
        await logSecurityEvent(getUserId(req), "LOGOUT");
        req.session.destroy(error => {
            if (error) {
                return res.status(500).json({
                    message: "Logout failed"
                });
            }

            res.clearCookie("connect.sid", {
                httpOnly: true,
                secure: isProduction,
                sameSite: "lax"
            });

            res.json({
                message: "Logout successful"
            });
        });
    } catch (error) {
        console.log(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});

app.get("/api/password-status", requireLogin, async (req, res) => {
    try {
        const db = getDatabase();

        const user = await db.collection("users").findOne({
            _id: getUserId(req)
        });

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

        if (
            !user.password_expiry_date ||
            Number.isNaN(expiryDate.getTime()) ||
            currentDate >= expiryDate
        ) {
            status = "EXPIRED";
        } else if (daysRemaining <= 5) {
            status = "NEAR_EXPIRY";
        } else {
            status = "ACTIVE";
        }

        res.json({
            fullName: user.fullName || user.username,
            email: user.email || "",
            username: user.username,
            passwordChangedAt: user.password_changed_at,
            passwordExpiryDate: user.password_expiry_date,
            daysRemaining: daysRemaining,
            status: status
        });
    } catch (error) {
        console.log(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});

app.post("/api/change-password", requireLogin, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};

        if (
            typeof currentPassword !== "string" ||
            typeof newPassword !== "string" ||
            !currentPassword ||
            !newPassword
        ) {
            return res.status(400).json({
                message: "Current password and new password are required"
            });
        }

        const db = getDatabase();

        const user = await db.collection("users").findOne({
            _id: getUserId(req)
        });

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const currentPasswordCorrect = await bcrypt.compare(
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

        const passwordHistory = await db.collection("password_history")
            .find({
                user_id: user._id
            })
            .toArray();

        for (const oldPassword of passwordHistory) {
            const reused = await bcrypt.compare(
                newPassword,
                oldPassword.password_hash
            );

            if (reused) {
                return res.status(400).json({
                    message: "You cannot reuse a previous password"
                });
            }
        }

        const newPasswordHash = await bcrypt.hash(newPassword, 12);

        const changedAt = new Date();
        const expiryDate = new Date(changedAt);

        expiryDate.setDate(
            expiryDate.getDate() + 30
        );

        await db.collection("password_history").insertOne({
            user_id: user._id,
            password_hash: user.password_hash,
            created_at: changedAt.toISOString()
        });

        await db.collection("users").updateOne(
            {
                _id: user._id
            },
            {
                $set: {
                    password_hash: newPasswordHash,
                    password_changed_at: changedAt.toISOString(),
                    password_expiry_date: expiryDate.toISOString()
                }
            }
        );

        await logSecurityEvent(user._id, "PASSWORD_CHANGED");

        req.session.passwordExpired = false;

        res.json({
            message: "Password changed successfully",
            passwordExpiryDate: expiryDate.toISOString()
        });
    } catch (error) {
        console.log(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});

app.get("/api/security-logs", requireActiveLogin, async (req, res) => {
    try {
        const db = getDatabase();
        const logs = await db.collection("security_logs")
            .find({ user_id: getUserId(req) })
            .sort({ timestamp: -1 })
            .limit(50)
            .toArray();

        res.json({
            logs: logs.map(log => ({
                eventType: log.event_type,
                timestamp: log.timestamp
            }))
        });
    } catch (error) {
        console.log(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});

// Serve frontend static production build
app.use(express.static(path.join(__dirname, "frontend", "dist")));

// SPA fallback for all non-API GET routes
app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api/")) {
        return res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"));
    }
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({ message: "API endpoint not found" });
    }
    next();
});

const PORT = process.env.PORT || 3000;

connectDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch(error => {
        console.log("Failed to start server.");
        console.log(error.message);
    });