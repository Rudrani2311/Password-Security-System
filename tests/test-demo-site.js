const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");
const assert = require("assert");

const EXTENSION_PATH = path.resolve(__dirname, "..", "extension");
const SCREENSHOT_DIR = "C:\\Users\\Rudrani Rakshit\\.gemini\\antigravity\\brain\\37a47733-c9d7-4793-b27f-5ed5e908b895";
const DEMO_URL = "http://localhost:5000";

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

(async () => {
    console.log("\n=== Testing Live Demo Website (http://localhost:5000) & Capturing Screenshots ===\n");
    const browser = await puppeteer.launch({
        executablePath: getChromePath(),
        headless: false,
        defaultViewport: { width: 1120, height: 720 },
        ignoreDefaultArgs: ["--disable-extensions"],
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            "--no-sandbox"
        ]
    });

    try {
        await browser.waitForTarget(
            t => t.type() === "service_worker" && t.url().includes("background.js"),
            { timeout: 10000 }
        );

        const page = await browser.newPage();
        await page.goto(DEMO_URL, { waitUntil: "networkidle0" });
        await sleep(500);

        // Reset demo state first
        await page.click("#btn-reset-demo");
        await sleep(500);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "demo1_initial_page.png") });
        console.log("  ✅ Demo Screenshot 1: Initial Demo Website (Sign in + Password expiry test controls)");

        // Test 1: Click "Set 5 days remaining (Test near-expiry popup)"
        await page.click("#btn-sim-5days");
        await page.waitForSelector("#pss-expiry-popup", { timeout: 6000 });
        const statusText5d = await page.$eval("#sim-days-label", el => el.textContent);
        assert.strictEqual(statusText5d, "5 days");
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "demo2_5day_expiry_simulated.png") });
        console.log("  ✅ Demo Screenshot 2: 'Set 5 days remaining' button triggers 5-day near-expiry banner");

        // Test 2: Click "Set 0 days remaining (Test expired block and redirect)" then click "Log in"
        await page.click("#btn-sim-expired");
        await sleep(600);
        const statusText0d = await page.$eval("#sim-days-label", el => el.textContent);
        assert.strictEqual(statusText0d, "0 days");
        await page.click("#btn-login-submit");
        await page.waitForSelector("#pss-not-allowed-card", { timeout: 6000 });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "demo3_expired_blocked_redirecting.png") });
        console.log("  ✅ Demo Screenshot 3: 'Set 0 days remaining' blocks login & shows 'Redirecting to forgot password.'");

        // Wait for automatic redirection to /forgot-password.html
        await page.waitForFunction(() => window.location.pathname.includes("forgot-password"), { timeout: 8000 });
        await sleep(400);

        // Test 3: On Forgot password page, try using old password ("DemoPass1!") -> "Old password not allowed."
        await page.type("#new-password-input", "DemoPass1!");
        await sleep(600);
        await page.waitForSelector("#pss-not-allowed-card", { timeout: 6000 });
        const oldReason = await page.$eval("#pss-modal-reason", el => el.innerText);
        assert.strictEqual(oldReason, "Old password not allowed.");
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "demo4_forgot_password_page.png") });
        console.log("  ✅ Demo Screenshot 4: Redirected to Forgot password page & blocked old password ('Old password not allowed.')");

        // Test 4: Progressive missing requirements on Demo Website ("Flowerrr" -> "Numbers, special characters.")
        await page.$eval("#new-password-input", el => { el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); });
        await page.type("#new-password-input", "Flowerrr");
        await sleep(500);
        const progReason = await page.$eval("#pss-modal-reason", el => el.innerText);
        assert.strictEqual(progReason, "Numbers, special characters.");
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "demo5_progressive_requirements.png") });
        console.log("  ✅ Demo Screenshot 5: Progressive requirement check on Demo Website ('Numbers, special characters.')");

        // Test 5: Rotate to a valid strong password ("Rudrani$Valid#2026!") and submit -> redirects back to index.html?rotated=1 -> Log in to portal.html
        await page.$eval("#new-password-input", el => { el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); });
        await page.type("#new-password-input", "Rudrani$Valid#2026!");
        await sleep(900);
        await page.click("#btn-update-password");
        await page.waitForFunction(() => window.location.search.includes("rotated=1"), { timeout: 8000 });
        await sleep(400);

        await page.type("#demo-password", "Rudrani$Valid#2026!");
        await page.click("#btn-login-submit");
        await page.waitForFunction(() => window.location.pathname.includes("portal.html"), { timeout: 8000 });
        await sleep(400);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "demo6_login_successful.png") });
        console.log("  ✅ Demo Screenshot 6: Rotated password & logged into Student portal dashboard");

        // Clean up demo site test state
        await page.goto(DEMO_URL, { waitUntil: "networkidle0" });
        await page.click("#btn-reset-demo");
        await sleep(400);
    } finally {
        await browser.close();
    }
})();
