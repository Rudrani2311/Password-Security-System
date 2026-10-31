// Password Security System — Popup Script

let currentDomain = "";
let currentSite = null;
let currentStatus = null;

// ─── Init ──────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
    // Open dashboard
    document.getElementById("btn-dashboard").addEventListener("click", () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    });

    // Load current tab data
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.startsWith("http")) {
        currentDomain = PSSCrypto.normalizeDomain(tab.url);
        document.getElementById("domain-text").textContent = currentDomain;
        loadSiteStatus();
    } else {
        document.getElementById("domain-text").textContent = "Not a webpage";
        document.getElementById("status-pill").textContent = "N/A";
        document.getElementById("status-pill").className = "pill pill-checking";
    }

    // Breach checker
    document.getElementById("btn-breach-check").addEventListener("click", runBreachCheck);
    document.getElementById("breach-input").addEventListener("keydown", e => {
        if (e.key === "Enter") runBreachCheck();
    });

    // Vault stats
    loadVaultStats();
});

// ─── Site Status ───────────────────────────────────────────────────────────

function loadSiteStatus() {
    chrome.runtime.sendMessage({ action: "GET_SITE_STATUS", domain: currentDomain }, response => {
        if (chrome.runtime.lastError || !response) return;

        if (response.managed) {
            currentSite = response.site;
            currentStatus = response.status;
            renderTrackedSite(response.site, response.status);
        } else {
            renderUntrackedSite();
        }
    });
}

function renderTrackedSite(site, status) {
    const pill = document.getElementById("status-pill");
    const meter = document.getElementById("expiry-meter");
    const actions = document.getElementById("site-actions");
    const untracked = document.getElementById("untracked-msg");

    untracked.style.display = "none";
    meter.style.display = "flex";
    meter.style.flexDirection = "column";
    meter.style.gap = "6px";
    actions.style.display = "flex";

    document.getElementById("domain-text").textContent = site.siteName || site.domain;
    if (site.username) {
        document.getElementById("username-text").textContent = site.username;
    }

    const expiryDays = site.expiryDays || 30;
    const remaining = status.daysRemaining;
    const pct = Math.max(0, Math.min(100, Math.round((remaining / expiryDays) * 100)));

    document.getElementById("days-left-text").textContent =
        status.isExpired ? `Expired (${status.daysOverdue}d overdue)` : `${remaining} day${remaining === 1 ? "" : "s"} remaining`;
    document.getElementById("pct-text").textContent = `${pct}%`;
    document.getElementById("last-rotated-text").textContent =
        status.lastRotatedDate ? new Date(status.lastRotatedDate).toLocaleDateString() : "Unknown";

    const fill = document.getElementById("meter-fill");
    fill.style.width = pct + "%";
    fill.style.background = status.isExpired ? "#ef4444" : status.isNearExpiry ? "#f59e0b" : "#10b981";

    if (status.isExpired) {
        pill.textContent = "EXPIRED";
        pill.className = "pill pill-expired";
    } else if (status.isNearExpiry) {
        pill.textContent = `${remaining}d LEFT`;
        pill.className = "pill pill-warning";
    } else {
        pill.textContent = "ACTIVE";
        pill.className = "pill pill-active";
    }

    // Rotate button
    document.getElementById("btn-rotate").addEventListener("click", () => openRotateModal(site));

    // Forgot Password button
    document.getElementById("btn-forgot").addEventListener("click", async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
            chrome.tabs.sendMessage(tab.id, { action: "TRIGGER_FORGOT_PASSWORD" });
            window.close();
        }
    });
}

function renderUntrackedSite() {
    const pill = document.getElementById("status-pill");
    pill.textContent = "NOT TRACKED";
    pill.className = "pill pill-new";

    document.getElementById("expiry-meter").style.display = "none";
    document.getElementById("site-actions").style.display = "none";
    document.getElementById("untracked-msg").style.display = "block";

    document.getElementById("btn-track-now").addEventListener("click", () => {
        chrome.runtime.sendMessage({
            action: "TRACK_SITE",
            domain: currentDomain,
            siteName: currentDomain
        }, () => {
            loadSiteStatus();
            loadVaultStats();
        });
    });
}

// ─── Rotate Modal ──────────────────────────────────────────────────────────

function openRotateModal(site) {
    document.getElementById("modal-domain").textContent = site.siteName || site.domain;
    document.getElementById("rotate-modal").style.display = "flex";

    let debounce = null;
    document.getElementById("modal-password").addEventListener("input", e => {
        const val = e.target.value;
        updateModalStrength(val);
        clearTimeout(debounce);
        document.getElementById("modal-breach-status").textContent = val.length >= 4 ? "Checking breach database..." : "";
        if (val.length >= 4) {
            debounce = setTimeout(() => {
                chrome.runtime.sendMessage({ action: "CHECK_BREACH", password: val }, res => {
                    if (chrome.runtime.lastError || !res) return;
                    const el = document.getElementById("modal-breach-status");
                    if (res.breached) {
                        el.textContent = `🚨 Breached! Found in ${res.count.toLocaleString()} leaks`;
                        el.style.color = "#ef4444";
                    } else {
                        el.textContent = "✅ Not found in breach databases";
                        el.style.color = "#10b981";
                    }
                });
            }, 500);
        }
    });

    document.getElementById("btn-modal-close").addEventListener("click", closeRotateModal);
    document.getElementById("btn-modal-cancel").addEventListener("click", closeRotateModal);
    document.getElementById("btn-modal-save").addEventListener("click", () => saveRotation(site));
}

