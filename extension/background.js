// Background Service Worker
// Manages alarms, badge updates, and notification checks

importScripts("crypto.js", "hibp.js", "storage.js");

// Alarm name for periodic checks
const ALARM_DAILY_CHECK = "passrotate_daily_audit";

// Setup alarms on installation
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log("[PassRotate] Extension installed/updated:", details.reason);
    
    // Create alarm to audit vault health every 6 hours
    chrome.alarms.create(ALARM_DAILY_CHECK, {
        periodInMinutes: 360 // Every 6 hours
    });

    // Run initial seed and audit
    await PassRotateStorage.getVault();
    await auditAllVaultSites();
});

// Alarm trigger listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_DAILY_CHECK) {
        console.log("[PassRotate] Periodic vault security audit triggered.");
        await auditAllVaultSites();
    }
});

/**
 * Audits all sites in the vault. If any site is within 5 days of expiry or expired,
 * triggers system notifications and optional email alert webhook.
 */
async function auditAllVaultSites() {
    const vault = await PassRotateStorage.getVault();
    const settings = await PassRotateStorage.getSettings();

    let expiredCount = 0;
    let nearExpiryCount = 0;

    for (const site of vault) {
        const statusInfo = PassRotateStorage.calculateStatus(site);
        if (statusInfo.isExpired) {
            expiredCount++;
            notifyUser({
                title: `🚨 Password Expired: ${site.siteName || site.domain}`,
                message: `Your password has passed the 30-day rotation limit. Please rotate it immediately!`,
                type: "EXPIRED",
                site: site
            }, settings);
        } else if (statusInfo.isNearExpiry) {
            nearExpiryCount++;
            notifyUser({
                title: `⚠️ 5-Day Expiry Warning: ${site.siteName || site.domain}`,
                message: `Your password will expire in ${statusInfo.daysRemaining} days. Rotate it soon to prevent lockout.`,
                type: "NEAR_EXPIRY",
                site: site
            }, settings);
        }
    }

    return { expiredCount, nearExpiryCount };
}

/**
 * Dispatches Chrome desktop notification and sends email alert if enabled
 */
async function notifyUser(alertData, settings) {
    // 1. Chrome System Desktop Notification
    if (settings.browserNotificationsEnabled) {
        try {
            chrome.notifications.create(`passrotate_alert_${Date.now()}`, {
                type: "basic",
                iconUrl: "icons/icon128.png",
                title: alertData.title,
                message: alertData.message,
                priority: 2
            });
        } catch (e) {
            console.warn("Notification error:", e);
        }
    }

    // 2. Dispatch to Email Alert Webhook (optional local server bridge or email dispatch)
    if (settings.emailAlertsEnabled && settings.userEmail && settings.webhookAlertUrl) {
        try {
            fetch(settings.webhookAlertUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recipientEmail: settings.userEmail,
                    site: alertData.site.siteName || alertData.site.domain,
                    domain: alertData.site.domain,
                    username: alertData.site.username,
                    alertType: alertData.type,
                    title: alertData.title,
                    message: alertData.message,
                    timestamp: new Date().toISOString()
                })
            }).catch(err => {
                // Ignore webhook failure if local demo server is not active
                console.log("[PassRotate] Email alert dispatcher status:", err.message);
            });
        } catch (e) {
            // Non-blocking
        }
    }
}

// Update icon badge when switching tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab && tab.url) {
            updateTabBadge(tab.url);
        }
    } catch {
        // Tab may have closed
    }
});

// Update icon badge when a tab navigates to a new URL
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url) {
        updateTabBadge(tab.url);
    }
});

async function updateTabBadge(url) {
    if (!url || !url.startsWith("http")) {
        chrome.action.setBadgeText({ text: "" });
        return;
    }

    const domain = PassRotateCrypto.normalizeDomain(url);
    const site = await PassRotateStorage.getSite(domain);

    if (!site) {
        chrome.action.setBadgeText({ text: "" });
        return;
    }

    const status = PassRotateStorage.calculateStatus(site);

    if (status.isExpired) {
        chrome.action.setBadgeText({ text: "!" });
        chrome.action.setBadgeBackgroundColor({ color: "#EF4444" }); // Red
    } else if (status.isNearExpiry) {
        chrome.action.setBadgeText({ text: `${status.daysRemaining}d` });
        chrome.action.setBadgeBackgroundColor({ color: "#F59E0B" }); // Amber
    } else {
        chrome.action.setBadgeText({ text: "✓" });
        chrome.action.setBadgeBackgroundColor({ color: "#10B981" }); // Emerald Green
    }
}

// Central Message Hub
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        try {
            switch (request.action) {
                case "GET_SITE_STATUS": {
                    const domain = PassRotateCrypto.normalizeDomain(request.domain || (sender.tab ? sender.tab.url : ""));
                    const site = await PassRotateStorage.getSite(domain);
                    if (!site) {
                        sendResponse({ managed: false, domain });
                    } else {
                        const status = PassRotateStorage.calculateStatus(site);
                        sendResponse({ managed: true, site, status });
                    }
                    break;
                }

                case "CHECK_PASSWORD_BREACH": {
                    const result = await PassRotateHIBP.checkBreach(request.password);
                    sendResponse(result);
                    break;
                }

                case "RECORD_PASSWORD_ROTATION": {
                    const result = await PassRotateStorage.recordRotation(
                        request.domain,
                        request.newPassword,
                        request.username
                    );
                    if (sender.tab && sender.tab.url) {
                        updateTabBadge(sender.tab.url);
                    }
                    sendResponse(result);
                    break;
                }

                case "SIMULATE_SITE_STATE": {
                    const updatedStatus = await PassRotateStorage.simulateState(request.domain, request.targetState);
                    if (sender.tab && sender.tab.url) {
                        updateTabBadge(sender.tab.url);
                    }
                    sendResponse({ success: true, status: updatedStatus });
                    break;
                }

                case "TRIGGER_TEST_NOTIFICATION": {
                    const settings = await PassRotateStorage.getSettings();
                    await notifyUser({
                        title: request.title || "PassRotate Security Alert",
                        message: request.message || "Password rotation alert triggered.",
                        type: request.type || "NEAR_EXPIRY",
                        site: request.site || { siteName: "Coursera", domain: "coursera.org" }
                    }, settings);
                    sendResponse({ success: true });
                    break;
                }

                default:
                    sendResponse({ error: "Unknown action" });
            }
        } catch (error) {
            console.error("[PassRotate] Background message handler error:", error);
            sendResponse({ error: error.message });
        }
    })();

    return true; // Keep message channel open for async response
});
