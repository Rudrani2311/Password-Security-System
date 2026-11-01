require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

let bcrypt;
try {
    bcrypt = require("bcrypt");
} catch {
    bcrypt = {
        async hash(pw) {
            const salt = crypto.randomBytes(11).toString("base64").replace(/[^a-zA-Z0-9./]/g, ".").slice(0, 22);
            const derived = crypto.scryptSync(String(pw), salt, 24).toString("base64").replace(/[^a-zA-Z0-9./]/g, ".").slice(0, 31);
            return `$2b$10$${salt}${derived}`;
        },
        async compare(pw, hash) {
            if (!hash || !hash.startsWith("$2")) return false;
            const salt = hash.slice(7, 29);
            const expected = hash.slice(29);
            const derived = crypto.scryptSync(String(pw), salt, 24).toString("base64").replace(/[^a-zA-Z0-9./]/g, ".").slice(0, 31);
            return derived === expected;
        }
    };
}

const app = express();
const PORT = process.env.PORT || 5000;
const DEFAULT_ATLAS_URI = [
    "mongodb+srv://",
    "password_app_user:Rudrani123",
    "@passwordsecuritydb.d4qtmqn.mongodb.net/",
    "password_security?appName=PasswordSecurityDB"
].join("");
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || DEFAULT_ATLAS_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "password_security";
const SALT_ROUNDS = 10;

app.use(cors({ origin: "*" }));
app.use(express.json());

const demoSiteDir = path.join(__dirname, "demo-site");
app.use(express.static(demoSiteDir));

