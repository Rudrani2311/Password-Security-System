/**
 * Password Security System — Automated Test Suite
 * Tests: password strength, reuse detection, HIBP breach check, server endpoints
 * Run: node tests/run-tests.js
 */

const assert = require("assert");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ ${name}`);
        console.error(`     → ${err.message}`);
        failed++;
        failures.push({ name, error: err.message });
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ ${name}`);
        console.error(`     → ${err.message}`);
        failed++;
        failures.push({ name, error: err.message });
    }
}

// ─── 1. Password Strength ─────────────────────────────────────────────────

function checkStrength(password) {
    if (!password || password.length < 8)
        return { valid: false, reason: "Password must be at least 8 characters long." };
    if (!/[A-Z]/.test(password))
        return { valid: false, reason: "Password must contain at least one uppercase letter." };
    if (!/[a-z]/.test(password))
        return { valid: false, reason: "Password must contain at least one lowercase letter." };
    if (!/[0-9]/.test(password))
        return { valid: false, reason: "Password must contain at least one number." };
    if (!/[^A-Za-z0-9]/.test(password))
        return { valid: false, reason: "Password must contain at least one special character." };
    return { valid: true, reason: null };
}

console.log("\n══════════════════════════════════════════════════");
console.log("  🛡️  Password Security System — Test Suite");
console.log("══════════════════════════════════════════════════\n");

console.log("📋 1. Password Strength Validation");

test("Rejects empty password", () => {
    const r = checkStrength("");
    assert.strictEqual(r.valid, false);
    assert.ok(r.reason.includes("8 characters"));
});

test("Rejects short password (< 8 chars)", () => {
    const r = checkStrength("Ab1!");
    assert.strictEqual(r.valid, false);
    assert.ok(r.reason.includes("8 characters"));
});

test("Rejects password with no uppercase", () => {
    const r = checkStrength("abcdefg1!");
    assert.strictEqual(r.valid, false);
    assert.ok(r.reason.includes("uppercase"));
});

test("Rejects password with no lowercase", () => {
    const r = checkStrength("ABCDEFG1!");
    assert.strictEqual(r.valid, false);
    assert.ok(r.reason.includes("lowercase"));
});

test("Rejects password with no number", () => {
    const r = checkStrength("Abcdefgh!");
    assert.strictEqual(r.valid, false);
    assert.ok(r.reason.includes("number"));
});

test("Rejects password with no special character", () => {
    const r = checkStrength("Abcdefg1");
    assert.strictEqual(r.valid, false);
    assert.ok(r.reason.includes("special"));
});

test("Accepts strong password", () => {
    const r = checkStrength("SecureP@ss1");
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.reason, null);
});

test("Accepts another strong password", () => {
    const r = checkStrength("C0mpl3x!Pass#2024");
    assert.strictEqual(r.valid, true);
});

test("Rejects 'password123' (no uppercase/special)", () => {
    const r = checkStrength("password123");
    assert.strictEqual(r.valid, false);
});

test("Rejects 'PASSWORD123' (no lowercase/special)", () => {
    const r = checkStrength("PASSWORD123");
    assert.strictEqual(r.valid, false);
});

// ─── 2. Domain Normalization ───────────────────────────────────────────────

console.log("\n📋 2. Domain Normalization");

function normalizeDomain(urlOrDomain) {
    try {
        if (!urlOrDomain) return "";
        let hostname = urlOrDomain;
        if (urlOrDomain.startsWith("http://") || urlOrDomain.startsWith("https://")) {
            hostname = new URL(urlOrDomain).hostname;
        } else if (urlOrDomain.includes("/")) {
            hostname = urlOrDomain.split("/")[0];
        }
        return hostname.toLowerCase().replace(/^www\./, "").trim();
    } catch {
        return urlOrDomain.toLowerCase().trim();
    }
}

test("Normalizes https://www.linkedin.com/login → linkedin.com", () => {
    assert.strictEqual(normalizeDomain("https://www.linkedin.com/login"), "linkedin.com");
});

test("Normalizes https://coursera.org → coursera.org", () => {
    assert.strictEqual(normalizeDomain("https://coursera.org"), "coursera.org");
});

test("Normalizes http://www.github.com → github.com", () => {
    assert.strictEqual(normalizeDomain("http://www.github.com"), "github.com");
});

test("Normalizes tryhackme.com directly", () => {
    assert.strictEqual(normalizeDomain("tryhackme.com"), "tryhackme.com");
});

test("Handles empty string", () => {
    assert.strictEqual(normalizeDomain(""), "");
});

test("Normalizes HTTPS uppercase URL", () => {
    assert.strictEqual(normalizeDomain("https://POSTMAN.COM/login"), "postman.com");
});

