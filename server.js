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

        const [site, historyDocs] = await Promise.all([
            SiteCredential.findOne({ userId, domain: cleanDomain }).lean(),
            PasswordHistory.find({ userId, domain: cleanDomain }).sort({ created_at: -1 }).limit(8).lean()
        ]);

        let isCurrent = false;
        if (site && site.currentPasswordHash) {
            isCurrent = await matchesHash(password, site.currentPasswordHash);
        }

        const candidateHashes = [...new Set([
            ...(site && Array.isArray(site.passwordHashHistory) ? site.passwordHashHistory.slice(-6) : []),
            ...historyDocs.map(h => h.password_hash)
        ])].slice(0, 6);

        let reused = isCurrent;
        if (!reused) {
            for (const h of candidateHashes) {
                if (site && h === site.currentPasswordHash) continue;
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

function buildExtensionZipBuffer(dirPath) {
    const files = [];
    function walk(currentDir, relBase) {
        for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
            const fullPath = path.join(currentDir, entry.name);
            const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(fullPath, relPath);
            else files.push({ name: Buffer.from(relPath, "utf8"), data: fs.readFileSync(fullPath) });
        }
    }
    walk(dirPath, "");

    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        crcTable[n] = c >>> 0;
    }
    function crc32(buf) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const f of files) {
        const crc = crc32(f.data);
        const size = f.data.length;
        const nameLen = f.name.length;

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(size, 18);
        localHeader.writeUInt32LE(size, 22);
        localHeader.writeUInt16LE(nameLen, 26);

        localParts.push(localHeader, f.name, f.data);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(size, 20);
        centralHeader.writeUInt32LE(size, 24);
        centralHeader.writeUInt16LE(nameLen, 28);
        centralHeader.writeUInt32LE(offset, 42);

        centralParts.push(centralHeader, f.name);
        offset += 30 + nameLen + size;
    }

    const centralBuffer = Buffer.concat(centralParts);
    const endRecord = Buffer.alloc(22);
    endRecord.writeUInt32LE(0x06054b50, 0);
    endRecord.writeUInt16LE(files.length, 8);
    endRecord.writeUInt16LE(files.length, 10);
    endRecord.writeUInt32LE(centralBuffer.length, 12);
    endRecord.writeUInt32LE(offset, 16);

    return Buffer.concat([...localParts, centralBuffer, endRecord]);
}

const DEMO_STYLE_CSS = `* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    font-family: "Times New Roman", Times, serif;
    color: #0d2a54;
}
body {
    background-color: #e3effc;
    min-height: 100vh;
    padding: 150px 20px 40px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
}
.single-layout {
    width: 100%;
    max-width: 390px;
}
.card {
    background-color: #f3f8fe;
    border: 1px solid #b6d0ee;
    border-radius: 8px;
    padding: 24px 26px;
    box-shadow: 0 4px 14px rgba(13, 42, 84, 0.08);
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.card-title {
    font-size: 22px;
    font-weight: bold;
    color: #0d2a54;
}
form {
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
label {
    font-size: 15px;
    font-weight: bold;
    color: #0d2a54;
}
.link-btn {
    font-size: 14px;
    color: #143a6e;
    text-decoration: underline;
    background: none;
    border: none;
    cursor: pointer;
}
input[type="email"],
input[type="text"],
input[type="password"] {
    width: 100%;
    background-color: #ffffff;
    border: 1px solid #9abbe0;
    border-radius: 5px;
    padding: 9px 11px;
    font-size: 15px;
    color: #0d2a54;
    outline: none;
    font-family: "Times New Roman", Times, serif;
}
input:focus {
    border-color: #143a6e;
}
.primary-btn {
    width: 100%;
    background-color: #143a6e;
    color: #ffffff;
    border: 1px solid #143a6e;
    border-radius: 5px;
    padding: 10px 14px;
    font-size: 15px;
    font-weight: bold;
    cursor: pointer;
    text-align: center;
    text-decoration: none;
    display: inline-block;
}
.primary-btn:hover {
    background-color: #0f2d57;
}
.expiry-options {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid #cfe1f5;
}
.secondary-btn {
    width: 100%;
    background-color: #d7e8fb;
    color: #0d2a54;
    border: 1px solid #9abbe0;
    border-radius: 5px;
    padding: 8px 6px;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    text-align: center;
}
.secondary-btn:hover,
.secondary-btn.active-option {
    background-color: #143a6e;
    color: #ffffff;
    border-color: #143a6e;
}
.footer-row {
    font-size: 14px;
    text-align: center;
    padding-top: 6px;
    border-top: 1px solid #cfe1f5;
}`;

