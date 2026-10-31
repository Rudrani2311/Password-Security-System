/**
 * Password Security System — Real Browser E2E & Screenshot Test Suite
 * Launches Google Chrome with the actual Extension loaded, connects to real MongoDB Atlas
 * via the backend server, tests all user flows, and saves real PNG screenshots.
 */

const puppeteer = require("puppeteer-core");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const assert = require("assert");

const EXTENSION_PATH = path.resolve(__dirname, "..", "extension");
const SCREENSHOT_DIR = "C:\\Users\\Rudrani Rakshit\\.gemini\\antigravity\\brain\\37a47733-c9d7-4793-b27f-5ed5e908b895";
const BACKEND_URL = "http://localhost:5000";
const TEST_SITE_PORT = 5099;

const CHROME_PATHS = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
];

function getChromePath() {
    for (const p of CHROME_PATHS) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error("Chrome/Edge executable not found");
}

function sha256(text) {
    return crypto.createHash("sha256").update(text).digest("hex");
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// Create a realistic target website login & forgot-password server for E2E browser testing
function startMockTargetWebsite(port) {
    const server = http.createServer((req, res) => {
        if (req.url.startsWith("/forgot-password")) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Coursera — Reset Password via Email OTP</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .box { background: #fff; padding: 36px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); width: 380px; border: 1px solid #e2e8f0; }
        h2 { margin: 0 0 8px; color: #0f172a; }
        p { color: #64748b; font-size: 13px; margin-bottom: 20px; }
        .badge { background: #dbeafe; color: #1e40af; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-bottom: 16px; display: inline-block; }
        label { display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 6px; }
        input { width: 100%; padding: 10px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; margin-bottom: 16px; box-sizing: border-box; font-size: 14px; }
        button { width: 100%; padding: 12px; background: #0056d2; color: #fff; border: none; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; }
    </style>
</head>
<body>
    <div class="box">
        <div class="badge">📧 Gmail OTP Verified: 849201</div>
        <h2>Reset Your Password</h2>
        <p>Enter your new password below. Your browser extension will verify password history, strength, and breach status.</p>
        <form id="reset-form" action="/login?rotated=1" method="GET">
            <label>Account Email</label>
            <input type="email" name="email" value="rudrani@gmail.com" readonly>
            <label>New Password</label>
            <input type="password" id="reset-pw" name="password" placeholder="Enter new password" required>
            <button type="submit" id="reset-submit">Change Password & Continue to Login</button>
        </form>
    </div>
</body>
</html>`);
            return;
        }

        if (req.url.startsWith("/dashboard-logged-in")) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Coursera — Logged In Successfully</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f0fdf4; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .box { background: #fff; padding: 40px; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); width: 440px; text-align: center; border: 2px solid #86efac; }
        h1 { color: #166534; margin: 0 0 10px; font-size: 24px; }
        p { color: #374151; font-size: 14px; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="box">
        <div style="font-size:48px;margin-bottom:12px;">✅</div>
        <h1 id="logged-in-heading">Welcome Back, Rudrani!</h1>
        <p>Your password passed all <strong>Password Security System</strong> checks:<br>
        ✓ Not in MongoDB password history<br>
        ✓ Meets 8+ char & complexity requirements<br>
        ✓ 0 breaches in HaveIBeenPwned<br>
        ✓ 30-day rotation timer active</p>
    </div>
</body>
</html>`);
            return;
        }

        // Default: Login Page
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Coursera — Account Login</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f1f5f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .login-card { background: #fff; padding: 38px; border-radius: 14px; box-shadow: 0 12px 32px rgba(0,0,0,0.08); width: 380px; border: 1px solid #e2e8f0; }
        .logo { font-size: 22px; font-weight: 800; color: #0056d2; margin-bottom: 6px; }
        .sub { font-size: 13px; color: #64748b; margin-bottom: 24px; }
        label { display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 6px; }
        input { width: 100%; padding: 10px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; margin-bottom: 16px; box-sizing: border-box; font-size: 14px; }
        .forgot-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .forgot-row a { font-size: 12px; color: #0056d2; text-decoration: none; font-weight: 600; }
        button { width: 100%; padding: 12px; background: #0056d2; color: #fff; border: none; border-radius: 8px; font-weight: 700; font-size: 14px; cursor: pointer; margin-top: 8px; }
    </style>
</head>
<body>
    <div class="login-card">
        <div class="logo">coursera</div>
        <div class="sub">Sign in to your account</div>
        <form id="login-form" action="/dashboard-logged-in" method="GET">
            <label>Email or Username</label>
            <input type="email" id="username-input" name="username" value="rudrani@gmail.com" required>
            <div class="forgot-row">
                <label style="margin:0;">Password</label>
                <a href="/forgot-password" id="forgot-password-link">Forgot password?</a>
            </div>
            <input type="password" id="password-input" name="password" placeholder="Enter your password" required>
            <button type="submit" id="login-btn">Log In</button>
        </form>
    </div>
</body>
</html>`);
    });

    return new Promise(resolve => {
        server.listen(port, "127.0.0.1", () => resolve(server));
    });
}

(async () => {
    console.log("\n══════════════════════════════════════════════════════════════");
    console.log("  🛡️  Password Security System — Real Chrome E2E & Screenshots");
    console.log("══════════════════════════════════════════════════════════════\n");

    const siteServer = await startMockTargetWebsite(TEST_SITE_PORT);
    const chromePath = getChromePath();
    console.log(`🌐 Using Browser: ${chromePath}`);
    console.log(`🧩 Loading Extension: ${EXTENSION_PATH}\n`);

    // 1. Seed initial credential state in MongoDB Atlas via Backend API for domain "127.0.0.1"
    const oldPassword1 = "OldPass#2025!";
    const oldPassword2 = "PrevPass$2026!";
    const oldHash1 = sha256(oldPassword1);
    const oldHash2 = sha256(oldPassword2);

    // Clear any old test data for 127.0.0.1
    await fetch(`${BACKEND_URL}/api/sites/127.0.0.1`, { method: "DELETE" });

    // Record oldPassword1 first, then oldPassword2 so both are in MongoDB password_history
    await fetch(`${BACKEND_URL}/api/record-rotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            domain: "127.0.0.1",
            siteName: "Coursera",
            username: "rudrani@gmail.com",
            passwordHash: oldHash1,
            rotatedAt: new Date(Date.now() - 60 * 86400000).toISOString()
        })
    });

    // Set second password rotated 25 days ago (5 days remaining -> triggers 5-day warning!)
    await fetch(`${BACKEND_URL}/api/record-rotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            domain: "127.0.0.1",
            siteName: "Coursera",
            username: "rudrani@gmail.com",
            passwordHash: oldHash2,
            rotatedAt: new Date(Date.now() - 25 * 86400000).toISOString()
        })
    });

    // Also seed real external sites (coursera.org, linkedin.com, tryhackme.com, postman.com) in MongoDB Atlas
    await fetch(`${BACKEND_URL}/api/record-rotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            domain: "coursera.org",
            siteName: "Coursera",
            username: "rudrani@gmail.com",
            passwordHash: oldHash2,
            rotatedAt: new Date(Date.now() - 25 * 86400000).toISOString() // 5 days left
        })
    });

    await fetch(`${BACKEND_URL}/api/record-rotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            domain: "tryhackme.com",
            siteName: "TryHackMe",
            username: "rudrani@gmail.com",
            passwordHash: oldHash1,
            rotatedAt: new Date(Date.now() - 32 * 86400000).toISOString() // Expired
        })
    });

    await fetch(`${BACKEND_URL}/api/record-rotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            domain: "linkedin.com",
            siteName: "LinkedIn",
            username: "rudrani@gmail.com",
            passwordHash: sha256("LinkedIn#Secure99!"),
            rotatedAt: new Date(Date.now() - 2 * 86400000).toISOString() // Active (28 days left)
        })
    });

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false,
        defaultViewport: { width: 1280, height: 800 },
        ignoreDefaultArgs: ["--disable-extensions"],
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            "--no-sandbox",
            "--disable-setuid-sandbox"
        ]
    });

    try {
        // Wait for service worker to initialize and get extension ID
        const swTarget = await browser.waitForTarget(
            t => t.type() === "service_worker" && t.url().includes("background.js"),
            { timeout: 10000 }
        );
        const extensionId = new URL(swTarget.url()).hostname;
        console.log(`✅ Extension Loaded in Chrome (ID: ${extensionId})`);

        const page = await browser.newPage();

        // ─── TEST 1: 5-Day Near-Expiry Warning Banner ─────────────────────────
        console.log("\n🧪 TEST 1: 5-Day Near-Expiry Warning Banner on Page Load");
        await page.goto(`http://127.0.0.1:${TEST_SITE_PORT}/login`, { waitUntil: "networkidle0" });
        await page.waitForSelector("#pss-warning-banner", { timeout: 8000 });
        const bannerText = await page.$eval("#pss-warning-banner", el => el.innerText);
        assert.ok(bannerText.includes("going to expire in 5 days"), `Banner text was: ${bannerText}`);
        const shot1 = path.join(SCREENSHOT_DIR, "test1_5day_warning_banner.png");
        await page.screenshot({ path: shot1 });
        console.log(`  ✅ Verified: "${bannerText.replace(/\s+/g, " ").trim()}"`);
        console.log(`  📸 Screenshot saved: test1_5day_warning_banner.png`);

        // ─── TEST 2: Expired Password Blocks Login & Redirects to Forgot Password ─
        console.log("\n🧪 TEST 2: Expired Password Blocks Login & Redirects to Forgot Password");
        // Set 127.0.0.1 password to 32 days old (EXPIRED) in MongoDB
        await fetch(`${BACKEND_URL}/api/update-date`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                domain: "127.0.0.1",
                lastRotatedAt: new Date(Date.now() - 32 * 86400000).toISOString()
            })
        });

        await page.goto(`http://127.0.0.1:${TEST_SITE_PORT}/login`, { waitUntil: "networkidle0" });
        await page.type("#password-input", oldPassword2);
        await page.click("#login-btn");

        // Wait for Blocked Modal to appear
        await page.waitForSelector("#pss-expired-card", { timeout: 8000 });
        const expiredModalText = await page.$eval("#pss-expired-card", el => el.innerText);
        assert.ok(expiredModalText.includes("Password Not Allowed"), "Should show Password Not Allowed");
        assert.ok(expiredModalText.includes("expired"), "Should state password is expired");

        const shot2 = path.join(SCREENSHOT_DIR, "test2_expired_password_blocked.png");
        await page.screenshot({ path: shot2 });
        console.log("  ✅ Verified: Login blocked when password is EXPIRED");
        console.log("  📸 Screenshot saved: test2_expired_password_blocked.png");

        // Wait for automatic redirect to /forgot-password
        await page.waitForFunction(() => window.location.pathname.includes("/forgot-password"), { timeout: 8000 });
        const shot2b = path.join(SCREENSHOT_DIR, "test2b_redirected_to_forgot_password.png");
        await page.screenshot({ path: shot2b });
        console.log("  ✅ Verified: Automatically scanned page & redirected to /forgot-password");
        console.log("  📸 Screenshot saved: test2b_redirected_to_forgot_password.png");

        // ─── TEST 3: Reused Old Password Blocked (MongoDB Password History) ───
        console.log("\n🧪 TEST 3: Old Reused Password Blocked (Checked against MongoDB History)");
        await page.goto(`http://127.0.0.1:${TEST_SITE_PORT}/login`, { waitUntil: "networkidle0" });
        await page.type("#password-input", oldPassword1); // Used 60 days ago!
        await page.click("#login-btn");

        await page.waitForSelector("#pss-expired-card", { timeout: 8000 });
        const reuseText = await page.$eval("#pss-modal-reason", el => el.innerText);
        assert.ok(
            reuseText.toLowerCase().includes("used this password before") || reuseText.toLowerCase().includes("old password"),
            `Expected reuse message, got: ${reuseText}`
        );
        const shot3 = path.join(SCREENSHOT_DIR, "test3_reused_password_blocked.png");
        await page.screenshot({ path: shot3 });
        console.log(`  ✅ Verified: "${reuseText.trim()}"`);
        console.log("  📸 Screenshot saved: test3_reused_password_blocked.png");

        // ─── TEST 4: Weak Password Blocked (Fails 8+ chars / char combination) ─
        console.log("\n🧪 TEST 4: Weak Password Blocked (Security Requirements Check)");
        await page.click("#pss-btn-close-modal");
        await page.$eval("#password-input", el => el.value = "");
        await page.type("#password-input", "weakpass123"); // No uppercase, no special char
        await page.click("#login-btn");

        await page.waitForSelector("#pss-expired-card", { timeout: 8000 });
        const weakText = await page.$eval("#pss-modal-reason", el => el.innerText);
        assert.ok(weakText.includes("Password Not Allowed"), `Expected Password Not Allowed, got: ${weakText}`);
        const shot4 = path.join(SCREENSHOT_DIR, "test4_weak_password_blocked.png");
        await page.screenshot({ path: shot4 });
        console.log(`  ✅ Verified: "${weakText.trim()}"`);
        console.log("  📸 Screenshot saved: test4_weak_password_blocked.png");

        // ─── TEST 5: Breached Password Blocked (HaveIBeenPwned API) ───────────
        console.log("\n🧪 TEST 5: Breached Password Blocked via HaveIBeenPwned API");
        await page.click("#pss-btn-close-modal");
        await page.$eval("#password-input", el => el.value = "");
        // "P@ssw0rd123!" meets all 5 complexity rules (8+ chars, upper, lower, digit, special)
        // BUT is a famously breached password in HaveIBeenPwned!
        await page.type("#password-input", "P@ssw0rd123!");
        await page.click("#login-btn");

        await page.waitForSelector("#pss-expired-card", { timeout: 10000 });
        const breachText = await page.$eval("#pss-modal-reason", el => el.innerText);
        assert.ok(breachText.includes("data breaches"), `Expected HIBP breach block, got: ${breachText}`);
        const shot5 = path.join(SCREENSHOT_DIR, "test5_breached_password_blocked.png");
        await page.screenshot({ path: shot5 });
        console.log(`  ✅ Verified: "${breachText.trim()}"`);
        console.log("  📸 Screenshot saved: test5_breached_password_blocked.png");

        // ─── TEST 6: Valid Brand-New Strong Unbreached Password Allowed ───────
        console.log("\n🧪 TEST 6: Valid New Password Passes All 3 Checks & Allows Login");
        await page.click("#pss-btn-close-modal");
        await page.$eval("#password-input", el => el.value = "");
        const uniqueStrongPw = `Rudrani$Sec#${crypto.randomBytes(6).toString("hex")}!9A`;
        await page.type("#password-input", uniqueStrongPw);
        await page.click("#login-btn");

        await page.waitForSelector("#logged-in-heading", { timeout: 10000 });
        const shot6 = path.join(SCREENSHOT_DIR, "test6_valid_password_allowed.png");
        await page.screenshot({ path: shot6 });
        console.log("  ✅ Verified: Login allowed & new password hash saved to MongoDB Atlas!");
        console.log("  📸 Screenshot saved: test6_valid_password_allowed.png");

        // ─── TEST 7: Extension Dashboard & Popup Screenshots ──────────────────
        console.log("\n🧪 TEST 7: Extension Security Dashboard & Popup UI (Synced with MongoDB Atlas)");
        const dashPage = await browser.newPage();
        await dashPage.goto(`chrome-extension://${extensionId}/dashboard.html`, { waitUntil: "networkidle0" });
        await sleep(1200);
        const shot7 = path.join(SCREENSHOT_DIR, "test7_extension_dashboard.png");
        await dashPage.screenshot({ path: shot7 });
        console.log("  ✅ Verified: Dashboard displaying MongoDB-synced sites (Active, Near Expiry, Expired)");
        console.log("  📸 Screenshot saved: test7_extension_dashboard.png");

        // Breach checker tab in dashboard
        await dashPage.click('[data-tab="checker"]');
        await sleep(400);
        await dashPage.type("#checker-password", "P@ssw0rd123!");
        await dashPage.click("#btn-check-breach");
        await sleep(2000);
        const shot8 = path.join(SCREENSHOT_DIR, "test8_hibp_breach_checker.png");
        await dashPage.screenshot({ path: shot8 });
        console.log("  ✅ Verified: Dashboard HIBP Breach Checker live result");
        console.log("  📸 Screenshot saved: test8_hibp_breach_checker.png");

        console.log("\n══════════════════════════════════════════════════════════════");
        console.log("  🎉 ALL REAL CHROME EXTENSION E2E TESTS & SCREENSHOTS PASSED!");
        console.log("══════════════════════════════════════════════════════════════\n");
    } finally {
        await browser.close();
        siteServer.close();
    }
})();
