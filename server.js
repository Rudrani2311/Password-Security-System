/**
 * Password Security System — Production Backend Server (MongoDB Atlas)
 * Enforces:
 *  - 30-day password expiry tracking per website & account
 *  - 5-day near-expiry warning calculation
 *  - Password reuse prevention via SHA-256 history stored in MongoDB Atlas
 *  - Security audit logging in MongoDB Atlas
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/password_security";
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "password_security";

const DEFAULT_EXPIRY_DAYS = 30;
const DEFAULT_WARNING_DAYS = 5;

// ─── Middleware ────────────────────────────────────────────────────────────

app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// ─── MongoDB Schemas ───────────────────────────────────────────────────────

const siteCredentialSchema = new mongoose.Schema({
    domain: { type: String, required: true, index: true },
    siteName: { type: String, default: "" },
    username: { type: String, default: "" },
    currentPasswordHash: { type: String, default: "" },
    passwordHashHistory: { type: [String], default: [] },
    lastRotatedAt: { type: Date, default: Date.now },
    expiryDays: { type: Number, default: DEFAULT_EXPIRY_DAYS },
    warningThresholdDays: { type: Number, default: DEFAULT_WARNING_DAYS }
}, { timestamps: true, collection: "site_credentials" });

const SiteCredential = mongoose.model("SiteCredential", siteCredentialSchema);

const passwordHistorySchema = new mongoose.Schema({
    domain: { type: String, required: true, index: true },
    username: { type: String, default: "" },
    password_hash: { type: String, required: true },
    created_at: { type: Date, default: Date.now }
}, { collection: "password_history" });

const PasswordHistory = mongoose.model("PasswordHistory", passwordHistorySchema);

const securityLogSchema = new mongoose.Schema({
    domain: { type: String, default: "" },
    username: { type: String, default: "" },
    event_type: { type: String, required: true },
    details: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now }
}, { collection: "security_logs" });

const SecurityLog = mongoose.model("SecurityLog", securityLogSchema);

// ─── MongoDB Connection ────────────────────────────────────────────────────

let mongoConnected = false;

async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI, {
            dbName: MONGODB_DB_NAME,
            serverSelectionTimeoutMS: 8000,
            connectTimeoutMS: 8000
        });
        mongoConnected = true;
        console.log(`[PSS] Connected to MongoDB Atlas (Database: ${MONGODB_DB_NAME})`);
    } catch (err) {
        mongoConnected = false;
        console.warn(`[PSS] MongoDB connection warning: ${err.message}`);
    }
}

mongoose.connection.on("connected", () => { mongoConnected = true; });
mongoose.connection.on("disconnected", () => { mongoConnected = false; });

connectDB();

// ─── Helper Functions ──────────────────────────────────────────────────────

function normalizeDomain(input) {
    if (!input) return "";
    let h = String(input).trim().toLowerCase();
    try {
        if (h.startsWith("http://") || h.startsWith("https://")) {
            h = new URL(h).hostname;
        } else if (h.includes("/")) {
            h = h.split("/")[0];
        }
    } catch {}
    return h.replace(/^www\./, "").trim();
}

function calculateStatus(entry) {
    if (!entry || !entry.lastRotatedAt) {
        return {
            status: "ACTIVE",
            daysRemaining: DEFAULT_EXPIRY_DAYS,
            daysOverdue: 0,
            daysSinceRotation: 0,
            isExpired: false,
            isNearExpiry: false,
            expiryDate: new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 86400000).toISOString(),
            lastRotatedDate: new Date().toISOString()
        };
    }

    const now = new Date();
    const lastRotated = new Date(entry.lastRotatedAt);
    const expiryDays = entry.expiryDays || DEFAULT_EXPIRY_DAYS;
    const warningDays = entry.warningThresholdDays || DEFAULT_WARNING_DAYS;

    const expiryDate = new Date(lastRotated.getTime() + expiryDays * 86400000);
    const msRemaining = expiryDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / 86400000);
    const daysSinceRotation = Math.floor((now.getTime() - lastRotated.getTime()) / 86400000);

    const isExpired = now >= expiryDate || daysRemaining <= 0;
    const isNearExpiry = !isExpired && daysRemaining <= warningDays;

    return {
        status: isExpired ? "EXPIRED" : isNearExpiry ? "NEAR_EXPIRY" : "ACTIVE",
        daysRemaining: isExpired ? 0 : daysRemaining,
        daysOverdue: isExpired ? Math.abs(daysRemaining) : 0,
        daysSinceRotation,
        isExpired,
        isNearExpiry,
        expiryDate: expiryDate.toISOString(),
        lastRotatedDate: lastRotated.toISOString()
    };
}

async function logEvent(domain, username, eventType, details = "") {
    if (!mongoConnected) return;
    try {
        await SecurityLog.create({
            domain: normalizeDomain(domain),
            username: username || "",
            event_type: eventType,
            details,
            timestamp: new Date()
        });
    } catch (e) {
        console.warn("[PSS] Log error:", e.message);
    }
}

// ─── API Routes ────────────────────────────────────────────────────────────

/**
 * GET /api/health
 */
