// PassRotate Content Script
// Injected into any website (e.g., Coursera, GitHub, or local demo) to enforce password lifecycle & security

(function () {
    // Avoid double injection
    if (window.__passrotate_injected) return;
    window.__passrotate_injected = true;

    const currentDomain = PassRotateCrypto.normalizeDomain(window.location.hostname);
    let currentSiteData = null;
    let currentStatus = null;

    // Initialize content script
    init();

    function init() {
        // Query the background service worker for this site's status
        chrome.runtime.sendMessage(
            { action: "GET_SITE_STATUS", domain: currentDomain },
            (response) => {
                if (chrome.runtime.lastError || !response) return;

                if (response.managed) {
                    currentSiteData = response.site;
                    currentStatus = response.status;
                    handleLifecycleState();
                } else {
                    // Site not yet in vault - watch for form submissions to offer tracking
                    observeNewLogins();
                }
            }
        );

        // Listen for live state simulation messages from popup or dashboard
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg.action === "REFRESH_VIEW") {
                location.reload();
            }
        });
    }

    /**
     * Handles NEAR_EXPIRY (5-day warning) or EXPIRED (lockout)
     */
    function handleLifecycleState() {
        if (!currentStatus) return;

        if (currentStatus.isExpired) {
            // Priority 1: Password has expired (30 days reached)
            enforceLockoutPolicy();
        } else if (currentStatus.isNearExpiry) {
            // Priority 2: Near Expiry (<= 5 days left)
            renderNearExpiryBanner();
        }
    }

    /* ========================================================================== */
    /* 1. NEAR-EXPIRY WARNING BANNER (5 DAYS BEFORE EXPIRY)                       */
    /* ========================================================================== */
    function renderNearExpiryBanner() {
        if (document.getElementById("passrotate-warning-banner")) return;

        const banner = document.createElement("div");
        banner.id = "passrotate-warning-banner";

        const days = currentStatus.daysRemaining;
        const siteName = currentSiteData.siteName || currentDomain;

        banner.innerHTML = `
            <div class="passrotate-content">
                <span class="passrotate-icon-badge">⚠️ ${days} Day${days === 1 ? "" : "s"} Left</span>
                <span>
                    <strong>PassRotate Security Policy:</strong> Your password for <strong>${escapeHtml(siteName)}</strong> 
                    expires in <strong>${days} day${days === 1 ? "" : "s"}</strong>. Please rotate it before lockout occurs.
                </span>
            </div>
            <div class="passrotate-actions">
                <button id="passrotate-btn-reset-now" class="passrotate-btn passrotate-btn-primary">
                    🔄 Rotate / Reset Password
                </button>
                <button id="passrotate-btn-dismiss" class="passrotate-btn passrotate-btn-close" title="Dismiss">✕</button>
            </div>
        `;

        document.body.prepend(banner);

        document.getElementById("passrotate-btn-reset-now").addEventListener("click", () => {
            openRotationOrForgotModal();
        });

        document.getElementById("passrotate-btn-dismiss").addEventListener("click", () => {
            banner.remove();
        });
    }

    /* ========================================================================== */
    /* 2. EXPIRED LOCKOUT GATEKEEPER (ENFORCED ROTATION)                          */
    /* ========================================================================== */
    function enforceLockoutPolicy() {
        // Find all password inputs on the page
        const passwordInputs = document.querySelectorAll('input[type="password"]');

        passwordInputs.forEach((input) => {
            input.classList.add("passrotate-field-locked");
            input.setAttribute("title", "PassRotate: Password expired. Rotation required.");

            // Intercept attempts to focus or enter expired password
            input.addEventListener("focus", (e) => {
                showLockoutModal();
            });
        });

        // Intercept form submissions containing password fields
        document.querySelectorAll("form").forEach((form) => {
            if (form.querySelector('input[type="password"]')) {
                form.addEventListener(
                    "submit",
                    (e) => {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        showLockoutModal();
                        return false;
                    },
                    true
                );
            }
        });

        // If there's an active login form visible on the page, open the modal promptly
        if (passwordInputs.length > 0) {
            setTimeout(() => {
                showLockoutModal();
            }, 600);
        }
    }

    /**
     * Displays the full-screen Security Lockout Modal
     */
    function showLockoutModal() {
        if (document.getElementById("passrotate-lockout-backdrop")) return;

        const siteName = currentSiteData.siteName || currentDomain;
        const daysOverdue = currentStatus.daysOverdue || 0;
        const username = currentSiteData.username || "Registered User";

        const backdrop = document.createElement("div");
        backdrop.id = "passrotate-lockout-backdrop";

        backdrop.innerHTML = `
            <div id="passrotate-lockout-card">
                <div class="passrotate-card-header">
                    <div class="passrotate-shield-icon">🛡️</div>
                    <div>
                        <h2>Password Expired</h2>
                        <p>30-Day Mandatory Password Rotation Policy</p>
                    </div>
                </div>

                <div class="passrotate-card-body">
                    <div class="passrotate-alert-box">
                        <strong>🚫 Login Access Restricted:</strong> Your password for <strong>${escapeHtml(siteName)}</strong> 
                        is ${daysOverdue > 0 ? `<strong>${daysOverdue} days overdue</strong>` : "expired"}. 
                        Under security regulations, you must set a new password before you can log in.
                    </div>

                    <div class="passrotate-stats-grid">
                        <div class="passrotate-stat-tile">
                            <div class="label">Account</div>
                            <div class="value">${escapeHtml(username)}</div>
                        </div>
                        <div class="passrotate-stat-tile">
                            <div class="label">Status</div>
                            <div class="value" style="color: #ef4444;">EXPIRED (30d+)</div>
                        </div>
                    </div>

                    <!-- Option 1: Trigger Website Forgot Password -->
                    <button id="passrotate-btn-forgot-flow" class="passrotate-btn passrotate-btn-danger">
                        🔄 Reset via ${escapeHtml(siteName)} "Forgot Password"
                    </button>

                    <!-- Option 2: Record New Password & Check Breach -->
                    <button id="passrotate-btn-toggle-rotate" class="passrotate-btn passrotate-btn-outline">
                        ✍️ I've Reset My Password (Update & Verify)
                    </button>

                    <!-- Hidden Inline Rotation Form -->
                    <div id="passrotate-inline-rotation" class="passrotate-rotate-form" style="display: none;">
                        <div class="passrotate-input-group">
                            <label>Enter New Rotated Password:</label>
                            <input type="password" id="passrotate-new-pass-input" class="passrotate-input" placeholder="Type new password..." autocomplete="new-password">
                            <div id="passrotate-breach-feedback" class="passrotate-breach-indicator">
                                <span class="passrotate-breach-checking">ℹ️ Real-time dark web breach inspection enabled</span>
                            </div>
                        </div>
                        <button id="passrotate-btn-submit-rotation" class="passrotate-btn passrotate-btn-primary" style="width: 100%; justify-content: center;">
                            💾 Save & Reset 30-Day Policy
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);

        // Bind Action 1: Forgot Password Button
        document.getElementById("passrotate-btn-forgot-flow").addEventListener("click", () => {
            triggerForgotPasswordAction(siteName);
        });

        // Bind Action 2: Toggle Inline Rotation
        const toggleBtn = document.getElementById("passrotate-btn-toggle-rotate");
        const rotateForm = document.getElementById("passrotate-inline-rotation");
        toggleBtn.addEventListener("click", () => {
            rotateForm.style.display = rotateForm.style.display === "none" ? "block" : "none";
        });

        // Real-time HIBP Breach Checker on Typing
        const newPassInput = document.getElementById("passrotate-new-pass-input");
        const breachFeedback = document.getElementById("passrotate-breach-feedback");
        let debounceTimer = null;

        newPassInput.addEventListener("input", () => {
            const val = newPassInput.value;
            if (!val) {
                breachFeedback.innerHTML = `<span class="passrotate-breach-checking">ℹ️ Real-time dark web breach inspection enabled</span>`;
                return;
            }

            breachFeedback.innerHTML = `<span class="passrotate-breach-checking">🔍 Checking dark web database (k-Anonymity)...</span>`;
            clearTimeout(debounceTimer);

            debounceTimer = setTimeout(() => {
                chrome.runtime.sendMessage(
                    { action: "CHECK_PASSWORD_BREACH", password: val },
                    (res) => {
                        if (chrome.runtime.lastError || !res) return;

                        if (res.breached) {
                            breachFeedback.innerHTML = `
                                <span class="passrotate-breach-warn">
                                    🚨 LEAK DETECTED! Appears in <strong>${res.count.toLocaleString()}</strong> public data breaches. Do NOT use!
                                </span>
                            `;
                        } else {
                            breachFeedback.innerHTML = `
                                <span class="passrotate-breach-safe">
                                    ✅ SAFE: 0 known data breaches found in HIBP.
                                </span>
                            `;
                        }
                    }
                );
            }, 450);
        });

        // Submit Rotation
        document.getElementById("passrotate-btn-submit-rotation").addEventListener("click", async () => {
            const newPassword = newPassInput.value;
            if (!newPassword || newPassword.length < 6) {
                alert("Please enter a secure password with at least 6 characters.");
                return;
            }

            // Verify breach status one final time
            chrome.runtime.sendMessage(
                { action: "CHECK_PASSWORD_BREACH", password: newPassword },
                (breachRes) => {
                    if (breachRes && breachRes.breached) {
                        if (!confirm(`⚠️ Warning: This password was leaked in ${breachRes.count.toLocaleString()} public breaches! Are you sure you want to proceed?`)) {
                            return;
                        }
                    }

                    // Record rotation in background
                    chrome.runtime.sendMessage(
                        {
                            action: "RECORD_PASSWORD_ROTATION",
                            domain: currentDomain,
                            newPassword: newPassword,
                            username: currentSiteData.username
                        },
                        (rotRes) => {
                            if (rotRes && rotRes.success) {
                                alert("🎉 Success! " + rotRes.message);
                                backdrop.remove();
                                location.reload();
                            } else {
                                alert("⚠️ " + (rotRes ? rotRes.message : "Failed to record rotation."));
                            }
                        }
                    );
                }
            );
        });
    }

    /**
     * Automatic / Guided Forgot Password Action
     */
    function triggerForgotPasswordAction(siteName) {
        // Strategy 1: Look for on-page "Forgot password" links/buttons
        const linkSelectors = [
            'a[href*="forgot"]',
            'a[href*="reset"]',
            'a[href*="password"]',
            'button[id*="forgot"]',
            'button[class*="forgot"]'
        ];

        let targetElement = null;
        for (const selector of linkSelectors) {
            const el = document.querySelector(selector);
            if (el && isVisible(el)) {
                targetElement = el;
                break;
            }
        }

        // Also check by text content
        if (!targetElement) {
            const allLinks = Array.from(document.querySelectorAll("a, button"));
            targetElement = allLinks.find((el) => {
                const text = (el.innerText || "").toLowerCase();
                return text.includes("forgot") || text.includes("reset password") || text.includes("trouble logging in");
            });
        }

        if (targetElement) {
            targetElement.style.outline = "3px solid #f59e0b";
            targetElement.style.boxShadow = "0 0 15px #f59e0b";
            alert(`🔍 Found ${siteName}'s Forgot Password link on the page! Directing you there now to receive your Gmail reset link...`);
            targetElement.click();
            return;
        }

        // Strategy 2: If site has saved forgotPasswordUrl
        if (currentSiteData.forgotPasswordUrl) {
            window.location.href = currentSiteData.forgotPasswordUrl;
            return;
        }

        // Strategy 3: Standard known domain patterns (Coursera, GitHub, Google)
        if (currentDomain.includes("coursera.org")) {
            window.location.href = "https://www.coursera.org/?authMode=resetPassword";
            return;
        } else if (currentDomain.includes("github.com")) {
            window.location.href = "https://github.com/password_reset";
            return;
        }

        alert(`Please use the 'Forgot Password' link on ${siteName} to request a reset link to your Gmail.`);
    }

    function isVisible(el) {
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    function openRotationOrForgotModal() {
        showLockoutModal();
    }

    function observeNewLogins() {
        // If user is on an unmanaged site and submits a login form, we can observe
    }

    function escapeHtml(str) {
        return (str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
})();