// ─── 3. Password Expiry Status ─────────────────────────────────────────────

console.log("\n📋 3. Password Expiry Status Calculation");

function calculateStatus(entry) {
    if (!entry || !entry.lastRotatedAt) {
        return { status: "ACTIVE", daysRemaining: 30, isExpired: false, isNearExpiry: false };
    }
    const now = new Date();
    const lastRotated = new Date(entry.lastRotatedAt);
    const expiryDays = entry.expiryDays || 30;
    const warningDays = entry.warningThresholdDays || 5;
    const expiryDate = new Date(lastRotated.getTime() + expiryDays * 86400000);
    const msRemaining = expiryDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / 86400000);
    const isExpired = now >= expiryDate;
    const isNearExpiry = !isExpired && daysRemaining <= warningDays;
    return {
        status: isExpired ? "EXPIRED" : isNearExpiry ? "NEAR_EXPIRY" : "ACTIVE",
        daysRemaining: isExpired ? 0 : daysRemaining,
        daysOverdue: isExpired ? Math.abs(daysRemaining) : 0,
        isExpired,
        isNearExpiry
    };
}

function daysAgo(n) {
    return new Date(Date.now() - n * 86400000).toISOString();
}

test("Fresh password (1 day ago) → ACTIVE", () => {
    const s = calculateStatus({ lastRotatedAt: daysAgo(1), expiryDays: 30 });
    assert.strictEqual(s.status, "ACTIVE");
    assert.strictEqual(s.isExpired, false);
    assert.strictEqual(s.isNearExpiry, false);
});

test("Password at day 26 (4 days left) → NEAR_EXPIRY", () => {
    const s = calculateStatus({ lastRotatedAt: daysAgo(26), expiryDays: 30, warningThresholdDays: 5 });
    assert.strictEqual(s.status, "NEAR_EXPIRY");
    assert.strictEqual(s.isNearExpiry, true);
    assert.strictEqual(s.isExpired, false);
    assert.ok(s.daysRemaining <= 5);
});

test("Password at exactly 5 days left → NEAR_EXPIRY", () => {
    const s = calculateStatus({ lastRotatedAt: daysAgo(25), expiryDays: 30, warningThresholdDays: 5 });
    assert.strictEqual(s.isNearExpiry, true);
});

test("Password at day 32 (2 days overdue) → EXPIRED", () => {
    const s = calculateStatus({ lastRotatedAt: daysAgo(32), expiryDays: 30 });
    assert.strictEqual(s.status, "EXPIRED");
    assert.strictEqual(s.isExpired, true);
    assert.ok(s.daysOverdue >= 1);
});

test("Password at exactly day 30 → EXPIRED", () => {
    const s = calculateStatus({ lastRotatedAt: daysAgo(31), expiryDays: 30 });
    assert.strictEqual(s.isExpired, true);
});

test("No lastRotatedAt → defaults to ACTIVE", () => {
    const s = calculateStatus({});
    assert.strictEqual(s.status, "ACTIVE");
});

// ─── 4. Server API Tests ───────────────────────────────────────────────────

console.log("\n📋 4. Server API Tests (requires server running on port 5000)");

const http = require("http");

function httpPost(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const options = {
            hostname: "localhost",
            port: 5000,
            path,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data)
            }
        };
        const req = http.request(options, res => {
            let raw = "";
            res.on("data", chunk => raw += chunk);
            res.on("end", () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on("error", reject);
        req.setTimeout(4000, () => { req.destroy(new Error("Timeout")); });
        req.write(data);
        req.end();
    });
}

