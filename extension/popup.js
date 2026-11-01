let currentDomain = "";

document.addEventListener("DOMContentLoaded", async () => {
    const containerEl = document.querySelector(".popup-container");
    const toggleEl = document.getElementById("btn-toggle-system");
    const websiteEl = document.getElementById("current-website");
    const checkBtn = document.getElementById("btn-password-check");
    const checkInput = document.getElementById("password-check-input");
    const feedbackEl = document.getElementById("password-check-feedback");
    const trackBtn = document.getElementById("btn-track-website");
    const trackStatus = document.getElementById("track-status");
    const settingsBtn = document.getElementById("btn-settings");

    let settings = await PSSStorage.getSettings();
    let enabled = settings.enabled !== false;
    updateToggleUI(enabled);

    toggleEl.addEventListener("click", async () => {
        enabled = !enabled;
        settings = await PSSStorage.saveSettings({ ...settings, enabled });
        updateToggleUI(enabled);
        try {
            chrome.runtime.sendMessage(
                { action: "SET_SYSTEM_ENABLED", enabled },
                () => { void chrome.runtime.lastError; }
            );
        } catch {}
    });

    function updateToggleUI(isOn) {
        toggleEl.textContent = isOn ? "On" : "Off";
        toggleEl.classList.toggle("off", !isOn);
        containerEl.classList.toggle("popup-disabled", !isOn);
        checkInput.disabled = !isOn;
        trackBtn.disabled = !isOn;
        if (!isOn) {
            feedbackEl.textContent = "";
            trackStatus.textContent = "Password expiry system is turned off.";
        } else {
            trackStatus.textContent = "";
        }
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.startsWith("http")) {
        currentDomain = PSSCrypto.normalizeDomain(tab.url);
        websiteEl.textContent = currentDomain;
        const site = await PSSStorage.getSite(currentDomain);
        if (site) {
            trackBtn.textContent = "Website tracked";
        }
    }

    let checkTimer = null;
    async function runPasswordCheck() {
        if (!enabled) return;
        const pw = checkInput.value;
        if (!pw) {
            feedbackEl.textContent = "";
            return;
        }
        const res = await new Promise(resolve => {
            try {
                chrome.runtime.sendMessage(
                    { action: "VALIDATE_PASSWORD", domain: currentDomain || "default", password: pw, strictReuse: true },
                    r => {
                        void chrome.runtime.lastError;
                        resolve(r);
                    }
                );
            } catch {
                resolve(null);
            }
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
        checkTimer = setTimeout(runPasswordCheck, 250);
    });

    trackBtn.addEventListener("click", () => {
        if (!enabled || !currentDomain) return;
        try {
            chrome.runtime.sendMessage(
                { action: "TRACK_SITE", domain: currentDomain },
                () => {
                    void chrome.runtime.lastError;
                    trackBtn.textContent = "Website tracked";
                    trackStatus.textContent = `Tracking ${currentDomain} (30 days remaining)`;
                }
            );
        } catch {}
    });

    settingsBtn.addEventListener("click", () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    });
});
