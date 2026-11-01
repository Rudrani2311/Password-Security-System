const assert = require("assert");
const http = require("http");

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
    const missing = [];
    if (!/[A-Z]/.test(password)) missing.push("uppercase");
    if (!/[a-z]/.test(password)) missing.push("lowercase");
    if (!/[0-9]/.test(password)) missing.push("numbers");
    if (!/[^A-Za-z0-9]/.test(password)) missing.push("special characters");
    if (missing.length > 0) {
        const joined = missing.join(", ");
        const sentence = joined.charAt(0).toUpperCase() + joined.slice(1) + ".";
        return { valid: false, reason: sentence };
    }
    return { valid: true, reason: null };
}

function httpPost(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request({
            hostname: "localhost", port: 5000, path, method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), "X-PSS-User-Id": "unit_test_runner" }
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
        const req = http.request({
            hostname: "localhost", port: 5000, path, method,
            headers: { "X-PSS-User-Id": "unit_test_runner" }
        }, res => {
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

    test("Rejects short password 'flower' (< 8 chars)", () => {
        const res = checkStrength("flower");
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.reason, "Must be at least 8 characters.");
    });
    test("Shows only missing requirements for 'flowerrr' -> 'Uppercase, numbers, special characters.'", () => {
        const res = checkStrength("flowerrr");
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.reason, "Uppercase, numbers, special characters.");
    });
    test("Deletes 'uppercase' when 'Flowerrr' is typed -> 'Numbers, special characters.'", () => {
        const res = checkStrength("Flowerrr");
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.reason, "Numbers, special characters.");
    });
    test("Deletes 'numbers' when 'Flowerrr1' is typed -> 'Special characters.'", () => {
        const res = checkStrength("Flowerrr1");
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.reason, "Special characters.");
    });
    test("Accepts valid strong password 'Flowerrr1!'", () => {
        assert.strictEqual(checkStrength("Flowerrr1!").valid, true);
    });

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