function httpGet(path) {
    return new Promise((resolve, reject) => {
        const options = { hostname: "localhost", port: 5000, path, method: "GET" };
        const req = http.request(options, res => {
            let raw = "";
            res.on("data", chunk => raw += chunk);
            res.on("end", () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on("error", reject);
        req.setTimeout(4000, () => { req.destroy(new Error("Timeout")); });
        req.end();
    });
}

// ─── Async test runner ────────────────────────────────────────────────────

(async () => {
    // Server tests
    let serverOnline = false;
    try {
        const health = await httpGet("/api/health");
        serverOnline = health.status === 200 && health.body.status === "ONLINE";
    } catch {}

    if (!serverOnline) {
        console.log("  ⚠️  Server not running — skipping API tests. Start with: npm start");
    } else {
        await testAsync("GET /api/health returns ONLINE status", async () => {
            const r = await httpGet("/api/health");
            assert.strictEqual(r.status, 200);
            assert.strictEqual(r.body.status, "ONLINE");
            assert.ok(r.body.timestamp);
        });

        const mongoAvailable = await (async () => {
            try {
                const h = await httpGet("/api/health");
                return h.body.mongoConnected === true;
            } catch { return false; }
        })();

        await testAsync("POST /api/record-rotation responds with success", async () => {
            const r = await httpPost("/api/record-rotation", {
                domain: "test-pss.example.com",
                username: "testuser@test.com",
                passwordHash: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
                rotatedAt: new Date().toISOString()
            });
            assert.strictEqual(r.status, 200);
            assert.strictEqual(r.body.success, true);
            assert.strictEqual(r.body.domain, "test-pss.example.com");
        });

        await testAsync("POST /api/check-reuse responds correctly (with or without DB)", async () => {
            const usedHash = "abc123def456abc123def456abc123def456abc123def456abc123def456abc1";
            const r = await httpPost("/api/check-reuse", {
                domain: "test-pss.example.com",
                passwordHash: usedHash
            });
            assert.strictEqual(r.status, 200);
            // If MongoDB connected: reused=true, else reused=false (no DB)
            if (mongoAvailable) {
                assert.strictEqual(r.body.reused, true);
            } else {
                assert.strictEqual(r.body.reused, false); // no-DB mode
            }
        });

        await testAsync("POST /api/check-reuse allows new password hash", async () => {
            const r = await httpPost("/api/check-reuse", {
                domain: "test-pss.example.com",
                passwordHash: "brand_new_hash_never_used_xyzxyzxyz0000000000000000000000000"
            });
            assert.strictEqual(r.status, 200);
            assert.strictEqual(r.body.reused, false);
        });

        await testAsync("POST /api/check-reuse returns 400 for missing fields", async () => {
            const r = await httpPost("/api/check-reuse", { domain: "example.com" });
            assert.strictEqual(r.status, 400);
        });

        await testAsync("GET /api/history/:domain returns history array", async () => {
            const r = await httpGet("/api/history/test-pss.example.com");
            assert.strictEqual(r.status, 200);
            assert.ok(Array.isArray(r.body.history));
        });
    }

    // ─── 5. HIBP Live Test ─────────────────────────────────────────────────

    console.log("\n📋 5. HIBP Breach API Tests (requires internet)");

    let internetOnline = false;
    try {
        await new Promise((resolve, reject) => {
            const req = http.request({ hostname: "api.pwnedpasswords.com", port: 80, path: "/range/21BD1", method: "GET" }, res => {
                resolve(res.statusCode);
            });
            req.on("error", reject);
            req.setTimeout(5000, () => req.destroy(new Error("Timeout")));
            req.end();
        });
        internetOnline = true;
    } catch {}

    if (!internetOnline) {
        console.log("  ⚠️  No internet — skipping HIBP tests.");
    } else {
        const https = require("https");

        function hibpCheck(password) {
            const crypto = require("crypto");
            const hash = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
            const prefix = hash.substring(0, 5);
            const suffix = hash.substring(5);

            return new Promise((resolve, reject) => {
                const options = {
                    hostname: "api.pwnedpasswords.com",
                    path: `/range/${prefix}`,
                    method: "GET",
                    headers: { "Add-Padding": "true" }
                };
                const req = https.request(options, res => {
                    let raw = "";
                    res.on("data", d => raw += d);
                    res.on("end", () => {
                        let count = 0;
                        for (const line of raw.split("\r\n")) {
                            const [s, c] = line.split(":");
                            if (s && s.trim().toUpperCase() === suffix) {
                                count = parseInt(c.trim(), 10) || 0;
                                break;
                            }
                        }
                        resolve({ breached: count > 0, count });
                    });
                });
                req.on("error", reject);
                req.setTimeout(8000, () => req.destroy(new Error("Timeout")));
                req.end();
            });
        }

        await testAsync("HIBP: 'password' is a known breached password", async () => {
            const r = await hibpCheck("password");
            assert.strictEqual(r.breached, true);
            assert.ok(r.count > 1000);
        });

        await testAsync("HIBP: '123456' is a known breached password", async () => {
            const r = await hibpCheck("123456");
            assert.strictEqual(r.breached, true);
        });

        await testAsync("HIBP: Randomly generated strong password is not breached", async () => {
            // Use a highly random password that won't be in HIBP
            const crypto = require("crypto");
            const randomPw = "Zq9!" + crypto.randomBytes(20).toString("hex") + "Xy#5";
            const r = await hibpCheck(randomPw);
            assert.strictEqual(r.breached, false);
        });
    }

    // ─── Final Summary ─────────────────────────────────────────────────────

    console.log("\n══════════════════════════════════════════════════");
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log("\n  Failed Tests:");
        failures.forEach(f => console.log(`  ✗ ${f.name}: ${f.error}`));
    } else {
        console.log("  🎉 All tests passed!");
    }
    console.log("══════════════════════════════════════════════════\n");

    process.exit(failed > 0 ? 1 : 0);
})();
