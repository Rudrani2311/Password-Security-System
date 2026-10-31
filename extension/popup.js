let currentDomain = "";

document.addEventListener("DOMContentLoaded", async () => {
    const toggleEl = document.getElementById("btn-toggle-system");
    const websiteEl = document.getElementById("current-website");
    const checkBtn = document.getElementById("btn-password-check");
    const checkInput = document.getElementById("password-check-input");
    const feedbackEl = document.getElementById("password-check-feedback");
    const trackBtn = document.getElementById("btn-track-website");
    const trackStatus = document.getElementById("track-status");
    const settingsBtn = document.getElementById("btn-settings");

    const settings = await PSSStorage.getSettings();
    let enabled = settings.enabled !== false;
    updateToggleUI(enabled);

    toggleEl.addEventListener("click", async () => {
        enabled = !enabled;
        updateToggleUI(enabled);
        await PSSStorage.saveSettings({ ...settings, enabled });
    });

    function updateToggleUI(isOn) {
        toggleEl.textContent = isOn ? "ON" : "OFF";
        toggleEl.classList.toggle("off", !isOn);
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.startsWith("http")) {
        currentDomain = PSSCrypto.normalizeDomain(tab.url);
        websiteEl.textContent = currentDomain;
        const site = await PSSStorage.getSite(currentDomain);
        if (site) {
            trackBtn.textContent = "Website Tracked";
        }
    }

    let checkTimer = null;
    async function runPasswordCheck() {
        const pw = checkInput.value;
        if (!pw) {
            feedbackEl.textContent = "";
            return;
        }
        const res = await new Promise(resolve => {
            chrome.runtime.sendMessage(
                { action: "VALIDATE_PASSWORD", domain: currentDomain || "default", password: pw, strictReuse: true },
                resolve
            );
        });
        if (res && res.valid) {
            feedbackEl.textContent = "Password meets all requirements.";
        } else if (res && res.reason) {
            feedbackEl.textContent = res.reason;
        }
    }

    checkBtn.addEventListener("click", runPasswordCheck);
    checkInput.addEventListener("keydown", e => {
        if (e.key === "Enter") runPasswordCheck();
    });
    checkInput.addEventListener("input", () => {
        clearTimeout(checkTimer);
        checkTimer = setTimeout(runPasswordCheck, 300);
    });

    trackBtn.addEventListener("click", () => {
        if (!currentDomain) return;
        chrome.runtime.sendMessage(
            { action: "TRACK_SITE", domain: currentDomain },
            () => {
                trackBtn.textContent = "Website Tracked";
                trackStatus.textContent = `Tracking ${currentDomain} (30 days remaining)`;
            }
        );
    });

    settingsBtn.addEventListener("click", () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    });
});
