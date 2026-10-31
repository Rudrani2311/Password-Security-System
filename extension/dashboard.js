// Password Security System — Dashboard Script

document.addEventListener("DOMContentLoaded", () => {
    // Tab navigation
    document.querySelectorAll(".nav-item").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
        });
    });

    loadVault();
    loadSettings();

    // Breach Checker
    document.getElementById("btn-check-breach").addEventListener("click", runCheckerBreachCheck);
    document.getElementById("checker-password").addEventListener("keydown", e => {
        if (e.key === "Enter") runCheckerBreachCheck();
    });

    // Settings
    document.getElementById("btn-save-settings").addEventListener("click", saveSettings);
    document.getElementById("btn-test-server").addEventListener("click", testServerConnection);
    document.getElementById("btn-clear-vault").addEventListener("click", clearVault);

    // Add Site Modal
    document.getElementById("btn-add-site").addEventListener("click", () => {
        document.getElementById("add-site-modal").style.display = "flex";
    });
    document.getElementById("btn-add-modal-close").addEventListener("click", closeAddModal);
    document.getElementById("btn-add-cancel").addEventListener("click", closeAddModal);
    document.getElementById("btn-add-confirm").addEventListener("click", confirmAddSite);
});

// ─── Vault ────────────────────────────────────────────────────────────────

function loadVault() {
    chrome.runtime.sendMessage({ action: "GET_VAULT" }, response => {
        if (chrome.runtime.lastError || !response) return;
        renderVault(response.vault || []);
    });
}

