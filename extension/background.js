// Password Security System — Background Service Worker

importScripts("crypto.js", "hibp.js", "storage.js");

const ALARM_AUDIT = "pss_periodic_audit";

chrome.runtime.onInstalled.addListener(async () => {
    chrome.storage.local.remove(["passrotate_vault", "passrotate_settings"]);
    chrome.alarms.create(ALARM_AUDIT, { periodInMinutes: 360 });
    await auditVault();
});

chrome.alarms.onAlarm.addListener(async alarm => {
    if (alarm.name === ALARM_AUDIT) await auditVault();
});

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
    const settings = await PSSStorage.getSettings();
    if (settings.enabled === false) {
        chrome.action.setBadgeText({ text: "" });
        return;
    }
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

async function auditVault() {
    const settings = await PSSStorage.getSettings();
    if (settings.enabled === false) return;
    const vault = await PSSStorage.getVault();

    for (const site of vault) {
        const status = PSSStorage.calculateStatus(site);
        if (status.isExpired) {
            sendNotification(
                `Password expired: ${site.siteName || site.domain}`,
                `Your password for ${site.siteName || site.domain} has expired. Login is blocked until you rotate it.`,
                settings
            );
        } else if (status.isNearExpiry) {
            sendNotification(
                `Password expiry warning: ${site.siteName || site.domain}`,
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
    } catch {}
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        try {
            switch (request.action) {

                case "SET_SYSTEM_ENABLED": {
                    const current = await PSSStorage.getSettings();
                    const enabled = Boolean(request.enabled);
                    await PSSStorage.saveSettings({ ...current, enabled });
                    const tabs = await chrome.tabs.query({});
                    for (const t of tabs) {
                        if (t.id) {
                            try {
                                chrome.tabs.sendMessage(t.id, { action: "SYSTEM_TOGGLED", enabled });
                            } catch {}
                        }
                    }
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (activeTab && activeTab.url) await updateBadge(activeTab.url);
                    else chrome.action.setBadgeText({ text: "" });
                    sendResponse({ success: true, enabled });
                    break;
                }

                case "GET_SITE_STATUS": {
                    const settings = await PSSStorage.getSettings();
                    const domain = PSSCrypto.normalizeDomain(
                        request.domain || (sender.tab ? sender.tab.url : "")
                    );
                    if (settings.enabled === false) {
                        sendResponse({ managed: false, enabled: false, domain });
                        break;
                    }
                    const site = await PSSStorage.getSite(domain);
                    if (!site) {
                        sendResponse({ managed: false, enabled: true, domain });
                    } else {
                        const status = PSSStorage.calculateStatus(site);
                        sendResponse({ managed: true, enabled: true, site, status });
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
                        request.siteName || domain,
                        Boolean(request.strictReuse)
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
                        Boolean(request.strictReuse)
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

                case "DEMO_SET_STATE": {
                    const cleanDomain = PSSCrypto.normalizeDomain(
                        request.domain || (sender.tab ? sender.tab.url : "")
                    );
                    if (request.mode === "RESET") {
                        await PSSStorage.deleteSite(cleanDomain);
                        if (sender.tab && sender.tab.url) await updateBadge(sender.tab.url);
                        sendResponse({ success: true, mode: "RESET", managed: false });
                        break;
                    }
                    const daysRemaining = Number(request.daysRemaining ?? 30);
                    const daysElapsed = 30 - daysRemaining;
                    const rotatedAt = new Date(Date.now() - daysElapsed * 86400000).toISOString();
                    const defaultPw = request.password || "DemoPass1!";
                    const username = request.username || "24bcs10304@cuchd.in";

                    let site = await PSSStorage.getSite(cleanDomain);
                    if (!site || !site.currentPasswordHash) {
                        const rot = await PSSStorage.recordRotation(cleanDomain, defaultPw, username);
                        site = rot.site;
                    }
                    site.lastRotatedAt = rotatedAt;
                    await PSSStorage.saveSite(site, false);
                    await PSSStorage.fetchBackend("/api/update-date", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ domain: cleanDomain, lastRotatedAt: rotatedAt })
                    });
                    const status = PSSStorage.calculateStatus(site);
                    if (sender.tab && sender.tab.url) await updateBadge(sender.tab.url);
                    sendResponse({ success: true, managed: true, site, status });
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
            sendResponse({ error: error.message });
        }
    })();
    return true;
});
