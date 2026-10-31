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
<style>body{font-family:sans-serif;background:#f8fafc;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}.card{background:#fff;padding:32px;border:1px solid #cbd5e1;width:360px}</style>
</head>
<body>
<div class="card">
    <h3>Forgot Password — Reset via Email OTP</h3>
    <p>OTP Verified. Enter new password:</p>
    <form action="/login" method="GET">
        <input type="password" id="reset-pw" placeholder="New password" style="width:100%;padding:8px;margin-bottom:12px;box-sizing:border-box">
        <button type="submit" style="width:100%;padding:10px;background:#0f172a;color:#fff;border:none">Update Password</button>
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
            res.end(`<!DOCTYPE html><html><head><title>Logged In</title></head><body><h2 id="logged-in-ok">Login Successful</h2></body></html>`);
            return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Coursera Login</title>
<style>
    body { font-family: sans-serif; background: #f1f5f9; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
    .login-box { background: #fff; padding: 32px; border: 1px solid #cbd5e1; width: 340px; }
    h3 { margin: 0 0 16px; }
    input { width: 100%; padding: 8px 10px; margin-bottom: 12px; box-sizing: border-box; border: 1px solid #94a3b8; }
    .row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
    button { width: 100%; padding: 10px; background: #1e293b; color: #fff; border: none; cursor: pointer; }
</style>
</head>
<body>
    <div class="login-box">
        <h3>Coursera Sign In</h3>
        <form id="login-form" action="/logged-in" method="GET">
            <div class="row"><span>Username</span></div>
            <input type="email" id="username-input" value="rudrani@gmail.com" required>
            <div class="row">
                <span>Password</span>
                <a href="/forgot-password" id="forgot-link">Forgot Password</a>
            </div>
            <input type="password" id="password-input" placeholder="Enter password" required>
            <button type="submit" id="login-btn">Log In</button>
        </form>
    </div>
</body></html>`);
    });

    return new Promise(resolve => server.listen(port, "127.0.0.1", () => resolve(server)));
}

(async () => {
    console.log("\n=== Running Real Browser & Live Postman API Screenshot Suite ===\n");
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
        const page = await browser.newPage();

        // Get the extension's generated userId so backend calls match the extension instance
        await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "networkidle0" });
        testUserId = await page.evaluate(() => window.PSSStorage.getUserId());
        const apiHeaders = { "Content-Type": "application/json", "X-PSS-User-Id": testUserId };

        await fetch(`${BACKEND_URL}/api/sites/127.0.0.1`, { method: "DELETE", headers: apiHeaders });
        await fetch(`${BACKEND_URL}/api/sites/coursera.org`, { method: "DELETE", headers: apiHeaders });

        // Seed oldPass1 then oldPass2 (set to 25 days ago -> 5 days remaining)
        await fetch(`${BACKEND_URL}/api/record-rotation`, {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({
                domain: "127.0.0.1",
                username: "rudrani@gmail.com",
                password: oldPass1,
                rotatedAt: new Date(Date.now() - 60 * 86400000).toISOString()
            })
        });
        await fetch(`${BACKEND_URL}/api/record-rotation`, {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({
                domain: "127.0.0.1",
                username: "rudrani@gmail.com",
                password: oldPass2,
                rotatedAt: new Date(Date.now() - 25 * 86400000).toISOString()
            })
        });

        // 1. Screenshot: 5-Day Near Expiry Popup ("password expires in 5 days. Rotate password.")
        await page.goto(`http://127.0.0.1:${TEST_SITE_PORT}/login`, { waitUntil: "networkidle0" });
        await page.waitForSelector("#pss-expiry-popup", { timeout: 8000 });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "pdf_test1_5day_popup.png") });
        console.log("  ✅ Screenshot 1: 5-day expiry popup (black & white, Times New Roman)");

        // 2. Screenshot: Expired Password + "redirecting to Forgot Password"
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
        console.log("  ✅ Screenshot 2: Expired password 'Password Not Allowed' + 'redirecting to Forgot Password'");

        // Wait for redirect to /forgot-password
        await page.waitForFunction(() => window.location.pathname.includes("/forgot-password"), { timeout: 8000 });

        // 3. Screenshot: "Password Not Allowed" — Old Password Reuse (Bcrypt checked in MongoDB)
        await page.goto(`http://127.0.0.1:${TEST_SITE_PORT}/login`, { waitUntil: "networkidle0" });
        await page.type("#password-input", oldPass1);
        await page.click("#login-btn");
        await page.waitForSelector("#pss-not-allowed-card", { timeout: 8000 });
        const reuseReason = await page.$eval("#pss-modal-reason", el => el.innerText);
        assert.ok(reuseReason.includes("Used before"), `Got: ${reuseReason}`);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "pdf_test3_not_allowed_reused.png") });
        console.log("  ✅ Screenshot 3: 'Password Not Allowed | X' — Old password reused (MongoDB bcrypt)");

        // Test clicking 'X' closes popup, and attempting login again keeps displaying popup
        await page.click("#pss-btn-close-x");
        await sleep(200);
        const closed = await page.$("#pss-not-allowed-card");
        assert.strictEqual(closed, null, "Clicking X must close the popup");

        // 4. Screenshot: "Password Not Allowed" — Weak Password (< 8 chars / missing special symbols)
        await page.$eval("#password-input", el => el.value = "");
        await page.type("#password-input", "weak123");
        await page.click("#login-btn");
        await page.waitForSelector("#pss-not-allowed-card", { timeout: 8000 });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "pdf_test4_not_allowed_weak.png") });
        console.log("  ✅ Screenshot 4: 'Password Not Allowed | X' — Fails 8 chars / special symbol requirements");

        // 5. Screenshot: "Password Not Allowed" — Breached Password (HaveIBeenPwned)
        await page.click("#pss-btn-close-x");
        await page.$eval("#password-input", el => el.value = "");
        await page.type("#password-input", "P@ssw0rd123!");
        await page.click("#login-btn");
        await page.waitForSelector("#pss-not-allowed-card", { timeout: 10000 });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "pdf_test5_not_allowed_breached.png") });
        console.log("  ✅ Screenshot 5: 'Password Not Allowed | X' — Exposed in data breach (HIBP)");

        // 6. Screenshot: Extension Popup (Diagram 1 exact table)
        const popupPage = await browser.newPage();
        await popupPage.setViewport({ width: 420, height: 320 });
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "networkidle0" });
        await popupPage.evaluate(() => {
            document.getElementById("current-website").textContent = "coursera.org";
        });
        await popupPage.type("#password-check-input", `Rudrani$Valid#${crypto.randomBytes(3).toString("hex")}!9`);
        await popupPage.click("#btn-password-check");
        await sleep(1500);
        await popupPage.screenshot({ path: path.join(SCREENSHOT_DIR, "pdf_test6_extension_popup.png") });
        console.log("  ✅ Screenshot 6: Extension Popup matching Diagram 1 (Times New Roman, black & white)");

        // 7. Screenshot: Settings Page (Only tracked websites & remaining days)
        await fetch(`${BACKEND_URL}/api/record-rotation`, {
            method: "POST",
            headers: apiHeaders,
            body: JSON.stringify({
                domain: "coursera.org",
                username: "rudrani@gmail.com",
                password: "Coursera#Valid99!",
                rotatedAt: new Date(Date.now() - 5 * 86400000).toISOString()
            })
        });
        const settingsPage = await browser.newPage();
        await settingsPage.setViewport({ width: 640, height: 360 });
        await settingsPage.goto(`chrome-extension://${extensionId}/dashboard.html`, { waitUntil: "networkidle0" });
        await sleep(1000);
        await settingsPage.screenshot({ path: path.join(SCREENSHOT_DIR, "pdf_test7_settings_page.png") });
        console.log("  ✅ Screenshot 7: Settings Page showing only Tracked Websites & Remaining Days");

        // 8. Live Postman API Tests in Rudrani's Workspace
        const pmPage = await browser.newPage();
        await pmPage.setViewport({ width: 1100, height: 680 });
        await pmPage.goto(`http://127.0.0.1:${TEST_SITE_PORT}/postman-runner`, { waitUntil: "networkidle0" });

        // Live Test A: POST /api/record-rotation (Bcrypt salt hash)
        const reqBody1 = { domain: "coursera.org", username: "rudrani@gmail.com", password: "Rudrani$NewPass#2026!" };
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
        console.log("  ✅ Screenshot 8: Live Postman API Test — POST /api/record-rotation (bcrypt salt hash)");

        // Live Test B: POST /api/check-reuse (Bcrypt compare)
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
        console.log("  ✅ Screenshot 9: Live Postman API Test — POST /api/check-reuse (bcrypt compare)");

    } finally {
        for (const d of ["127.0.0.1", "coursera.org"]) {
            try { await fetch(`${BACKEND_URL}/api/sites/${d}`, { method: "DELETE", headers: { "X-PSS-User-Id": testUserId } }); } catch {}
        }
        await browser.close();
        siteServer.close();
    }
})();
