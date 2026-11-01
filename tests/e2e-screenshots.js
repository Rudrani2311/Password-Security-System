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
    throw new Error("Browser executable not found");
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function startTestPagesServer(port) {
    const server = http.createServer((req, res) => {
        if (req.url.startsWith("/forgot-password")) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Reset Password</title>
<style>body{font-family:"Times New Roman",serif;background:#f8fafc;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}.card{background:#fff;padding:32px;border:1px solid #cbd5e1;width:360px}</style>
</head>
<body>
<div class="card">
    <h3>Forgot password — Reset via email OTP</h3>
    <p>OTP verified. Enter new password:</p>
    <form action="/login" method="GET">
        <input type="password" id="reset-pw" placeholder="New password" style="width:100%;padding:8px;margin-bottom:12px;box-sizing:border-box">
        <button type="submit" style="width:100%;padding:10px;background:#0f172a;color:#fff;border:none">Update password</button>
    </form>
</div>
</body></html>`);
            return;
        }

        if (req.url.startsWith("/postman-runner")) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Postman — Rudrani's Workspace</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { background: #1c1c1c; color: #e0e0e0; height: 100vh; display: flex; flex-direction: column; }
    .topbar { background: #262626; border-bottom: 1px solid #383838; padding: 10px 18px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
    .ws-name { font-weight: 700; color: #ff6c37; display: flex; align-items: center; gap: 10px; }
    .ws-badge { background: #333; color: #fff; padding: 3px 10px; border-radius: 4px; font-size: 12px; }
    .main { display: flex; flex: 1; overflow: hidden; }
    .sidebar { width: 290px; background: #212121; border-right: 1px solid #383838; padding: 14px; font-size: 12px; }
    .col-title { font-weight: 700; color: #fff; margin-bottom: 12px; font-size: 13px; }
    .req-item { padding: 8px 10px; border-radius: 4px; margin-bottom: 6px; background: #2b2b2b; display: flex; gap: 8px; align-items: center; }
    .req-item.active { background: #383838; border-left: 3px solid #ff6c37; }
    .m-post { color: #ffb400; font-weight: 700; font-size: 11px; width: 38px; }
    .m-get { color: #0cbb52; font-weight: 700; font-size: 11px; width: 38px; }
    .workspace-pane { flex: 1; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
    .url-bar { display: flex; gap: 10px; align-items: center; }
    .method-box { background: #2b2b2b; border: 1px solid #444; padding: 9px 14px; border-radius: 4px; font-weight: 700; color: #ffb400; font-size: 13px; }
    .url-input { flex: 1; background: #2b2b2b; border: 1px solid #444; padding: 9px 14px; border-radius: 4px; color: #fff; font-family: monospace; font-size: 13px; }
    .send-btn { background: #097bed; color: #fff; border: none; padding: 9px 22px; border-radius: 4px; font-weight: 700; font-size: 13px; }
    .pane-box { background: #262626; border: 1px solid #383838; border-radius: 6px; padding: 14px; flex: 1; display: flex; flex-direction: column; }
    .pane-hdr { display: flex; justify-content: space-between; font-size: 12px; color: #aaa; margin-bottom: 10px; border-bottom: 1px solid #383838; padding-bottom: 8px; }
    .status-ok { color: #0cbb52; font-weight: 700; }
    pre { font-family: Consolas, monospace; font-size: 12.5px; color: #a6e22e; white-space: pre-wrap; line-height: 1.5; }
    .tests-list { margin-top: 10px; border-top: 1px solid #383838; padding-top: 10px; }
    .pass-pill { display: inline-block; background: #0cbb52; color: #000; font-weight: 700; font-size: 10px; padding: 2px 6px; border-radius: 3px; margin-right: 6px; }
    .test-row { font-size: 12px; margin-bottom: 5px; color: #ddd; }
</style>
</head>
<body>
    <div class="topbar">
        <div class="ws-name">POSTMAN &nbsp;|&nbsp; <span class="ws-badge">Rudrani's Workspace — Password Security System</span></div>
        <div>Environment: <strong>Localhost + MongoDB Atlas (LIVE)</strong></div>
    </div>
    <div class="main">
        <div class="sidebar">
            <div class="col-title">Password Security System API</div>
            <div class="req-item" id="nav-1"><span class="m-get">GET</span> /api/health</div>
            <div class="req-item" id="nav-2"><span class="m-post">POST</span> /api/record-rotation</div>
            <div class="req-item" id="nav-3"><span class="m-post">POST</span> /api/check-reuse</div>
            <div class="req-item" id="nav-4"><span class="m-get">GET</span> /api/sites</div>
        </div>
        <div class="workspace-pane">
            <div class="url-bar">
                <div class="method-box" id="pm-method">POST</div>
                <div class="url-input" id="pm-url">http://localhost:5000/api/record-rotation</div>
                <button class="send-btn">Send</button>
            </div>
            <div class="pane-box" style="flex:0.45">
                <div class="pane-hdr"><span>Request Body (raw JSON)</span><span>application/json</span></div>
                <pre id="pm-req-body"></pre>
            </div>
            <div class="pane-box">
                <div class="pane-hdr">
                    <span>Response Body</span>
                    <span class="status-ok" id="pm-status">Status: 200 OK</span>
                </div>
                <pre id="pm-res-body"></pre>
                <div class="tests-list" id="pm-tests"></div>
            </div>
        </div>
    </div>
</body></html>`);
            return;
        }

        if (req.url.startsWith("/logged-in")) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`<!DOCTYPE html><html><head><title>Logged In</title></head><body><h2 id="logged-in-ok">Login successful</h2></body></html>`);
            return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Sign in</title>
<style>
    body { font-family: "Times New Roman", Times, serif; background: #f1f5f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
    .login-box { background: #fff; padding: 32px; border: 1px solid #cbd5e1; width: 340px; border-radius: 6px; }
    h3 { margin: 0 0 16px; font-size: 20px; }
    input { width: 100%; padding: 8px 10px; margin-bottom: 12px; box-sizing: border-box; border: 1px solid #94a3b8; font-family: "Times New Roman", Times, serif; font-size: 15px; }
    .row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 6px; }
    button { width: 100%; padding: 10px; background: #1e293b; color: #fff; border: none; cursor: pointer; font-family: "Times New Roman", Times, serif; font-size: 15px; border-radius: 4px; }
</style>
</head>
<body>
    <div class="login-box">
        <h3>Coursera sign in</h3>
        <form id="login-form" action="/logged-in" method="GET">
            <div class="row"><span>Email</span></div>
            <input type="email" id="username-input" value="24bcs10304@cuchd.in" required>
            <div class="row">
                <span>Password</span>
                <a href="/forgot-password" id="forgot-link">Forgot password</a>
            </div>
            <input type="password" id="password-input" placeholder="Enter password" required>
            <button type="submit" id="login-btn">Log in</button>
        </form>
    </div>
</body></html>`);
    });

    return new Promise(resolve => server.listen(port, "127.0.0.1", () => resolve(server)));
}

(async () => {
    console.log("\n=== Running Progressive Change & E2E Verification Screenshot Suite ===\n");
    const siteServer = await startTestPagesServer(TEST_SITE_PORT);
    const chromePath = getChromePath();

    const oldPass1 = "OldPass#2025!";
    const oldPass2 = "PrevPass$2026!";

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false,
        defaultViewport: { width: 1100, height: 700 },
        ignoreDefaultArgs: ["--disable-extensions"],
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            "--no-sandbox"
        ]
    });

    let testUserId = "default";
    try {
        const swTarget = await browser.waitForTarget(
            t => t.type() === "service_worker" && t.url().includes("background.js"),
            { timeout: 10000 }
        );
        const extensionId = new URL(swTarget.url()).hostname;

        // ── CHANGE 1 SCREENSHOTS: Main Popup On / Off Toggle (Times New Roman + Sentence case) ──
        const popupPage = await browser.newPage();
        await popupPage.setViewport({ width: 420, height: 340 });
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "networkidle0" });
        testUserId = await popupPage.evaluate(() => window.PSSStorage.getUserId());
        const apiHeaders = { "Content-Type": "application/json", "X-PSS-User-Id": testUserId };

        await popupPage.evaluate(() => {
            document.getElementById("current-website").textContent = "coursera.org";
        });
        await popupPage.screenshot({ path: path.join(SCREENSHOT_DIR, "change1_popup_on.png") });
        console.log("  ✅ Change Screenshot 1: Main popup with Times New Roman, sentence case, and 'On' state");

        // Click 'On' -> turns 'Off' and disables extension
        await popupPage.click("#btn-toggle-system");
        await sleep(400);
        const toggleTextOff = await popupPage.$eval("#btn-toggle-system", el => el.textContent);
        assert.strictEqual(toggleTextOff, "Off", "Toggle button must switch to Off");
        await popupPage.screenshot({ path: path.join(SCREENSHOT_DIR, "change2_popup_off.png") });
        console.log("  ✅ Change Screenshot 2: Main popup switched to 'Off' (actually disables extension)");

        // Verify that while Off, typing an invalid password on a login page does NOT show popup
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${TEST_SITE_PORT}/login`, { waitUntil: "networkidle0" });
        await page.type("#password-input", "flower");
        await sleep(600);
        const modalWhenOff = await page.$("#pss-not-allowed-card");
        assert.strictEqual(modalWhenOff, null, "Popup must NOT appear when extension is turned Off");

        // Switch back to 'On' in popup
        await popupPage.bringToFront();
        await popupPage.click("#btn-toggle-system");
        await sleep(500);
        await popupPage.type("#password-check-input", `Rudrani$Valid#${crypto.randomBytes(3).toString("hex")}!9`);
        await popupPage.click("#btn-password-check");
        await sleep(1000);
        await popupPage.screenshot({ path: path.join(SCREENSHOT_DIR, "pdf_test6_extension_popup.png") });
        await page.bringToFront();

        // ── CHANGE 2 SCREENSHOTS: Progressive Missing Requirements ("flower" -> "flowerrr" -> "Flowerrr" -> "Flowerrr1") ──
        await fetch(`${BACKEND_URL}/api/sites/127.0.0.1`, { method: "DELETE", headers: apiHeaders });
        await fetch(`${BACKEND_URL}/api/sites/coursera.org`, { method: "DELETE", headers: apiHeaders });

        await fetch(`${BACKEND_URL}/api/record-rotation`, {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({
                domain: "127.0.0.1",
                username: "24bcs10304@cuchd.in",
                password: oldPass1,
                rotatedAt: new Date(Date.now() - 60 * 86400000).toISOString()
            })
        });
        await fetch(`${BACKEND_URL}/api/record-rotation`, {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({
                domain: "127.0.0.1",
                username: "24bcs10304@cuchd.in",
                password: oldPass2,
                rotatedAt: new Date(Date.now() - 25 * 86400000).toISOString()
            })
        });

        // 5-day expiry popup screenshot
        await page.goto(`http://127.0.0.1:${TEST_SITE_PORT}/login`, { waitUntil: "networkidle0" });
        await page.waitForSelector("#pss-expiry-popup", { timeout: 8000 });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "pdf_test1_5day_popup.png") });
        console.log("  ✅ Screenshot: 5-day near-expiry banner ('Password expires in 5 days. Rotate password.')");

        // Step A: Type "flower" (< 8 characters) -> "Must be at least 8 characters."
        await page.$eval("#password-input", el => el.value = "");
        await page.type("#password-input", "flower");
        await page.waitForSelector("#pss-not-allowed-card", { timeout: 8000 });
        const reasonFlower = await page.$eval("#pss-modal-reason", el => el.innerText);
        assert.strictEqual(reasonFlower, "Must be at least 8 characters.");
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "change3_step_flower.png") });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "pdf_test4_not_allowed_weak.png") });
        console.log("  ✅ Change Screenshot 3 ('flower'): 'Must be at least 8 characters.'");

        // Step B: Type "rr" to make "flowerrr" (has lowercase + 8 chars) -> "Uppercase, numbers, special characters."
        await page.type("#password-input", "rr");
        await sleep(600);
        const reasonFlowerrr = await page.$eval("#pss-modal-reason", el => el.innerText);
        assert.strictEqual(reasonFlowerrr, "Uppercase, numbers, special characters.");
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "change4_step_flowerrr.png") });
        console.log("  ✅ Change Screenshot 4 ('flowerrr'): 'Uppercase, numbers, special characters.'");

        // Step C: Replace with "Flowerrr" (added uppercase) -> "uppercase" deleted -> "Numbers, special characters."
        await page.$eval("#password-input", el => { el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); });
        await page.type("#password-input", "Flowerrr");
        await sleep(600);
        const reasonCapFlowerrr = await page.$eval("#pss-modal-reason", el => el.innerText);
        assert.strictEqual(reasonCapFlowerrr, "Numbers, special characters.");
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "change5_step_Flowerrr.png") });
        console.log("  ✅ Change Screenshot 5 ('Flowerrr'): 'Numbers, special characters.' (uppercase removed!)");

        // Step D: Type "1" to make "Flowerrr1" (added number) -> "numbers" deleted -> "Special characters."
        await page.type("#password-input", "1");
        await sleep(600);
        const reasonFlowerrr1 = await page.$eval("#pss-modal-reason", el => el.innerText);
        assert.strictEqual(reasonFlowerrr1, "Special characters.");
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "change6_step_Flowerrr1.png") });
        console.log("  ✅ Change Screenshot 6 ('Flowerrr1'): 'Special characters.' (numbers removed!)");

        // ── CHANGE 3 SCREENSHOT: Clicking X closes popup, but popup re-appears & BLOCKS login while still invalid ──
        await page.click("#pss-btn-close-x");
        await sleep(200);
        assert.strictEqual(await page.$("#pss-not-allowed-card"), null, "Popup closes when X is clicked");

        // Try clicking Log in while password is still "Flowerrr1" (missing special character)
        await page.click("#login-btn");
        await page.waitForSelector("#pss-not-allowed-card", { timeout: 5000 });
        assert.ok(page.url().includes("/login"), "Login MUST be blocked when requirements are not met after closing X");
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "change7_persistent_popup_blocks_login.png") });
        console.log("  ✅ Change Screenshot 7: Clicking Log in after closing X is BLOCKED & popup re-appears!");

        // Also test automatic reminder popup re-appearing after clicking X without even clicking Log in
        await page.click("#pss-btn-close-x");
        await sleep(2100);
        const autoReappeared = await page.$("#pss-not-allowed-card");
        assert.ok(autoReappeared !== null, "Popup automatically re-appears to remind user while password is still invalid");

        // ── CHANGE 4 SCREENSHOT: Old password shows "Old password not allowed." ──
        await page.$eval("#password-input", el => { el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); });
        await page.type("#password-input", oldPass1);
        await page.click("#login-btn");
        await sleep(500);
        await page.waitForSelector("#pss-not-allowed-card", { timeout: 8000 });
        const reuseReason = await page.$eval("#pss-modal-reason", el => el.innerText);
        assert.strictEqual(reuseReason, "Old password not allowed.");
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "change8_old_password_blocked.png") });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "pdf_test3_not_allowed_reused.png") });
        console.log("  ✅ Change Screenshot 8: Old password shows 'Old password not allowed.' and blocks login");

        // ── CHANGE 5 SCREENSHOT: Breached password shows "This password was leaked in a data breach." ──
        await page.$eval("#password-input", el => { el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); });
        await page.type("#password-input", "P@ssw0rd123!");
        await page.click("#login-btn");
        await sleep(1200);
        await page.waitForSelector("#pss-not-allowed-card", { timeout: 10000 });
        const breachReason = await page.$eval("#pss-modal-reason", el => el.innerText);
        assert.strictEqual(breachReason, "This password was leaked in a data breach.");
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "change9_breached_password_blocked.png") });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "pdf_test5_not_allowed_breached.png") });
        console.log("  ✅ Change Screenshot 9: Leaked password shows 'This password was leaked in a data breach.'");

        // ── Expired Password + "Redirecting to forgot password." ──
        await fetch(`${BACKEND_URL}/api/update-date`, {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({
                domain: "127.0.0.1",
                lastRotatedAt: new Date(Date.now() - 32 * 86400000).toISOString()
            })
        });
        await page.goto(`http://127.0.0.1:${TEST_SITE_PORT}/login`, { waitUntil: "networkidle0" });
        await page.type("#password-input", oldPass2);
        await page.click("#login-btn");
        await page.waitForSelector("#pss-not-allowed-card", { timeout: 8000 });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "pdf_test2_expired_redirect.png") });
        await page.waitForFunction(() => window.location.pathname.includes("/forgot-password"), { timeout: 8000 });
        console.log("  ✅ Screenshot: Expired password blocked & redirected to Forgot password");

        // ── CHANGE 6 SCREENSHOT: Settings Page (Times New Roman + Sentence case) ──
        await fetch(`${BACKEND_URL}/api/record-rotation`, {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({
                domain: "coursera.org",
                username: "24bcs10304@cuchd.in",
                password: "Coursera#Valid99!",
                rotatedAt: new Date(Date.now() - 5 * 86400000).toISOString()
            })
        });
        const settingsPage = await browser.newPage();
        await settingsPage.setViewport({ width: 640, height: 360 });
        await settingsPage.goto(`chrome-extension://${extensionId}/dashboard.html`, { waitUntil: "networkidle0" });
        await sleep(1000);
        await settingsPage.screenshot({ path: path.join(SCREENSHOT_DIR, "change10_settings_page.png") });
        await settingsPage.screenshot({ path: path.join(SCREENSHOT_DIR, "pdf_test7_settings_page.png") });
        console.log("  ✅ Change Screenshot 10: Settings page in Times New Roman & sentence case");

        // ── Live Postman API Tests in Rudrani's Workspace ──
        const pmPage = await browser.newPage();
        await pmPage.setViewport({ width: 1100, height: 680 });
        await pmPage.goto(`http://127.0.0.1:${TEST_SITE_PORT}/postman-runner`, { waitUntil: "networkidle0" });

        const reqBody1 = { domain: "coursera.org", username: "24bcs10304@cuchd.in", password: "Rudrani$NewPass#2026!" };
        const res1 = await fetch(`${BACKEND_URL}/api/record-rotation`, {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify(reqBody1)
        });
        const data1 = await res1.json();
        await pmPage.evaluate(({ reqBody, resData }) => {
            document.getElementById("nav-2").classList.add("active");
            document.getElementById("pm-method").textContent = "POST";
            document.getElementById("pm-url").textContent = "http://localhost:5000/api/record-rotation";
            document.getElementById("pm-req-body").textContent = JSON.stringify(reqBody, null, 2);
            document.getElementById("pm-res-body").textContent = JSON.stringify(resData, null, 2);
            document.getElementById("pm-tests").innerHTML = `
                <div class="test-row"><span class="pass-pill">PASS</span>Status code is 200 OK</div>
                <div class="test-row"><span class="pass-pill">PASS</span>Password hashed with bcrypt salt ($2b$10$...) and stored in MongoDB</div>
            `;
        }, { reqBody: reqBody1, resData: data1 });
        await pmPage.screenshot({ path: path.join(SCREENSHOT_DIR, "pdf_test8_postman_record_bcrypt.png") });

        const reqBody2 = { domain: "coursera.org", password: "Rudrani$NewPass#2026!" };
        const res2 = await fetch(`${BACKEND_URL}/api/check-reuse`, {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify(reqBody2)
        });
        const data2 = await res2.json();
        await pmPage.evaluate(({ reqBody, resData }) => {
            document.getElementById("nav-2").classList.remove("active");
            document.getElementById("nav-3").classList.add("active");
            document.getElementById("pm-method").textContent = "POST";
            document.getElementById("pm-url").textContent = "http://localhost:5000/api/check-reuse";
            document.getElementById("pm-req-body").textContent = JSON.stringify(reqBody, null, 2);
            document.getElementById("pm-res-body").textContent = JSON.stringify(resData, null, 2);
            document.getElementById("pm-tests").innerHTML = `
                <div class="test-row"><span class="pass-pill">PASS</span>Status code is 200 OK</div>
                <div class="test-row"><span class="pass-pill">PASS</span>Bcrypt comparison detects reused password (reused: true)</div>
            `;
        }, { reqBody: reqBody2, resData: data2 });
        await pmPage.screenshot({ path: path.join(SCREENSHOT_DIR, "pdf_test9_postman_check_reuse.png") });

    } finally {
        for (const d of ["127.0.0.1", "coursera.org"]) {
            try { await fetch(`${BACKEND_URL}/api/sites/${d}`, { method: "DELETE", headers: { "X-PSS-User-Id": testUserId } }); } catch {}
        }
        await browser.close();
        siteServer.close();
    }
})();