app.get("/api/health", (req, res) => {
    res.json({
        status: "ONLINE",
        service: "Password Security System",
        mongoConnected: mongoose.connection.readyState === 1,
        database: MONGODB_DB_NAME,
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /api/site/:domain
 * Returns the tracked site status and password hash history from MongoDB
 */
app.get("/api/site/:domain", async (req, res) => {
    try {
        const cleanDomain = normalizeDomain(req.params.domain);
        if (!mongoConnected) {
            return res.json({ managed: false, domain: cleanDomain, mongoConnected: false });
        }

        const site = await SiteCredential.findOne({ domain: cleanDomain }).sort({ updatedAt: -1 }).lean();
        if (!site) {
            return res.json({ managed: false, domain: cleanDomain, mongoConnected: true });
        }

        const status = calculateStatus(site);
        res.json({
            managed: true,
            domain: cleanDomain,
            site: {
                id: String(site._id),
                domain: site.domain,
                siteName: site.siteName || site.domain,
                username: site.username || "",
                currentPasswordHash: site.currentPasswordHash || "",
                passwordHashHistory: site.passwordHashHistory || [],
                lastRotatedAt: site.lastRotatedAt,
                expiryDays: site.expiryDays || DEFAULT_EXPIRY_DAYS,
                warningThresholdDays: site.warningThresholdDays || DEFAULT_WARNING_DAYS
            },
            status,
            mongoConnected: true
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/check-reuse
 * Checks if a SHA-256 password hash has been used before on this domain
 * Body: { domain: string, username?: string, passwordHash: string }
 */
app.post("/api/check-reuse", async (req, res) => {
    try {
        const { domain, username, passwordHash } = req.body || {};
        if (!domain || !passwordHash) {
            return res.status(400).json({ error: "domain and passwordHash are required" });
        }

        const cleanDomain = normalizeDomain(domain);

        if (!mongoConnected) {
            return res.json({ reused: false, checked: 0, mongoConnected: false });
        }

        // Check in SiteCredential history array
        const site = await SiteCredential.findOne({ domain: cleanDomain }).lean();
        const inSiteHistory = site && (
            site.currentPasswordHash === passwordHash ||
            (Array.isArray(site.passwordHashHistory) && site.passwordHashHistory.includes(passwordHash))
        );

        // Also check in PasswordHistory collection
        const historyDocs = await PasswordHistory.find({ domain: cleanDomain })
            .sort({ created_at: -1 })
            .limit(20)
            .lean();
        const inHistoryCol = historyDocs.some(h => h.password_hash === passwordHash);

        const reused = Boolean(inSiteHistory || inHistoryCol);
        if (reused) {
            await logEvent(cleanDomain, username, "PASSWORD_REUSE_BLOCKED", "Attempted to reuse a previous password");
        }

        res.json({
            reused,
            checked: historyDocs.length + (site && site.passwordHashHistory ? site.passwordHashHistory.length : 0),
            mongoConnected: true
        });
    } catch (err) {
        console.error("[PSS] check-reuse error:", err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/record-rotation
 * Saves a newly set/rotated password hash and resets the 30-day timer in MongoDB
 * Body: { domain, siteName, username, passwordHash, rotatedAt }
 */
app.post("/api/record-rotation", async (req, res) => {
    try {
        const { domain, siteName, username, passwordHash, rotatedAt } = req.body || {};
        if (!domain || !passwordHash) {
            return res.status(400).json({ error: "domain and passwordHash are required" });
        }

        const cleanDomain = normalizeDomain(domain);
        const rotationDate = rotatedAt ? new Date(rotatedAt) : new Date();

        if (!mongoConnected) {
            return res.json({
                success: true,
                domain: cleanDomain,
                mongoConnected: false
            });
        }

        let site = await SiteCredential.findOne({ domain: cleanDomain });
        if (!site) {
            site = new SiteCredential({
                domain: cleanDomain,
                siteName: siteName || cleanDomain,
                username: username || "",
                currentPasswordHash: passwordHash,
                passwordHashHistory: [passwordHash],
                lastRotatedAt: rotationDate,
                expiryDays: DEFAULT_EXPIRY_DAYS,
                warningThresholdDays: DEFAULT_WARNING_DAYS
            });
        } else {
            const history = Array.isArray(site.passwordHashHistory) ? [...site.passwordHashHistory] : [];
            if (site.currentPasswordHash && !history.includes(site.currentPasswordHash)) {
                history.push(site.currentPasswordHash);
            }
            if (!history.includes(passwordHash)) {
                history.push(passwordHash);
            }
            if (history.length > 15) {
                history.splice(0, history.length - 15);
            }

            site.currentPasswordHash = passwordHash;
            site.passwordHashHistory = history;
            site.lastRotatedAt = rotationDate;
            if (username) site.username = username;
            if (siteName) site.siteName = siteName;
        }

        await site.save();

        await PasswordHistory.create({
            domain: cleanDomain,
            username: username || site.username || "",
            password_hash: passwordHash,
            created_at: rotationDate
        });

        await logEvent(cleanDomain, username || site.username, "PASSWORD_ROTATED", "Password rotated and 30-day policy timer reset");

        const status = calculateStatus(site);

        res.json({
            success: true,
            domain: cleanDomain,
            site: {
                id: String(site._id),
                domain: site.domain,
                siteName: site.siteName,
                username: site.username,
                currentPasswordHash: site.currentPasswordHash,
                passwordHashHistory: site.passwordHashHistory,
                lastRotatedAt: site.lastRotatedAt,
                expiryDays: site.expiryDays,
                warningThresholdDays: site.warningThresholdDays
            },
            status,
            mongoConnected: true
        });
    } catch (err) {
        console.error("[PSS] record-rotation error:", err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/update-date
 * Updates lastRotatedAt for a tracked domain (used by automated expiry/warning tests or admin)
 * Body: { domain, lastRotatedAt }
 */
app.post("/api/update-date", async (req, res) => {
    try {
        const { domain, lastRotatedAt } = req.body || {};
        if (!domain || !lastRotatedAt) {
            return res.status(400).json({ error: "domain and lastRotatedAt are required" });
        }
        const cleanDomain = normalizeDomain(domain);
        if (!mongoConnected) {
            return res.json({ success: true, domain: cleanDomain, mongoConnected: false });
        }
        const site = await SiteCredential.findOneAndUpdate(
            { domain: cleanDomain },
            { $set: { lastRotatedAt: new Date(lastRotatedAt) } },
            { new: true }
        );
        if (!site) {
            return res.status(404).json({ error: "Site not found" });
        }
        res.json({
            success: true,
            domain: cleanDomain,
            status: calculateStatus(site)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/history/:domain
 */
app.get("/api/history/:domain", async (req, res) => {
    try {
        const cleanDomain = normalizeDomain(req.params.domain);
        if (!mongoConnected) {
            return res.json({ domain: cleanDomain, history: [], mongoConnected: false });
        }
        const history = await PasswordHistory.find({ domain: cleanDomain })
            .sort({ created_at: -1 })
            .limit(20)
            .lean();
        res.json({ domain: cleanDomain, history });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/sites
 * Returns all tracked sites with their calculated status
 */
app.get("/api/sites", async (req, res) => {
    try {
        if (!mongoConnected) {
            return res.json({ sites: [], mongoConnected: false });
        }
        const docs = await SiteCredential.find().sort({ updatedAt: -1 }).lean();
        const sites = docs.map(doc => ({
            id: String(doc._id),
            domain: doc.domain,
            siteName: doc.siteName || doc.domain,
            username: doc.username || "",
            currentPasswordHash: doc.currentPasswordHash || "",
            passwordHashHistory: doc.passwordHashHistory || [],
            lastRotatedAt: doc.lastRotatedAt,
            expiryDays: doc.expiryDays || DEFAULT_EXPIRY_DAYS,
            warningThresholdDays: doc.warningThresholdDays || DEFAULT_WARNING_DAYS,
            status: calculateStatus(doc)
        }));
        res.json({ sites, mongoConnected: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/sites/:domain
 */
app.delete("/api/sites/:domain", async (req, res) => {
    try {
        const cleanDomain = normalizeDomain(req.params.domain);
        if (mongoConnected) {
            await SiteCredential.deleteMany({ domain: cleanDomain });
            await PasswordHistory.deleteMany({ domain: cleanDomain });
        }
        res.json({ success: true, domain: cleanDomain });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /download-extension
 * Serves the packaged Chrome extension zip so any user on any machine can download it
 */
app.get("/download-extension", (req, res) => {
    const zipPath = path.join(__dirname, "password-security-extension.zip");
    if (fs.existsSync(zipPath)) {
        const buffer = fs.readFileSync(zipPath);
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", 'attachment; filename="password-security-extension.zip"');
        res.setHeader("Content-Length", buffer.length);
        res.end(buffer);
    } else {
        res.status(404).json({ error: "Extension zip package not found" });
    }
});

// Root status / download page
app.get("/", (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Password Security System — Cloud Backend</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 48px 20px; display: flex; justify-content: center; }
        .card { max-width: 680px; width: 100%; background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; box-shadow: 0 20px 50px rgba(0,0,0,0.4); }
        h1 { margin: 0 0 8px 0; font-size: 24px; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; background: ${mongoConnected ? "#065f46" : "#92400e"}; color: ${mongoConnected ? "#6ee7b7" : "#fef3c7"}; margin-bottom: 20px; }
        p { color: #cbd5e1; line-height: 1.6; font-size: 14px; }
        .btn { display: inline-block; background: #3b82f6; color: #fff; text-decoration: none; padding: 12px 22px; border-radius: 10px; font-weight: 600; font-size: 14px; margin-top: 12px; }
        .endpoints { background: #0f172a; border-radius: 10px; padding: 16px; margin-top: 24px; font-family: monospace; font-size: 12px; color: #94a3b8; line-height: 1.8; }
    </style>
</head>
<body>
    <div class="card">
        <div class="badge">${mongoConnected ? "● MONGODB ATLAS CONNECTED" : "● STARTING / CONNECTING"}</div>
        <h1>🛡️ Password Security System</h1>
        <p>Universal Browser Extension Backend enforcing 30-day password expiry, 5-day near-expiry warnings, MongoDB password history reuse prevention, complexity requirements, and HaveIBeenPwned dark-web breach detection on any website.</p>
        <a class="btn" href="/download-extension">⬇ Download Browser Extension (.zip)</a>
        <div class="endpoints">
            GET  /api/health<br>
            GET  /api/sites<br>
            GET  /api/site/:domain<br>
            POST /api/check-reuse<br>
            POST /api/record-rotation<br>
            GET  /api/history/:domain
        </div>
    </div>
</body>
</html>`);
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`
🛡️  Password Security System — Production Server
─────────────────────────────────────────────────────
🌐 URL:       http://localhost:${PORT}
🗄  Database:  ${MONGODB_DB_NAME} (MongoDB Atlas)
─────────────────────────────────────────────────────
`);
});
