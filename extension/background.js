// Password Security System — Background Service Worker

importScripts("crypto.js", "hibp.js", "storage.js");

const ALARM_AUDIT = "pss_periodic_audit";

chrome.runtime.onInstalled.addListener(async () => {
    console.log("[PSS] Password Security System installed.");
    chrome.alarms.create(ALARM_AUDIT, { periodInMinutes: 360 });
    await auditVault();
});

chrome.alarms.onAlarm.addListener(async alarm => {
    if (alarm.name === ALARM_AUDIT) await auditVault();
});

// ─── Tab Badge Updates ────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (tab && tab.url) await updateBadge(tab.url);
    } catch {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url) await updateBadge(tab.url);
});

async function updateBadge(url) {
    if (!url || !url.startsWith("http")) {
        chrome.action.setBadgeText({ text: "" });
        return;
    }
    const domain = PSSCrypto.normalizeDomain(url);
    const site = await PSSStorage.getSite(domain);
    if (!site) {
        chrome.action.setBadgeText({ text: "" });
        return;
    }
    const s = PSSStorage.calculateStatus(site);
    if (s.isExpired) {
        chrome.action.setBadgeText({ text: "!" });
        chrome.action.setBadgeBackgroundColor({ color: "#EF4444" });
    } else if (s.isNearExpiry) {
        chrome.action.setBadgeText({ text: `${s.daysRemaining}d` });
        chrome.action.setBadgeBackgroundColor({ color: "#F59E0B" });
    } else {
        chrome.action.setBadgeText({ text: "✓" });
        chrome.action.setBadgeBackgroundColor({ color: "#10B981" });
    }
}

// ─── Vault Audit + Desktop Notifications ─────────────────────────────────────

async function auditVault() {
    const vault = await PSSStorage.getVault();
    const settings = await PSSStorage.getSettings();

    for (const site of vault) {
        const status = PSSStorage.calculateStatus(site);
        if (status.isExpired) {
            sendNotification(
                `Password Expired: ${site.siteName || site.domain}`,
                `Your password for ${site.siteName || site.domain} has expired. Login is blocked until you rotate it.`,
                settings
            );
        } else if (status.isNearExpiry) {
            sendNotification(
                `Password Expiry Warning: ${site.siteName || site.domain}`,
                `Your password is going to expire in ${status.daysRemaining} day${status.daysRemaining === 1 ? "" : "s"}.`,
                settings
            );
        }
    }
}

function sendNotification(title, message, settings) {
    if (!settings || !settings.browserNotificationsEnabled) return;
    try {
        chrome.notifications.create(`pss_alert_${Date.now()}`, {
            type: "basic",
            iconUrl: "icons/icon128.png",
            title,
            message,
            priority: 2
        });
    } catch (e) {
        console.warn("[PSS] Notification error:", e);
    }
}

// ─── Message Router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        try {
            switch (request.action) {

                case "GET_SITE_STATUS": {
                    const domain = PSSCrypto.normalizeDomain(
                        request.domain || (sender.tab ? sender.tab.url : "")
                    );
                    const site = await PSSStorage.getSite(domain);
                    if (!site) {
                        sendResponse({ managed: false, domain });
                    } else {
                        const status = PSSStorage.calculateStatus(site);
                        sendResponse({ managed: true, site, status });
                    }
                    break;
                }

                case "ATTEMPT_LOGIN": {
                    const domain = PSSCrypto.normalizeDomain(
                        request.domain || (sender.tab ? sender.tab.url : "")
                    );
                    const result = await PSSStorage.evaluateLoginAttempt(
                        domain,
                        request.password,
                        request.username || "",
                        request.siteName || domain
                    );
                    if (sender.tab && sender.tab.url) {
                        await updateBadge(sender.tab.url);
                    }
                    sendResponse(result);
                    break;
                }

                case "CHECK_BREACH": {
                    const result = await PSHIBP.checkBreach(request.password);
                    sendResponse(result);
                    break;
                }

                case "VALIDATE_PASSWORD": {
                    const result = await PSSStorage.validatePassword(
                        request.domain,
                        request.password,
                        request.username || ""
                    );
                    sendResponse(result);
                    break;
                }

                case "RECORD_ROTATION": {
                    const result = await PSSStorage.recordRotation(
                        request.domain,
                        request.password,
                        request.username || "",
                        request.siteName || ""
                    );
                    if (sender.tab && sender.tab.url) await updateBadge(sender.tab.url);
                    sendResponse(result);
                    break;
                }

                case "TRACK_SITE": {
                    const cleanDomain = PSSCrypto.normalizeDomain(request.domain);
                    let site = await PSSStorage.getSite(cleanDomain);
                    if (!site) {
                        site = await PSSStorage.saveSite({
                            domain: cleanDomain,
                            siteName: request.siteName || cleanDomain,
                            username: request.username || "",
                            lastRotatedAt: new Date().toISOString()
                        });
                    }
                    if (sender.tab && sender.tab.url) await updateBadge(sender.tab.url);
                    sendResponse({ success: true, site });
                    break;
                }

                case "GET_VAULT": {
                    const vault = await PSSStorage.getVault();
                    const result = vault.map(site => ({
                        ...site,
                        status: PSSStorage.calculateStatus(site)
                    }));
                    sendResponse({ vault: result });
                    break;
                }

                case "DELETE_SITE": {
                    await PSSStorage.deleteSite(request.domain);
                    sendResponse({ success: true });
                    break;
                }

                case "GET_SETTINGS": {
                    sendResponse(await PSSStorage.getSettings());
                    break;
                }

                case "SAVE_SETTINGS": {
                    sendResponse(await PSSStorage.saveSettings(request.settings));
                    break;
                }

                default:
                    sendResponse({ error: "Unknown action" });
            }
        } catch (error) {
            console.error("[PSS] Background error:", error);
            sendResponse({ error: error.message });
        }
    })();
    return true;
});