const DEMO_SCRIPT_JS = `(function () {
    const pwInput = document.getElementById("demo-password");
    const userInput = document.getElementById("demo-username");
    const loginForm = document.getElementById("demo-login-form");
    const resetForm = document.getElementById("reset-password-form");
    const newPwInput = document.getElementById("new-password-input");

    if (loginForm && pwInput) {
        loginForm.addEventListener("submit", () => {
            if (pwInput.value) {
                localStorage.setItem("pss_demo_last_pw", pwInput.value);
            }
        });
    }

    if (resetForm && newPwInput) {
        resetForm.addEventListener("submit", () => {
            if (newPwInput.value) {
                localStorage.setItem("pss_demo_last_pw", newPwInput.value);
            }
        });
    }

    const btnActive = document.getElementById("btn-sim-active");
    const btn5Days = document.getElementById("btn-sim-5days");
    const btnExpired = document.getElementById("btn-sim-expired");
    const allBtns = [btnActive, btn5Days, btnExpired].filter(Boolean);

    function setActiveBtn(btn) {
        allBtns.forEach(b => b.classList.remove("active-option"));
        if (btn) btn.classList.add("active-option");
    }

    function setDaysState(daysRemaining, btn) {
        setActiveBtn(btn);
        const trackedPw = (pwInput && pwInput.value) || localStorage.getItem("pss_demo_last_pw") || "Rudrani#2026$Valid!";
        const daysElapsed = 30 - daysRemaining;
        const rotatedAt = new Date(Date.now() - daysElapsed * 86400000).toISOString();

        fetch("/api/update-date", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                domain: window.location.hostname,
                lastRotatedAt: rotatedAt
            })
        }).catch(() => {});

        window.postMessage({
            source: "PSS_DEMO_PAGE",
            action: "DEMO_SET_STATE",
            mode: "SET_DAYS",
            daysRemaining,
            password: trackedPw,
            username: userInput ? userInput.value : "24bcs10304@cuchd.in"
        }, "*");

        if (pwInput && !pwInput.value) {
            pwInput.value = trackedPw;
        }
    }

    if (btnActive) btnActive.addEventListener("click", () => setDaysState(30, btnActive));
    if (btn5Days) btn5Days.addEventListener("click", () => setDaysState(5, btn5Days));
    if (btnExpired) btnExpired.addEventListener("click", () => setDaysState(0, btnExpired));
})();`;

const DEMO_LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign in</title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <div class="single-layout">
        <div class="card">
            <h1 class="card-title">Sign in</h1>
            <form id="demo-login-form" action="/portal.html" method="GET">
                <div class="form-group">
                    <label for="demo-username">Email:</label>
                    <input type="email" id="demo-username" name="email" value="24bcs10304@cuchd.in" required autocomplete="username">
                </div>
                <div class="form-group">
                    <div class="label-row">
                        <label for="demo-password">Password:</label>
                        <a href="/forgot-password.html" class="link-btn" id="link-forgot-password">Forgot password</a>
                    </div>
                    <input type="password" id="demo-password" placeholder="Enter password" required autocomplete="current-password">
                </div>
                <button type="submit" class="primary-btn" id="btn-login-submit">Log in</button>
            </form>
            <div class="expiry-options">
                <button type="button" class="secondary-btn" id="btn-sim-active" data-pss-ignore="1">Reset to 30 days</button>
                <button type="button" class="secondary-btn" id="btn-sim-5days" data-pss-ignore="1">5 days</button>
                <button type="button" class="secondary-btn" id="btn-sim-expired" data-pss-ignore="1">Expired</button>
            </div>
        </div>
    </div>
    <script src="/script.js"></script>
</body>
</html>`;

const DEMO_FORGOT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forgot password</title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <div class="single-layout">
        <div class="card">
            <h1 class="card-title">Forgot password</h1>
            <form id="reset-password-form" action="/index.html" method="GET">
                <div class="form-group">
                    <label for="reset-email">Email:</label>
                    <input type="email" id="reset-email" value="24bcs10304@cuchd.in" required autocomplete="username">
                </div>
                <div class="form-group">
                    <label for="new-password-input">New password:</label>
                    <input type="password" id="new-password-input" placeholder="Enter new password" required autocomplete="new-password">
                </div>
                <button type="submit" class="primary-btn" id="btn-update-password">Update password</button>
            </form>
            <div class="footer-row">
                <a href="/index.html" class="link-btn">Back to sign in</a>
            </div>
        </div>
    </div>
    <script src="/script.js"></script>
</body>
</html>`;

const DEMO_PORTAL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Logged in</title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <div class="single-layout">
        <div class="card">
            <h1 class="card-title" id="logged-in-ok">Logged in</h1>
            <a href="/index.html" class="primary-btn">Log out</a>
        </div>
    </div>
</body>
</html>`;

app.get(["/", "/index.html", "/login"], (req, res) => {
    res.type("text/html").send(DEMO_LOGIN_HTML);
});

app.get(["/forgot-password", "/forgot-password.html"], (req, res) => {
    res.type("text/html").send(DEMO_FORGOT_HTML);
});

app.get(["/portal", "/portal.html"], (req, res) => {
    res.type("text/html").send(DEMO_PORTAL_HTML);
});

app.get("/style.css", (req, res) => {
    res.type("text/css").send(DEMO_STYLE_CSS);
});

app.get("/script.js", (req, res) => {
    res.type("application/javascript").send(DEMO_SCRIPT_JS);
});

app.get("/download-extension", (req, res) => {
    try {
        const extDir = path.join(__dirname, "extension");
        const buffer = buildExtensionZipBuffer(extDir);
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", 'attachment; filename="password-security-extension.zip"');
        res.setHeader("Content-Length", buffer.length);
        res.end(buffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`[PSS] Server listening on port ${PORT}`);
});
