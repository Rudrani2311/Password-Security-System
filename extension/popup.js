// PassRotate Popup Controller

document.addEventListener("DOMContentLoaded", async () => {
    let currentTab = null;
    let currentDomain = "";
    let currentSite = null;

    // UI Elements
    const domainText = document.getElementById("current-domain-text");
    const statusPill = document.getElementById("site-status-pill");
    const userText = document.getElementById("site-username-text");
    const meterContainer = document.getElementById("expiry-meter-container");
    const meterFill = document.getElementById("meter-fill");
    const meterDaysLeft = document.getElementById("meter-days-left");
    const meterPercentage = document.getElementById("meter-percentage");
    const meterLastDate = document.getElementById("meter-last-date");
    const siteActions = document.getElementById("site-actions");
    const untrackedCard = document.getElementById("untracked-card");
    const simTools = document.getElementById("simulation-tools");

    // Modal elements
    const rotateModal = document.getElementById("popup-modal-rotate");
    const modalDomain = document.getElementById("modal-domain-name");
    const modalPassword = document.getElementById("modal-new-password");
    const modalBreachHint = document.getElementById("modal-breach-status");
    const btnCancelModal = document.getElementById("btn-modal-cancel");
    const btnSaveModal = document.getElementById("btn-modal-save");

    // Top action
    document.getElementById("btn-open-dashboard").addEventListener("click", () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
    });

    // 1. Detect Active Tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0] && tabs[0].url) {
        currentTab = tabs[0];
        currentDomain = PassRotateCrypto.normalizeDomain(currentTab.url);
    }

    if (!currentDomain || currentDomain === "newtab" || currentDomain.startsWith("chrome")) {
        domainText.innerText = "Browser / New Tab";
        statusPill.innerText = "STANDBY";
        statusPill.className = "status-pill status-pill-untracked";
        userText.innerText = "Navigate to a website (e.g. coursera.org or local demo) to inspect.";
    } else {
        domainText.innerText = currentDomain;
        await refreshCurrentSiteView();
    }

    // Refresh overall footer counts
    await refreshFooterStats();

    /**
     * Refreshes view for the currently inspected domain
     */
    async function refreshCurrentSiteView() {
        currentSite = await PassRotateStorage.getSite(currentDomain);

        if (!currentSite) {
            statusPill.innerText = "NOT TRACKED";
            statusPill.className = "status-pill status-pill-untracked";
            userText.innerText = "No rotation schedule active";
            meterContainer.style.display = "none";
            siteActions.style.display = "none";
            simTools.style.display = "none";
            untrackedCard.style.display = "block";
            return;
        }

        untrackedCard.style.display = "none";
        meterContainer.style.display = "block";
        siteActions.style.display = "grid";
        simTools.style.display = "block";

        userText.innerText = currentSite.username ? `Account: ${currentSite.username}` : "Account active";

        const status = PassRotateStorage.calculateStatus(currentSite);

        // Update Pill
        if (status.isExpired) {
            statusPill.innerText = `EXPIRED (${status.daysOverdue}d overdue)`;
            statusPill.className = "status-pill status-pill-expired";
        } else if (status.isNearExpiry) {
            statusPill.innerText = `WARN (${status.daysRemaining}d left)`;
            statusPill.className = "status-pill status-pill-warning";
        } else {
            statusPill.innerText = `ACTIVE (${status.daysRemaining}d left)`;
            statusPill.className = "status-pill status-pill-active";
        }

        // Update Meter
        const totalDays = currentSite.expiryDays || 30;
        const remaining = Math.max(0, status.daysRemaining);
        const percent = Math.min(100, Math.round((remaining / totalDays) * 100));

        meterPercentage.innerText = `${percent}%`;
        meterDaysLeft.innerText = status.isExpired ? "0 days remaining" : `${status.daysRemaining} days remaining`;
        meterFill.style.width = `${percent}%`;

        meterFill.className = "meter-fill " + (
            status.isExpired ? "meter-fill-expired" :
            status.isNearExpiry ? "meter-fill-warning" : "meter-fill-active"
        );

        const d = new Date(currentSite.lastRotatedAt);
        meterLastDate.innerText = isNaN(d.getTime()) ? "Recently" : d.toLocaleDateString();
    }

    // Button: Track this website
    document.getElementById("btn-track-site").addEventListener("click", async () => {
        const username = prompt(`Enter account username or email for ${currentDomain}:`, "user@gmail.com");
        if (username !== null) {
            await PassRotateStorage.saveSite({
                domain: currentDomain,
                siteName: currentDomain,
                username: username.trim(),
                lastRotatedAt: new Date().toISOString(),
                expiryDays: 30,
                warningThresholdDays: 5
            });
            await refreshCurrentSiteView();
            await refreshFooterStats();
            reloadActiveTab();
        }
    });

    // Button: Rotate Password (Popup modal)
    document.getElementById("btn-popup-rotate").addEventListener("click", () => {
        if (!currentSite) return;
        modalDomain.innerText = currentSite.siteName || currentDomain;
        modalPassword.value = "";
        modalBreachHint.innerHTML = "";
        rotateModal.style.display = "flex";
        modalPassword.focus();
    });

    // Breach check as user types in rotation modal
    let modalBreachTimer = null;
    modalPassword.addEventListener("input", () => {
        const val = modalPassword.value;
        if (!val) {
            modalBreachHint.innerHTML = "";
            return;
        }

        modalBreachHint.innerHTML = `<span style="color: #94a3b8;">Checking HIBP breach database...</span>`;
        clearTimeout(modalBreachTimer);
        modalBreachTimer = setTimeout(async () => {
            const res = await PassRotateHIBP.checkBreach(val);
            if (res.breached) {
                modalBreachHint.innerHTML = `<span style="color: #ef4444; font-weight: 600;">🚨 LEAK FOUND: ${res.count.toLocaleString()} breaches! Choose another.</span>`;
            } else {
                modalBreachHint.innerHTML = `<span style="color: #10b981;">✅ SAFE: 0 known breaches.</span>`;
            }
        }, 400);
    });

    btnCancelModal.addEventListener("click", () => {
        rotateModal.style.display = "none";
    });

    btnSaveModal.addEventListener("click", async () => {
        const newPass = modalPassword.value;
        if (!newPass || newPass.length < 6) {
            alert("Please enter a new password of at least 6 characters.");
            return;
        }

        const res = await PassRotateStorage.recordRotation(currentDomain, newPass, currentSite.username);
        if (res.success) {
            alert("✅ " + res.message);
            rotateModal.style.display = "none";
            await refreshCurrentSiteView();
            await refreshFooterStats();
            reloadActiveTab();
        } else {
            alert("⚠️ " + res.message);
        }
    });

    // Button: Trigger Forgot Password on active tab
    document.getElementById("btn-popup-forgot").addEventListener("click", () => {
        if (!currentSite) return;
        if (currentSite.forgotPasswordUrl) {
            chrome.tabs.update(currentTab.id, { url: currentSite.forgotPasswordUrl });
        } else if (currentDomain.includes("coursera.org")) {
            chrome.tabs.update(currentTab.id, { url: "https://www.coursera.org/?authMode=resetPassword" });
        } else if (currentDomain.includes("github.com")) {
            chrome.tabs.update(currentTab.id, { url: "https://github.com/password_reset" });
        } else {
            alert(`Tip: Use the "Forgot Password" link on ${currentDomain} to get a reset link sent to your Gmail.`);
        }
    });

    // Simulation Buttons for Fast Grading
    document.getElementById("sim-fresh").addEventListener("click", async () => {
        await PassRotateStorage.simulateState(currentDomain, "ACTIVE");
        await refreshCurrentSiteView();
        await refreshFooterStats();
        reloadActiveTab();
    });

    document.getElementById("sim-warning").addEventListener("click", async () => {
        await PassRotateStorage.simulateState(currentDomain, "NEAR_EXPIRY");
        await refreshCurrentSiteView();
        await refreshFooterStats();
        reloadActiveTab();
    });

    document.getElementById("sim-expired").addEventListener("click", async () => {
        await PassRotateStorage.simulateState(currentDomain, "EXPIRED");
        await refreshCurrentSiteView();
        await refreshFooterStats();
        reloadActiveTab();
    });

    // Quick Dark Web Breach Scanner Card
    const breachInput = document.getElementById("breach-check-input");
    const breachResult = document.getElementById("breach-quick-result");
    const btnBreach = document.getElementById("btn-run-breach-check");

    btnBreach.addEventListener("click", async () => {
        const pwd = breachInput.value;
        if (!pwd) {
            breachResult.style.display = "block";
            breachResult.className = "breach-result-box breach-result-danger";
            breachResult.innerText = "Please enter a password to test.";
            return;
        }

        breachResult.style.display = "block";
        breachResult.className = "breach-result-box";
        breachResult.innerText = "🔍 Checking HaveIBeenPwned API (k-Anonymity)...";

        const res = await PassRotateHIBP.checkBreach(pwd);

        if (res.breached) {
            breachResult.className = "breach-result-box breach-result-danger";
            breachResult.innerHTML = `🚨 <strong>BREACH DETECTED!</strong> This password was exposed in <strong>${res.count.toLocaleString()}</strong> known data leaks. Never use this password!`;
        } else {
            breachResult.className = "breach-result-box breach-result-safe";
            breachResult.innerHTML = `✅ <strong>CLEAN & SAFE!</strong> 0 breaches found for this password in public breach indexes.`;
        }
    });

    // Refresh Footer Stats
    async function refreshFooterStats() {
        const vault = await PassRotateStorage.getVault();
        let expired = 0;
        let warning = 0;

        for (const site of vault) {
            const st = PassRotateStorage.calculateStatus(site);
            if (st.isExpired) expired++;
            else if (st.isNearExpiry) warning++;
        }

        document.getElementById("total-sites-count").innerText = vault.length;
        document.getElementById("warn-sites-count").innerText = warning;
        document.getElementById("expired-sites-count").innerText = expired;
    }

    function reloadActiveTab() {
        if (currentTab && currentTab.id) {
            chrome.tabs.reload(currentTab.id);
        }
    }
});