function closeRotateModal() {
    document.getElementById("rotate-modal").style.display = "none";
    document.getElementById("modal-password").value = "";
    document.getElementById("modal-breach-status").textContent = "";
    document.getElementById("modal-strength").style.display = "none";
    document.getElementById("modal-error").style.display = "none";
}

function saveRotation(site) {
    const pw = document.getElementById("modal-password").value;
    const errorEl = document.getElementById("modal-error");
    errorEl.style.display = "none";

    if (!pw) {
        showModalError("Please enter a password.");
        return;
    }

    chrome.runtime.sendMessage(
        { action: "VALIDATE_PASSWORD", domain: site.domain, password: pw },
        response => {
            if (chrome.runtime.lastError || !response) {
                showModalError("Validation error. Please try again.");
                return;
            }
            if (!response.valid) {
                showModalError(`❌ ${response.reason}`);
                return;
            }

            chrome.runtime.sendMessage(
                { action: "RECORD_ROTATION", domain: site.domain, password: pw, username: site.username },
                rotRes => {
                    if (rotRes && rotRes.success) {
                        closeRotateModal();
                        loadSiteStatus();
                        loadVaultStats();
                        alert("✅ Password rotated successfully! 30-day countdown restarted.");
                    } else {
                        showModalError(rotRes ? rotRes.message : "Failed to save rotation.");
                    }
                }
            );
        }
    );
}

function showModalError(msg) {
    const el = document.getElementById("modal-error");
    el.textContent = msg;
    el.style.display = "block";
}

function updateModalStrength(password) {
    const el = document.getElementById("modal-strength");
    if (!password) { el.style.display = "none"; return; }
    el.style.display = "block";

    const checks = [
        { pass: password.length >= 8,          msg: "8+ characters" },
        { pass: /[A-Z]/.test(password),        msg: "Uppercase" },
        { pass: /[a-z]/.test(password),        msg: "Lowercase" },
        { pass: /[0-9]/.test(password),        msg: "Number" },
        { pass: /[^A-Za-z0-9]/.test(password), msg: "Special char" }
    ];
    const passed = checks.filter(c => c.pass).length;
    const colors = ["", "#ef4444", "#ef4444", "#f59e0b", "#22c55e", "#10b981"];
    const labels = ["", "Very Weak", "Weak", "Fair", "Good", "Strong"];

    el.innerHTML = `
        <div style="height:4px;background:#e2e8f0;border-radius:4px;overflow:hidden;margin-bottom:4px;">
            <div style="height:100%;width:${(passed/5)*100}%;background:${colors[passed]};border-radius:4px;transition:all 0.3s;"></div>
        </div>
        <span style="font-size:10px;font-weight:700;color:${colors[passed]};">${labels[passed]}</span>
        <div style="font-size:10px;color:#64748b;margin-top:3px;">${checks.map(c => `${c.pass ? "✓" : "✗"} ${c.msg}`).join(" · ")}</div>
    `;
}

// ─── HIBP Breach Checker ───────────────────────────────────────────────────

function runBreachCheck() {
    const pw = document.getElementById("breach-input").value;
    const resultEl = document.getElementById("breach-result");

    if (!pw) return;

    resultEl.style.display = "block";
    resultEl.className = "breach-result breach-unknown";
    resultEl.textContent = "🔍 Checking...";

    chrome.runtime.sendMessage({ action: "CHECK_BREACH", password: pw }, res => {
        if (chrome.runtime.lastError || !res) {
            resultEl.className = "breach-result breach-unknown";
            resultEl.textContent = "⚠️ Could not check — try again.";
            return;
        }
        if (res.breached) {
            resultEl.className = "breach-result breach-found";
            resultEl.textContent = `🚨 BREACHED — Found in ${res.count.toLocaleString()} known data breaches. Do NOT use this password.`;
        } else if (res.status === "OFFLINE_CHECK_SKIPPED") {
            resultEl.className = "breach-result breach-unknown";
            resultEl.textContent = "⚠️ Offline — breach check skipped.";
        } else {
            resultEl.className = "breach-result breach-safe";
            resultEl.textContent = "✅ SAFE — Not found in any known data breaches.";
        }
    });
}

// ─── Vault Stats ───────────────────────────────────────────────────────────

function loadVaultStats() {
    chrome.runtime.sendMessage({ action: "GET_VAULT" }, response => {
        if (chrome.runtime.lastError || !response) return;
        const vault = response.vault || [];
        document.getElementById("total-count").textContent = vault.length;
        document.getElementById("warn-count").textContent = vault.filter(s => s.status.isNearExpiry).length;
        document.getElementById("expired-count").textContent = vault.filter(s => s.status.isExpired).length;
    });
}
