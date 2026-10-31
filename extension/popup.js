let currentDomain = "";

document.addEventListener("DOMContentLoaded", async () => {
    const toggleEl = document.getElementById("btn-toggle-system");
    const websiteEl = document.getElementById("current-website");
    const checkBtn = document.getElementById("btn-password-check");
    const checkInput = document.getElementById("password-check-input");
    const trackBtn = document.getElementById("btn-track-website");
    const trackStatus = document.getElementById("track-status");
    const verifiedEl = document.getElementById("status-verified");
    const notVerifiedEl = document.getElementById("status-not-verified");
    const settingsBtn = document.getElementById("btn-settings");

    const settings = await PSSStorage.getSettings();
    let enabled = settings.enabled !== false;
    toggleEl.textContent = enabled ? "ON" : "OFF";

    toggleEl.addEventListener("click", async () => {
        enabled = !enabled;
        toggleEl.textContent = enabled ? "ON" : "OFF";
        await PSSStorage.saveSettings({ ...settings, enabled });
    });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.startsWith("http")) {
        currentDomain = PSSCrypto.normalizeDomain(tab.url);
        websiteEl.textContent = currentDomain;
        const site = await PSSStorage.getSite(currentDomain);
        if (site) {
            trackStatus.textContent = "Tracked";
            const status = PSSStorage.calculateStatus(site);
            setVerifiedState(!status.isExpired);
        } else {
            setVerifiedState(false);
        }
    }

    async function runPasswordCheck() {
        const pw = checkInput.value;
        if (!pw) {
            setVerifiedState(false);
            return;
        }
        const res = await new Promise(resolve => {
            chrome.runtime.sendMessage(
                { action: "VALIDATE_PASSWORD", domain: currentDomain || "default", password: pw, strictReuse: true },
                resolve
            );
        });
        setVerifiedState(Boolean(res && res.valid));
    }

    checkBtn.addEventListener("click", runPasswordCheck);
    checkInput.addEventListener("keydown", e => {
        if (e.key === "Enter") runPasswordCheck();
    });
    checkInput.addEventListener("input", runPasswordCheck);

    trackBtn.addEventListener("click", () => {
        if (!currentDomain) return;
        chrome.runtime.sendMessage(
            { action: "TRACK_SITE", domain: currentDomain },
            () => {
                trackStatus.textContent = "Tracked";
            }
        );
    });

    settingsBtn.addEventListener("click", () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    });

    function setVerifiedState(isVerified) {
        if (isVerified) {
            verifiedEl.classList.add("active-state");
            notVerifiedEl.classList.remove("active-state");
        } else {
            verifiedEl.classList.remove("active-state");
            notVerifiedEl.classList.add("active-state");
        }
    }
});
