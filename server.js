/**
 * PassRotate - Local Demo Server & Gmail Notification Dispatcher
 * Serves the offline testing site and handles email webhook alerts
 */

const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory alert log for inspection
const alertLogs = [];

// Serve static demo site
app.use(express.static(path.join(__dirname, "demo-site")));

// Health check endpoint
app.get("/api/health", (req, res) => {
    res.json({
        status: "ONLINE",
        service: "PassRotate Security Notification Bridge",
        timestamp: new Date().toISOString()
    });
});

/**
 * Webhook endpoint invoked by the PassRotate Browser Extension
 * when a password enters the 5-day warning zone or expires
 */
app.post("/api/alert-email", (req, res) => {
    const { recipientEmail, site, domain, username, alertType, title, message } = req.body || {};

    const alertRecord = {
        id: "alert_" + Date.now(),
        timestamp: new Date().toISOString(),
        recipient: recipientEmail || "user@gmail.com",
        site: site || domain,
        domain: domain,
        username: username,
        alertType: alertType || "NEAR_EXPIRY",
        title: title || "Password Rotation Required",
        message: message || "Your password will expire soon."
    };

    alertLogs.unshift(alertRecord);
    if (alertLogs.length > 50) alertLogs.pop();

    console.log("=================================================");
    console.log(`[PassRotate Gmail Alert Dispatcher] 📧`);
    console.log(`To: ${alertRecord.recipient}`);
    console.log(`Subject: ${alertRecord.title}`);
    console.log(`Site: ${alertRecord.site} (${alertRecord.domain})`);
    console.log(`Account: ${alertRecord.username || "Registered User"}`);
    console.log(`Status: ${alertRecord.alertType}`);
    console.log(`Body: ${alertRecord.message}`);
    console.log(`Timestamp: ${alertRecord.timestamp}`);
    console.log("=================================================");

    res.status(200).json({
        success: true,
        message: `Alert successfully dispatched for ${alertRecord.site} to ${alertRecord.recipient}`,
        record: alertRecord
    });
});

// View all dispatched alerts
app.get("/api/alert-logs", (req, res) => {
    res.json({
        totalAlerts: alertLogs.length,
        logs: alertLogs
    });
});

// Fallback to demo index
app.use((req, res) => {
    res.sendFile(path.join(__dirname, "demo-site", "index.html"));
});

// Start server on 0.0.0.0 for Render cloud compatibility
app.listen(PORT, "0.0.0.0", () => {
    console.log(`
🛡️  PassRotate Cloud Server & Security Portal Online!
─────────────────────────────────────────────────────
🌐 Hosted Website:     Port ${PORT} (http://0.0.0.0:${PORT})
📧 Email Webhook API:  /api/alert-email
📜 Dispatched Logs:    /api/alert-logs
─────────────────────────────────────────────────────
`);
});
