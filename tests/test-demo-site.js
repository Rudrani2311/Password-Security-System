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
    console.log("\n=== Testing Simplified Demo Website & Expiry Reset Fix ===\n");
    const browser = await puppeteer.launch({
        executablePath: getChromePath(),
        headless: false,
        defaultViewport: { width: 1024, height: 680 },
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

        // Reset demo state via postMessage
        await page.evaluate(() => {
            localStorage.removeItem("pss_demo_last_pw");
            window.postMessage({ source: "PSS_DEMO_PAGE", action: "DEMO_SET_STATE", mode: "RESET" }, "*");
        });
        await sleep(500);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "demo1_initial_page.png") });
        console.log("  ✅ Demo Screenshot 1: Clean Login page with 'Reset to 30 days', '5 days', 'Expired'");

        // Test 1: Click "5 days" -> shows 5-day expiry popup
        await page.click("#btn-sim-5days");
        await page.waitForSelector("#pss-expiry-popup", { timeout: 6000 });
        const bannerText = await page.$eval("#pss-expiry-popup", el => el.textContent);
        assert.strictEqual(bannerText, "Your password is going to expire in 5 days.");
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "demo2_5day_expiry_simulated.png") });
        console.log("  ✅ Demo Screenshot 2: '5 days' triggers 'Your password is going to expire in 5 days.'");

        // Test 2: Click "Expired", click "Log in" -> shows "Password expired." & "Redirecting to forgot password.",
        // then immediately click "Reset to 30 days" -> verifies popups disappear and login succeeds!
        await page.click("#btn-sim-expired");
        await sleep(500);
        await page.click("#btn-login-submit");
        await page.waitForSelector("#pss-not-allowed-card", { timeout: 6000 });
        const expReason = await page.$eval("#pss-modal-reason", el => el.innerText);
        assert.strictEqual(expReason, "Password expired.");

        // Now click "Reset to 30 days" BEFORE redirect finishes
        await page.click("#btn-sim-active");
        await sleep(500);
        const modalStillThere = await page.$("#pss-not-allowed-backdrop");
        const redirectStillThere = await page.$("#pss-redirect-popup");
        assert.strictEqual(modalStillThere, null, "Popup must be cleared immediately when Reset to 30 days is clicked");
        assert.strictEqual(redirectStillThere, null, "Redirect banner must be cleared immediately when Reset to 30 days is clicked");
        console.log("  ✅ Verified: Clicking 'Reset to 30 days' immediately clears 'Password expired.' & 'Redirecting' popups!");

        // Verify login works immediately after Reset to 30 days
        await page.click("#btn-login-submit");
        await page.waitForFunction(() => window.location.pathname.includes("portal.html"), { timeout: 6000 });
        await sleep(300);
        console.log("  ✅ Verified: Login succeeds immediately after 'Reset to 30 days' with zero popups!");

        // Go back to index.html and test full Expired -> Forgot password flow
        await page.goto(DEMO_URL, { waitUntil: "networkidle0" });
        await sleep(400);
        await page.click("#btn-sim-expired");
        await sleep(500);
        await page.click("#btn-login-submit");
        await page.waitForSelector("#pss-not-allowed-card", { timeout: 6000 });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "demo3_expired_blocked_redirecting.png") });
        console.log("  ✅ Demo Screenshot 3: 'Expired' blocks login & shows 'Redirecting to forgot password.'");

        // Wait for automatic redirection to /forgot-password.html
        await page.waitForFunction(() => window.location.pathname.includes("forgot-password"), { timeout: 8000 });
        await sleep(400);

        // Test 3: On Forgot password page, try using old password ("Rudrani#2026$Valid!") -> "Old password not allowed."
        await page.type("#new-password-input", "Rudrani#2026$Valid!");
        await sleep(600);
        await page.waitForSelector("#pss-not-allowed-card", { timeout: 6000 });
        const oldReason = await page.$eval("#pss-modal-reason", el => el.innerText);
        assert.strictEqual(oldReason, "Old password not allowed.");
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "demo4_forgot_password_page.png") });
        console.log("  ✅ Demo Screenshot 4: Forgot password page blocks old password ('Old password not allowed.')");

        // Test 4: Progressive missing requirements ("Flowerrr" -> "Numbers, special characters.")
        await page.$eval("#new-password-input", el => { el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); });
        await page.type("#new-password-input", "Flowerrr");
        await sleep(500);
        const progReason = await page.$eval("#pss-modal-reason", el => el.innerText);
        assert.strictEqual(progReason, "Numbers, special characters.");
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "demo5_progressive_requirements.png") });
        console.log("  ✅ Demo Screenshot 5: Progressive requirement check ('Numbers, special characters.')");

        // Test 5: Rotate to a valid strong password ("Rudrani$Valid#2026!") and submit -> redirects back to index.html -> Log in to portal.html
        await page.$eval("#new-password-input", el => { el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); });
        await page.type("#new-password-input", "Rudrani$Valid#2026!");
        await sleep(900);
        await page.click("#btn-update-password");
        await page.waitForFunction(() => !window.location.pathname.includes("forgot-password"), { timeout: 8000 });
        await sleep(400);

        await page.type("#demo-password", "Rudrani$Valid#2026!");
        await page.click("#btn-login-submit");
        await page.waitForFunction(() => window.location.pathname.includes("portal.html"), { timeout: 8000 });
        await sleep(400);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "demo6_login_successful.png") });
        console.log("  ✅ Demo Screenshot 6: Logged in to clean after-login page");

        // Reset demo state for clean user start
        await page.goto(DEMO_URL, { waitUntil: "networkidle0" });
        await page.evaluate(() => {
            localStorage.removeItem("pss_demo_last_pw");
            window.postMessage({ source: "PSS_DEMO_PAGE", action: "DEMO_SET_STATE", mode: "RESET" }, "*");
        });
        await sleep(400);
    } finally {
        await browser.close();
    }
})();