function renderVault(vault) {
    const tbody = document.getElementById("vault-tbody");
    const emptyRow = document.getElementById("vault-empty-row");

    // Summary counts
    document.getElementById("sc-total").textContent = vault.length;
    document.getElementById("sc-active").textContent = vault.filter(s => !s.status.isExpired && !s.status.isNearExpiry).length;
    document.getElementById("sc-warn").textContent = vault.filter(s => s.status.isNearExpiry).length;
    document.getElementById("sc-expired").textContent = vault.filter(s => s.status.isExpired).length;

    // Clear old rows (keep empty-row template)
    Array.from(tbody.querySelectorAll("tr:not(#vault-empty-row)")).forEach(r => r.remove());

    if (!vault.length) {
        emptyRow.style.display = "";
        return;
    }
    emptyRow.style.display = "none";

    vault.forEach(site => {
        const status = site.status;
        const expiryDays = site.expiryDays || 30;
        const pct = Math.max(0, Math.min(100, Math.round((status.daysRemaining / expiryDays) * 100)));
        const barColor = status.isExpired ? "#ef4444" : status.isNearExpiry ? "#f59e0b" : "#10b981";
        const badgeClass = status.isExpired ? "badge-expired" : status.isNearExpiry ? "badge-warning" : "badge-active";
        const badgeText = status.isExpired ? `EXPIRED (${status.daysOverdue}d)` : status.isNearExpiry ? `${status.daysRemaining}d LEFT` : "ACTIVE";

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <div class="site-name-cell">${escHtml(site.siteName || site.domain)}</div>
                <div class="site-domain-cell">${escHtml(site.domain)}</div>
            </td>
            <td>${escHtml(site.username || "—")}</td>
            <td>${status.lastRotatedDate ? new Date(status.lastRotatedDate).toLocaleDateString() : "—"}</td>
            <td>
                <div class="expiry-bar-wrap">
                    <div class="expiry-bar-track">
                        <div class="expiry-bar-fill" style="width:${pct}%;background:${barColor};"></div>
                    </div>
                    <span class="expiry-bar-label">${status.isExpired ? "Overdue" : `${status.daysRemaining}d`}</span>
                </div>
            </td>
            <td><span class="badge ${badgeClass}">${badgeText}</span></td>
            <td>
                <div class="row-actions">
                    <button class="btn btn-outline btn-sm btn-rotate-row" data-domain="${escHtml(site.domain)}" data-sitename="${escHtml(site.siteName || site.domain)}">Rotate</button>
                    <button class="btn btn-ghost btn-sm btn-delete-row" data-domain="${escHtml(site.domain)}">Remove</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Bind row actions
    tbody.querySelectorAll(".btn-rotate-row").forEach(btn => {
        btn.addEventListener("click", () => openRowRotateModal(btn.dataset.domain, btn.dataset.sitename));
    });
    tbody.querySelectorAll(".btn-delete-row").forEach(btn => {
        btn.addEventListener("click", () => {
            if (confirm(`Remove "${btn.dataset.domain}" from vault?`)) {
                chrome.runtime.sendMessage({ action: "DELETE_SITE", domain: btn.dataset.domain }, () => loadVault());
            }
        });
    });
}

// ─── Row Rotate (inline prompt) ───────────────────────────────────────────

function openRowRotateModal(domain, siteName) {
    const pw = prompt(`Rotate password for ${siteName} (${domain})\n\nEnter new password:`);
    if (!pw) return;

    chrome.runtime.sendMessage({ action: "VALIDATE_PASSWORD", domain, password: pw }, response => {
        if (chrome.runtime.lastError || !response) {
            alert("Validation error. Please try again.");
            return;
        }
        if (!response.valid) {
            alert(`❌ Password Not Allowed:\n${response.reason}`);
            return;
        }
        chrome.runtime.sendMessage({ action: "RECORD_ROTATION", domain, password: pw }, rotRes => {
            if (rotRes && rotRes.success) {
                alert("✅ Password rotated successfully!");
                loadVault();
            } else {
                alert(`Failed: ${rotRes ? rotRes.message : "Unknown error"}`);
            }
        });
    });
}

// ─── Add Site Modal ───────────────────────────────────────────────────────

function closeAddModal() {
    document.getElementById("add-site-modal").style.display = "none";
    document.getElementById("add-domain").value = "";
    document.getElementById("add-sitename").value = "";
    document.getElementById("add-username").value = "";
    document.getElementById("add-modal-error").style.display = "none";
}

function confirmAddSite() {
    const domain = document.getElementById("add-domain").value.trim();
    const siteName = document.getElementById("add-sitename").value.trim();
    const username = document.getElementById("add-username").value.trim();
    const errEl = document.getElementById("add-modal-error");

    if (!domain) {
        errEl.textContent = "Please enter a domain.";
        errEl.style.display = "block";
        return;
    }

    chrome.runtime.sendMessage(
        { action: "TRACK_SITE", domain, siteName: siteName || domain, username },
        response => {
            if (response && response.success) {
                closeAddModal();
                loadVault();
            } else {
                errEl.textContent = "Failed to add site. Please try again.";
                errEl.style.display = "block";
            }
        }
    );
}

// ─── Breach Checker ───────────────────────────────────────────────────────

function runCheckerBreachCheck() {
    const pw = document.getElementById("checker-password").value;
    const resultEl = document.getElementById("checker-result");
    if (!pw) return;

    resultEl.style.display = "block";
    resultEl.className = "checker-result checker-unknown";
    resultEl.textContent = "🔍 Checking against HaveIBeenPwned database...";

    chrome.runtime.sendMessage({ action: "CHECK_BREACH", password: pw }, res => {
        if (chrome.runtime.lastError || !res) {
            resultEl.className = "checker-result checker-unknown";
            resultEl.textContent = "⚠️ Could not connect to HIBP. Check your internet connection.";
            return;
        }
        if (res.breached) {
            resultEl.className = "checker-result checker-found";
            resultEl.innerHTML = `
                🚨 <strong>BREACH DETECTED</strong><br>
                This password has been exposed in <strong>${res.count.toLocaleString()}</strong> known data breaches.<br>
                <span style="font-weight:400;font-size:12px;">You should not use this password anywhere. Choose a unique, strong password instead.</span>
            `;
        } else if (res.status === "OFFLINE_CHECK_SKIPPED") {
            resultEl.className = "checker-result checker-unknown";
            resultEl.textContent = "⚠️ You appear to be offline. Breach check was skipped.";
        } else {
            resultEl.className = "checker-result checker-safe";
            resultEl.innerHTML = `
                ✅ <strong>NO BREACHES FOUND</strong><br>
                This password was not found in any known public data breaches.<br>
                <span style="font-weight:400;font-size:12px;">This doesn't guarantee it's completely safe — always use a unique password per site.</span>
            `;
        }
    });
}

// ─── Settings ─────────────────────────────────────────────────────────────

function loadSettings() {
    chrome.runtime.sendMessage({ action: "GET_SETTINGS" }, settings => {
        if (!settings) return;
        document.getElementById("setting-expiry").value = settings.defaultExpiryDays || 30;
        document.getElementById("setting-warning").value = settings.defaultWarningDays || 5;
        document.getElementById("setting-notifs").checked = settings.browserNotificationsEnabled !== false;
        document.getElementById("setting-server").value = settings.serverUrl || "http://localhost:5000";
    });
}

function saveSettings() {
    const settings = {
        defaultExpiryDays: parseInt(document.getElementById("setting-expiry").value) || 30,
        defaultWarningDays: parseInt(document.getElementById("setting-warning").value) || 5,
        browserNotificationsEnabled: document.getElementById("setting-notifs").checked,
        serverUrl: document.getElementById("setting-server").value.trim() || "http://localhost:5000"
    };

    chrome.runtime.sendMessage({ action: "SAVE_SETTINGS", settings }, () => {
        const msg = document.getElementById("settings-saved-msg");
        msg.style.display = "inline";
        setTimeout(() => { msg.style.display = "none"; }, 2500);
    });
}

async function testServerConnection() {
    const url = document.getElementById("setting-server").value.trim();
    const resultEl = document.getElementById("server-test-result");
    resultEl.style.display = "block";
    resultEl.style.background = "#f8fafc";
    resultEl.style.color = "#64748b";
    resultEl.style.border = "1px solid #e2e8f0";
    resultEl.textContent = "Testing connection...";

    try {
        const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
        const data = await response.json();
        resultEl.style.background = "#d1fae5";
        resultEl.style.color = "#065f46";
        resultEl.style.border = "1px solid #6ee7b7";
        resultEl.textContent = `✅ Connected — ${data.service || "Server online"} (${new Date(data.timestamp).toLocaleTimeString()})`;
    } catch (err) {
        resultEl.style.background = "#fee2e2";
        resultEl.style.color = "#991b1b";
        resultEl.style.border = "1px solid #fca5a5";
        resultEl.textContent = `❌ Cannot connect to ${url}. Make sure the server is running.`;
    }
}

function clearVault() {
    if (!confirm("⚠️ This will permanently delete ALL tracked sites and password history. Are you sure?")) return;
    chrome.storage.local.remove(["pss_vault"], () => {
        alert("Vault cleared.");
        loadVault();
    });
}

// ─── Utilities ────────────────────────────────────────────────────────────

function escHtml(str) {
    return (str || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