app.get("/forgot-password", (req, res) => {
    res.sendFile(path.join(demoSiteDir, "forgot-password.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(demoSiteDir, "index.html"));
});

app.get("/portal", (req, res) => {
    res.sendFile(path.join(demoSiteDir, "portal.html"));
});

const siteSchema = new mongoose.Schema({
    userId: { type: String, default: "default", index: true },
    domain: { type: String, required: true, index: true },
    username: { type: String, default: "" },
    currentPasswordHash: { type: String, default: "" },
    passwordHashHistory: { type: [String], default: [] },
    lastRotatedAt: { type: Date, default: Date.now },
    expiryDays: { type: Number, default: 30 },
    warningThresholdDays: { type: Number, default: 5 }
}, { timestamps: true, collection: "site_credentials" });

const SiteCredential = mongoose.model("SiteCredential", siteSchema);

const historySchema = new mongoose.Schema({
    userId: { type: String, default: "default", index: true },
    domain: { type: String, required: true, index: true },
    username: { type: String, default: "" },
    password_hash: { type: String, required: true },
    created_at: { type: Date, default: Date.now }
}, { collection: "password_history" });

const PasswordHistory = mongoose.model("PasswordHistory", historySchema);

let mongoConnected = false;

mongoose.connect(MONGODB_URI, {
    dbName: MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000
}).then(() => {
    mongoConnected = true;
    console.log(`[PSS] Connected to MongoDB (${MONGODB_DB_NAME})`);
}).catch(err => {
    console.warn(`[PSS] MongoDB error: ${err.message}`);
});

function normalizeDomain(input) {
    if (!input) return "";
    let h = String(input).trim().toLowerCase();
    try {
        if (h.startsWith("http://") || h.startsWith("https://")) h = new URL(h).hostname;
        else if (h.includes("/")) h = h.split("/")[0];
    } catch {}
    return h.replace(/^www\./, "").trim();
}

function getUserId(req) {
    const raw = req.headers["x-pss-user-id"] || (req.query && req.query.userId) || (req.body && req.body.userId) || "default";
    return String(raw).trim() || "default";
}

function calculateStatus(entry) {
    if (!entry || !entry.lastRotatedAt) {
        return { status: "ACTIVE", daysRemaining: 30, daysOverdue: 0, isExpired: false, isNearExpiry: false };
    }
    const now = new Date();
    const lastRotated = new Date(entry.lastRotatedAt);
    const expiryDays = entry.expiryDays || 30;
    const warningDays = entry.warningThresholdDays || 5;
    const expiryDate = new Date(lastRotated.getTime() + expiryDays * 86400000);
    const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000);
    const isExpired = now >= expiryDate || daysRemaining <= 0;
    const isNearExpiry = !isExpired && daysRemaining <= warningDays;

    return {
        status: isExpired ? "EXPIRED" : isNearExpiry ? "NEAR_EXPIRY" : "ACTIVE",
        daysRemaining: isExpired ? 0 : daysRemaining,
        daysOverdue: isExpired ? Math.abs(daysRemaining) : 0,
        isExpired,
        isNearExpiry
    };
}

async function matchesHash(plain, hash) {
    if (!plain || !hash) return false;
    if (hash.startsWith("$2")) {
        try {
            return await bcrypt.compare(plain, hash);
        } catch {
            return false;
        }
    }
    return plain === hash;
}

app.get("/api/health", (req, res) => {
    res.json({
        status: "ONLINE",
        mongoConnected: mongoose.connection.readyState === 1,
        database: MONGODB_DB_NAME
    });
});

app.get("/api/hibp/:prefix", async (req, res) => {
    try {
        const prefix = String(req.params.prefix || "").replace(/[^A-Fa-f0-9]/g, "").slice(0, 5).toUpperCase();
        if (prefix.length !== 5) return res.status(400).send("");
        const r = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
        const text = r.ok ? await r.text() : "";
        res.type("text/plain").send(text);
    } catch {
        res.type("text/plain").send("");
    }
});

app.get("/api/site/:domain", async (req, res) => {
    try {
        const cleanDomain = normalizeDomain(req.params.domain);
        const userId = getUserId(req);
        if (!mongoConnected) return res.json({ managed: false, domain: cleanDomain });
        const site = await SiteCredential.findOne({ userId, domain: cleanDomain }).sort({ updatedAt: -1 }).lean();
        if (!site) return res.json({ managed: false, domain: cleanDomain });
        res.json({
            managed: true,
            domain: cleanDomain,
            site: {
                domain: site.domain,
                username: site.username || "",
                lastRotatedAt: site.lastRotatedAt,
                expiryDays: site.expiryDays || 30,
                updatedAt: site.updatedAt
            },
            status: calculateStatus(site)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/track-site", async (req, res) => {
    try {
        const { domain, username, lastRotatedAt } = req.body || {};
        if (!domain) return res.status(400).json({ error: "domain is required" });
        const cleanDomain = normalizeDomain(domain);
        const userId = getUserId(req);
        const rotationDate = lastRotatedAt ? new Date(lastRotatedAt) : new Date();

        if (!mongoConnected) {
            return res.json({ success: true, domain: cleanDomain });
        }

        const updateFields = { lastRotatedAt: rotationDate };
        if (username) updateFields.username = username;

        const site = await SiteCredential.findOneAndUpdate(
            { userId, domain: cleanDomain },
            { $set: updateFields },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.json({
            success: true,
            domain: cleanDomain,
            status: calculateStatus(site)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/check-reuse", async (req, res) => {
    try {
        const { domain, password } = req.body || {};
        if (!domain || !password) {
            return res.status(400).json({ error: "domain and password are required" });
        }
        const cleanDomain = normalizeDomain(domain);
        const userId = getUserId(req);
        if (!mongoConnected) return res.json({ reused: false, isCurrent: false });

        const site = await SiteCredential.findOne({ userId, domain: cleanDomain }).lean();
        const historyDocs = await PasswordHistory.find({ userId, domain: cleanDomain }).sort({ created_at: -1 }).limit(20).lean();

        let isCurrent = false;
        if (site && site.currentPasswordHash) {
            isCurrent = await matchesHash(password, site.currentPasswordHash);
        }

        const candidateHashes = [
            ...(site && Array.isArray(site.passwordHashHistory) ? site.passwordHashHistory : []),
            ...historyDocs.map(h => h.password_hash)
        ];

        let reused = isCurrent;
        if (!reused) {
            for (const h of candidateHashes) {
                if (await matchesHash(password, h)) {
                    reused = true;
                    break;
                }
            }
        }

        res.json({
            reused,
            isCurrent,
            status: site ? calculateStatus(site) : null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/record-rotation", async (req, res) => {
    try {
        const { domain, username, password, rotatedAt } = req.body || {};
        if (!domain || !password) {
            return res.status(400).json({ error: "domain and password are required" });
        }
        const cleanDomain = normalizeDomain(domain);
        const userId = getUserId(req);
        const rotationDate = rotatedAt ? new Date(rotatedAt) : new Date();
        const saltHash = await bcrypt.hash(String(password), SALT_ROUNDS);

        if (!mongoConnected) {
            return res.json({ success: true, domain: cleanDomain, hash: saltHash });
        }

        let site = await SiteCredential.findOne({ userId, domain: cleanDomain });
        if (!site) {
            site = new SiteCredential({
                userId,
                domain: cleanDomain,
                username: username || "",
                currentPasswordHash: saltHash,
                passwordHashHistory: [saltHash],
                lastRotatedAt: rotationDate
            });
        } else {
            const history = Array.isArray(site.passwordHashHistory) ? [...site.passwordHashHistory] : [];
            history.push(saltHash);
            if (history.length > 15) history.splice(0, history.length - 15);
            site.currentPasswordHash = saltHash;
            site.passwordHashHistory = history;
            site.lastRotatedAt = rotationDate;
            if (username) site.username = username;
        }
        await site.save();

        await PasswordHistory.create({
            userId,
            domain: cleanDomain,
            username: username || site.username || "",
            password_hash: saltHash,
            created_at: rotationDate
        });

        res.json({
            success: true,
            domain: cleanDomain,
            hash: saltHash,
            status: calculateStatus(site)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/update-date", async (req, res) => {
    try {
        const { domain, lastRotatedAt } = req.body || {};
        if (!domain || !lastRotatedAt) return res.status(400).json({ error: "domain and lastRotatedAt are required" });
        const cleanDomain = normalizeDomain(domain);
        const userId = getUserId(req);
        const newDate = new Date(lastRotatedAt);
        if (!mongoConnected) {
            return res.json({ success: true, domain: cleanDomain, status: calculateStatus({ lastRotatedAt: newDate }) });
        }
        await SiteCredential.updateMany(
            { domain: cleanDomain },
            { $set: { lastRotatedAt: newDate } }
        );
        const site = await SiteCredential.findOneAndUpdate(
            { userId, domain: cleanDomain },
            { $set: { lastRotatedAt: newDate } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.json({ success: true, domain: cleanDomain, status: calculateStatus(site) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/sites", async (req, res) => {
    try {
        if (!mongoConnected) return res.json({ sites: [] });
        const userId = getUserId(req);
        const docs = await SiteCredential.find({ userId }).sort({ updatedAt: -1 }).lean();
        const sites = docs.map(doc => ({
            domain: doc.domain,
            username: doc.username || "",
            lastRotatedAt: doc.lastRotatedAt,
            status: calculateStatus(doc)
        }));
        res.json({ sites });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/sites/:domain", async (req, res) => {
    try {
        const cleanDomain = normalizeDomain(req.params.domain);
        const userId = getUserId(req);
        if (mongoConnected) {
            await SiteCredential.deleteMany({ userId, domain: cleanDomain });
            await PasswordHistory.deleteMany({ userId, domain: cleanDomain });
        }
        res.json({ success: true, domain: cleanDomain });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/download-extension", (req, res) => {
    const zipPath = path.join(__dirname, "password-security-extension.zip");
    if (fs.existsSync(zipPath)) {
        const buffer = fs.readFileSync(zipPath);
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", 'attachment; filename="password-security-extension.zip"');
        res.setHeader("Content-Length", buffer.length);
        res.end(buffer);
    } else {
        res.status(404).json({ error: "Extension zip not found" });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`[PSS] Server listening on port ${PORT}`);
});
