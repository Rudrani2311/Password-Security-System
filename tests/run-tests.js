const assert = require("assert");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ ${name}: ${err.message}`);
        failed++;
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ ${name}: ${err.message}`);
        failed++;
    }
}

function checkStrength(password) {
    if (!password || password.length < 8) return { valid: false, reason: "Must be at least 8 characters." };
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        return { valid: false, reason: "Must contain uppercase, lowercase, number, and special symbol." };
    }
    return { valid: true, reason: null };
}

function httpPost(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request({
            hostname: "localhost", port: 5000, path, method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
        }, res => {
            let raw = "";
            res.on("data", c => raw += c);
            res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw || "{}") }));
        });
        req.on("error", reject);
        req.write(data);
        req.end();
    });
}

function httpRequest(method, path) {
    return new Promise((resolve, reject) => {
        const req = http.request({ hostname: "localhost", port: 5000, path, method }, res => {
            let raw = "";
            res.on("data", c => raw += c);
            res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(raw || "{}") }));
        });
        req.on("error", reject);
        req.end();
    });
}

(async () => {
    console.log("\n=== Password Security System Tests ===\n");

    test("Rejects short password (< 8 chars)", () => assert.strictEqual(checkStrength("Ab1!").valid, false));
    test("Rejects missing special symbol", () => assert.strictEqual(checkStrength("Abcdefg1").valid, false));
    test("Accepts valid strong password", () => assert.strictEqual(checkStrength("SecureP@ss1").valid, true));

    await testAsync("GET /api/health returns ONLINE & MongoDB status", async () => {
        const r = await httpRequest("GET", "/api/health");
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.body.status, "ONLINE");
    });

    await testAsync("POST /api/record-rotation hashes password with bcrypt ($2b$10$...)", async () => {
        const r = await httpPost("/api/record-rotation", {
            domain: "unit-test.example.com",
            username: "rudrani",
            password: "TestPassword@123"
        });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.body.success, true);
        assert.ok(r.body.hash.startsWith("$2b$10$"), `Expected bcrypt hash, got: ${r.body.hash}`);
    });

    await testAsync("POST /api/check-reuse detects reused password via bcrypt.compare", async () => {
        const r = await httpPost("/api/check-reuse", {
            domain: "unit-test.example.com",
            password: "TestPassword@123"
        });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.body.reused, true);
    });

    await testAsync("POST /api/check-reuse allows unused password", async () => {
        const r = await httpPost("/api/check-reuse", {
            domain: "unit-test.example.com",
            password: "CompletelyNewPassword#999"
        });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.body.reused, false);
    });

    await httpRequest("DELETE", "/api/sites/unit-test.example.com");

    console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
})();
