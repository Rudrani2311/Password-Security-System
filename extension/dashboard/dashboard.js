// PassRotate Dashboard Controller

document.addEventListener("DOMContentLoaded", async () => {
    let vaultData = [];
    let settingsData = {};

    // Elements
    const tableBody = document.getElementById("vault-table-body");
    const searchInput = document.getElementById("vault-search-input");
    const siteModal = document.getElementById("modal-site-edit");

    // Metrics
    const metricTotal = document.getElementById("metric-total-sites");
    const metricActive = document.getElementById("metric-active-sites");
    const metricWarning = document.getElementById("metric-warning-sites");
    const metricExpired = document.getElementById("metric-expired-sites");

    // Initialize
    await loadSettings();
    await loadVault();

    // Setup Tabs
    document.querySelectorAll(".nav-item").forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const tabId = link.getAttribute("data-tab");

            document.querySelectorAll(".nav-item").forEach((l) => l.classList.remove("active"));
            link.classList.add("active");

            document.querySelectorAll(".tab-pane").forEach((pane) => pane.classList.remove("active"));
            const targetPane = document.getElementById(`tab-${tabId}`);
            if (targetPane) targetPane.classList.add("active");

            // Update topbar headers
            if (tabId === "vault") {
                document.getElementById("page-heading").innerText = "Password Vault & Lifecycle Management";
                document.getElementById("page-subheading").innerText = "Enforcing 30-day password expiry and breach checks across all accounts";
            } else if (tabId === "breach") {
                document.getElementById("page-heading").innerText = "Dark Web Breach Auditor";
                document.getElementById("page-subheading").innerText = "Real-time k-Anonymity checks via HaveIBeenPwned API";
            } else if (tabId === "notifications") {
                document.getElementById("page-heading").innerText = "Gmail & Alert Notification Preferences";
                document.getElementById("page-subheading").innerText = "Configure alerts for passwords nearing the 5-day expiry window";
            } else if (tabId === "help") {
                document.getElementById("page-heading").innerText = "Project Architecture & Presentation Guide";
                document.getElementById("page-subheading").innerText = "Detailed reference on how the system protects any website";
            }
        });
    });

    /**
     * Load vault data and render table
     */
    async function loadVault() {
        vaultData = await PassRotateStorage.getVault();
        renderVaultTable(vaultData);
        updateMetrics(vaultData);
    }

    /**
     * Render the vault rows
     */
    function renderVaultTable(sites) {
        tableBody.innerHTML = "";

        const query = (searchInput.value || "").toLowerCase().trim();
        const filtered = sites.filter((s) => {
            if (!query) return true;
            return (
                (s.siteName || "").toLowerCase().includes(query) ||
                (s.domain || "").toLowerCase().includes(query) ||
                (s.username || "").toLowerCase().includes(query)
            );
        });

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 30px; color: #64748b;">
                        No monitored websites match your query. Click "+ Add Website" to track a new site.
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach((site) => {
            const status = PassRotateStorage.calculateStatus(site);
            const tr = document.createElement("tr");

            // Status Badge HTML
            let badgeHtml = "";
            if (status.isExpired) {
                badgeHtml = `<span class="status-badge status-expired">Expired (${status.daysOverdue}d overdue)</span>`;
            } else if (status.isNearExpiry) {
                badgeHtml = `<span class="status-badge status-warn">Warning (${status.daysRemaining}d left)</span>`;
            } else {
                badgeHtml = `<span class="status-badge status-active">Active (${status.daysRemaining}d left)</span>`;
            }

            const rotatedDate = new Date(site.lastRotatedAt);
            const formattedDate = isNaN(rotatedDate.getTime()) ? "Unknown" : rotatedDate.toLocaleDateString();

            tr.innerHTML = `
                <td>
                    <div class="site-title-cell">
                        <span class="site-name-bold">${escapeHtml(site.siteName || site.domain)}</span>
                        <span class="site-domain-sub">${escapeHtml(site.domain)}</span>
                    </div>
                </td>
                <td>${escapeHtml(site.username || "—")}</td>
                <td>${formattedDate}</td>
                <td><strong>${status.daysRemaining} days</strong></td>
                <td>${badgeHtml}</td>
                <td>
                    <div class="sim-group">
                        <button class="sim-pill" data-sim="ACTIVE" data-domain="${escapeHtml(site.domain)}" title="Reset to Day 0">Fresh</button>
                        <button class="sim-pill sim-pill-warn" data-sim="NEAR_EXPIRY" data-domain="${escapeHtml(site.domain)}" title="Set to 4 days left">Warn 5d</button>
                        <button class="sim-pill sim-pill-danger" data-sim="EXPIRED" data-domain="${escapeHtml(site.domain)}" title="Set to Expired">Expired</button>
                    </div>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-secondary btn-sm btn-rotate-action" data-domain="${escapeHtml(site.domain)}">🔄 Rotate</button>
                        <button class="btn btn-secondary btn-sm btn-visit-action" data-url="${escapeHtml(site.domain)}">↗️ Visit</button>
                        <button class="btn btn-secondary btn-sm btn-delete-action" data-id="${escapeHtml(site.id)}" style="color: #ef4444;">🗑️</button>
                    </div>
                </td>
            `;

            tableBody.appendChild(tr);
        });

        // Bind simulation buttons
        document.querySelectorAll(".sim-pill").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const domain = btn.getAttribute("data-domain");
                const targetState = btn.getAttribute("data-sim");
                await PassRotateStorage.simulateState(domain, targetState);
                await loadVault();
            });
        });

        // Bind rotate actions
        document.querySelectorAll(".btn-rotate-action").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const domain = btn.getAttribute("data-domain");
                const newPass = prompt(`Enter new rotated password for ${domain}:`);
                if (newPass) {
                    if (newPass.length < 6) {
                        alert("Password must be at least 6 characters.");
                        return;
                    }

                    // Check breach
                    const breach = await PassRotateHIBP.checkBreach(newPass);
                    if (breach.breached) {
                        if (!confirm(`⚠️ Warning: This password was leaked in ${breach.count.toLocaleString()} data breaches! Are you sure you want to use it?`)) {
                            return;
                        }
                    }

                    const res = await PassRotateStorage.recordRotation(domain, newPass);
                    alert("✅ " + res.message);
                    await loadVault();
                }
            });
        });

        // Bind visit actions
        document.querySelectorAll(".btn-visit-action").forEach((btn) => {
            btn.addEventListener("click", () => {
                let domain = btn.getAttribute("data-url");
                if (domain === "localhost") domain = "http://localhost:5000";
                else if (!domain.startsWith("http")) domain = "https://" + domain;
                window.open(domain, "_blank");
            });
        });

        // Bind delete actions
        document.querySelectorAll(".btn-delete-action").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const id = btn.getAttribute("data-id");
                if (confirm("Remove this site from PassRotate?")) {
                    await PassRotateStorage.deleteSite(id);
                    await loadVault();
                }
            });
        });
    }

    /**
     * Compute and render high-level metrics
     */
    function updateMetrics(sites) {
        let active = 0;
        let warning = 0;
        let expired = 0;

        sites.forEach((site) => {
            const st = PassRotateStorage.calculateStatus(site);
            if (st.isExpired) expired++;
            else if (st.isNearExpiry) warning++;
            else active++;
        });

        metricTotal.innerText = sites.length;
        metricActive.innerText = active;
        metricWarning.innerText = warning;
        metricExpired.innerText = expired;
    }

    // Search filter
    searchInput.addEventListener("input", () => {
        renderVaultTable(vaultData);
    });

    // Add Website Modal
    const btnAddSite = document.getElementById("btn-add-site");
    const btnCloseModal = document.getElementById("btn-close-site-modal");
    const btnCancelModal = document.getElementById("btn-cancel-site-edit");
    const btnSaveSite = document.getElementById("btn-save-site-edit");

    btnAddSite.addEventListener("click", () => {
        document.getElementById("edit-site-id").value = "";
        document.getElementById("edit-site-domain").value = "";
        document.getElementById("edit-site-name").value = "";
        document.getElementById("edit-site-username").value = "";
        document.getElementById("edit-site-forgot-url").value = "";
        document.getElementById("edit-site-expiry").value = "30";
        siteModal.style.display = "flex";
    });

    function closeSiteModal() {
        siteModal.style.display = "none";
    }

    btnCloseModal.addEventListener("click", closeSiteModal);
    btnCancelModal.addEventListener("click", closeSiteModal);

    btnSaveSite.addEventListener("click", async () => {
        const domain = document.getElementById("edit-site-domain").value.trim();
        const siteName = document.getElementById("edit-site-name").value.trim() || domain;
        const username = document.getElementById("edit-site-username").value.trim();
        const forgotUrl = document.getElementById("edit-site-forgot-url").value.trim();
        const expiry = parseInt(document.getElementById("edit-site-expiry").value, 10) || 30;

        if (!domain) {
            alert("Please enter a domain name.");
            return;
        }

        await PassRotateStorage.saveSite({
            domain,
            siteName,
            username,
            forgotPasswordUrl: forgotUrl,
            expiryDays: expiry,
            warningThresholdDays: 5,
            lastRotatedAt: new Date().toISOString()
        });

        closeSiteModal();
        await loadVault();
    });

    // Standalone Dark Web Breach Auditor Tab
    const breachInput = document.getElementById("full-breach-input");
    const btnAuditCheck = document.getElementById("btn-audit-check");
    const auditResult = document.getElementById("full-breach-result");

    btnAuditCheck.addEventListener("click", async () => {
        const password = breachInput.value;
        if (!password) {
            alert("Please enter a password to evaluate.");
            return;
        }

        auditResult.style.display = "block";
        auditResult.style.background = "#1e293b";
        auditResult.style.color = "#cbd5e1";
        auditResult.innerHTML = `🔍 Hashing via WebCrypto SHA-1 and querying HaveIBeenPwned API range...`;

        const res = await PassRotateHIBP.checkBreach(password);

        if (res.breached) {
            auditResult.style.background = "rgba(239, 68, 68, 0.15)";
            auditResult.style.border = "1px solid rgba(239, 68, 68, 0.4)";
            auditResult.style.color = "#fca5a5";
            auditResult.innerHTML = `
                <div style="font-size: 16px; font-weight: 700; color: #ef4444; margin-bottom: 6px;">
                    🚨 HIGH RISK: PASSWORD COMPROMISED!
                </div>
                <div>This exact password has appeared in <strong>${res.count.toLocaleString()}</strong> public dark web and corporate data breaches.</div>
                <div style="margin-top: 8px; font-size: 12px; color: #94a3b8;">
                    API SHA-1 Prefix: <code>${res.hashPrefix}*****</code> (Verified via k-Anonymity)
                </div>
            `;
        } else {
            auditResult.style.background = "rgba(16, 185, 129, 0.15)";
            auditResult.style.border = "1px solid rgba(16, 185, 129, 0.4)";
            auditResult.style.color = "#86efac";
            auditResult.innerHTML = `
                <div style="font-size: 16px; font-weight: 700; color: #10b981; margin-bottom: 6px;">
                    ✅ EXCELLENT: 0 BREACHES FOUND
                </div>
                <div>This password does not appear in any known public data leaks indexed by HaveIBeenPwned.</div>
            `;
        }
    });

    // Settings & Notifications Tab
    async function loadSettings() {
        settingsData = await PassRotateStorage.getSettings();
        document.getElementById("setting-email").value = settingsData.userEmail || "";
        document.getElementById("setting-warn-toggle").checked = !!settingsData.emailAlertsEnabled;
        document.getElementById("setting-notify-toggle").checked = !!settingsData.browserNotificationsEnabled;
        document.getElementById("setting-webhook").value = settingsData.webhookAlertUrl || "";
    }

    document.getElementById("btn-save-settings").addEventListener("click", async () => {
        settingsData.userEmail = document.getElementById("setting-email").value.trim();
        settingsData.emailAlertsEnabled = document.getElementById("setting-warn-toggle").checked;
        settingsData.browserNotificationsEnabled = document.getElementById("setting-notify-toggle").checked;
        settingsData.webhookAlertUrl = document.getElementById("setting-webhook").value.trim();

        await PassRotateStorage.saveSettings(settingsData);
        alert("✅ Preferences saved successfully!");
    });

    // Test Alert Button (Topbar)
    document.getElementById("btn-test-notification").addEventListener("click", () => {
        chrome.runtime.sendMessage({
            action: "TRIGGER_TEST_NOTIFICATION",
            title: "⚠️ PassRotate 5-Day Expiry Alert",
            message: "Your Coursera password will expire in 4 days. Click to rotate now.",
            type: "NEAR_EXPIRY",
            site: { siteName: "Coursera", domain: "coursera.org", username: "student@gmail.com" }
        }, (res) => {
            alert("🔔 Test alert dispatched to system notifications and email bridge!");
        });
    });

    function escapeHtml(str) {
        return (str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
});
