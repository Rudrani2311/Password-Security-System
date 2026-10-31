// Password Security System — Universal Content Script
// Works on ANY website (CUIMS, Coursera, LinkedIn, TryHackMe, Postman, GitHub, etc.)
//
// Core Flow:
// 1. User fills in username & password on any login/reset form and clicks Login/Submit.
// 2. Extension intercepts the login attempt BEFORE submission:
//    - IF password is EXPIRED (30+ days):
//      Blocks login ("Password Not Allowed — Password Expired"), scans the page for
//      "Forgot Password", and redirects the user to rotate their password.
//    - IF user enters a rotated/new password (or logs in):
//      Checks:
//        (1) Not one of the old passwords stored in MongoDB / history
//        (2) Meets security requirements (8+ chars, upper, lower, digit, special char)
//        (3) Has not appeared in a data breach (HaveIBeenPwned API)
//      Only if all checks pass does it allow login; otherwise blocks with "Password Not Allowed".
// 3. Displays a warning banner when the password is going to expire in 5 days (<= 5 days left).

(function () {
    if (window.__pss_injected) return;
    window.__pss_injected = true;

    const domain = normalizeDomain(window.location.hostname);
    let currentSite = null;
    let currentStatus = null;

    init();

    function init() {
        // Query site status for 5-day warning banner
        chrome.runtime.sendMessage({ action: "GET_SITE_STATUS", domain }, response => {
            if (chrome.runtime.lastError || !response) return;
            if (response.managed) {
                currentSite = response.site;
                currentStatus = response.status;
                if (currentStatus.isNearExpiry) {
                    showNearExpiryBanner(currentSite, currentStatus);
                }
            }
        });

        // Attach login & password form interceptors across the entire page
        attachFormInterceptors();
        const observer = new MutationObserver(() => attachFormInterceptors());
        observer.observe(document.documentElement, { childList: true, subtree: true });

        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === "TRIGGER_FORGOT_PASSWORD") {
                findAndRedirectForgotPassword(currentSite ? currentSite.siteName : domain);
            } else if (msg.action === "REFRESH_VIEW") {
                location.reload();
            }
        });
    }

    // ─── 1. Near-Expiry Warning Banner ("Your password is going to expire in 5 days") ──

    function showNearExpiryBanner(site, status) {
        if (document.getElementById("pss-warning-banner")) return;

        const days = status.daysRemaining;
        const banner = document.createElement("div");
        banner.id = "pss-warning-banner";
        banner.innerHTML = `
            <div class="pss-banner-content">
                <span class="pss-banner-icon">⚠️</span>
                <span class="pss-banner-text">
                    <strong>Password Security System Warning:</strong>
                    Your password for <strong>${escHtml(site.siteName || domain)}</strong> is going to expire in <strong>${days} day${days === 1 ? "" : "s"}</strong>.
                    Please rotate your password soon to avoid login lockout.
                </span>
            </div>
            <div class="pss-banner-actions">
                <button id="pss-btn-rotate-now" class="pss-btn pss-btn-warn">Forgot / Rotate Password</button>
                <button id="pss-btn-banner-dismiss" class="pss-btn pss-btn-ghost" title="Dismiss">✕</button>
            </div>
        `;

        document.body.prepend(banner);

        document.getElementById("pss-btn-rotate-now").addEventListener("click", () => {
            findAndRedirectForgotPassword(site.siteName || domain);
        });
        document.getElementById("pss-btn-banner-dismiss").addEventListener("click", () => {
            banner.remove();
        });
    }

    // ─── 2. Universal Form & Login Button Interceptor ─────────────────────────

    function attachFormInterceptors() {
        // Intercept all <form> elements containing a password input
        document.querySelectorAll("form").forEach(form => {
            if (form.dataset.pssBound === "1") return;
            if (!form.querySelector('input[type="password"]')) return;
            form.dataset.pssBound = "1";

            form.addEventListener("submit", async (e) => {
                if (form.dataset.pssAllowSubmit === "1") {
                    delete form.dataset.pssAllowSubmit;
                    return;
                }

                const pwInputs = Array.from(form.querySelectorAll('input[type="password"]'));
                if (pwInputs.length === 0) return;

                // Use the last non-empty password field (handles both login forms and reset-password forms)
                const activePwInput = [...pwInputs].reverse().find(i => i.value) || pwInputs[0];
                const password = activePwInput ? activePwInput.value : "";
                if (!password) return;

                // Extract username/email if available on the form
                const userField = form.querySelector(
                    'input[type="email"], input[name*="user" i], input[name*="email" i], input[name*="login" i], input[id*="user" i], input[id*="email" i], input[type="text"]'
                );
                const username = userField ? userField.value.trim() : (currentSite ? currentSite.username : "");

                // Pause form submission while we verify expiry, MongoDB history, strength, and HIBP breach status
                e.preventDefault();
                e.stopImmediatePropagation();

                await verifyAndProcessLogin({
                    password,
                    username,
                    onAllow: () => {
                        form.dataset.pssAllowSubmit = "1";
                        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
                        if (typeof form.requestSubmit === "function") {
                            try {
                                form.requestSubmit(submitBtn || undefined);
                                return;
                            } catch {}
                        }
                        form.submit();
                    }
                });
            }, true);
        });

        // Also intercept standalone login/submit buttons for SPA websites without <form> tags
        document.querySelectorAll('button, input[type="button"], input[type="submit"], a[role="button"]').forEach(btn => {
            if (btn.dataset.pssBtnBound === "1") return;
            if (btn.closest("form")) return; // Handled by form submit listener
            if (btn.id && btn.id.startsWith("pss-")) return; // Ignore extension's own buttons

            const text = (btn.innerText || btn.value || "").toLowerCase().trim();
            const isLoginOrResetBtn = /^(log\s*in|sign\s*in|submit|continue|reset\s*password|change\s*password|update\s*password)$/i.test(text);
            if (!isLoginOrResetBtn) return;

            btn.dataset.pssBtnBound = "1";
            btn.addEventListener("click", async (e) => {
                if (btn.dataset.pssAllowClick === "1") {
                    delete btn.dataset.pssAllowClick;
                    return;
                }

                const pwInputs = Array.from(document.querySelectorAll('input[type="password"]')).filter(
                    el => !el.id.startsWith("pss-") && isVisible(el)
                );
                if (pwInputs.length === 0) return;

                const activePwInput = [...pwInputs].reverse().find(i => i.value) || pwInputs[0];
                const password = activePwInput ? activePwInput.value : "";
                if (!password) return;

                const userField = document.querySelector(
                    'input[type="email"], input[name*="user" i], input[name*="email" i], input[id*="user" i], input[id*="email" i], input[type="text"]'
                );
                const username = userField ? userField.value.trim() : "";

                e.preventDefault();
                e.stopImmediatePropagation();

                await verifyAndProcessLogin({
                    password,
                    username,
                    onAllow: () => {
                        btn.dataset.pssAllowClick = "1";
                        btn.click();
                    }
                });
            }, true);
        });
    }

    // ─── 3. Evaluate Login / Password Entry with Background & MongoDB ─────────

    async function verifyAndProcessLogin({ password, username, onAllow }) {
        const siteName = document.title ? document.title.split(/[-|—]/)[0].trim() : domain;

        chrome.runtime.sendMessage(
            {
                action: "ATTEMPT_LOGIN",
                domain,
                siteName: siteName || domain,
                username,
                password
            },
            response => {
                if (chrome.runtime.lastError || !response) {
                    // Fallback if extension context reloaded
                    onAllow();
                    return;
                }

                if (!response.allowed) {
                    // BLOCKED!
                    if (response.code === "EXPIRED") {
                        showBlockedModal({
                            title: "Password Not Allowed — Password Expired",
                            code: "EXPIRED",
                            reason: response.reason || `Your password for ${siteName || domain} has expired (30-day limit).`,
                            siteName: siteName || domain,
                            autoRedirectForgot: true
                        });
                    } else {
                        // Blocked due to:
                        // 1) Old password reuse (MongoDB history)
                        // 2) Weak password (<8 chars or missing upper/lower/digit/special)
                        // 3) Data breach (HaveIBeenPwned)
                        showBlockedModal({
                            title: "Password Not Allowed",
                            code: response.code || "POLICY_VIOLATION",
                            reason: response.reason || "This password does not meet security requirements.",
                            siteName: siteName || domain,
                            autoRedirectForgot: false
                        });
                    }
                    return;
                }

                // ALLOWED!
                if (response.status && response.status.isNearExpiry) {
                    showNearExpiryBanner(response.site || { siteName: domain }, response.status);
                }

                if (response.code === "ROTATED") {
                    showToast("✅ Password verified (Not reused, meets security requirements, 0 breaches). Logging in...", "#10b981");
                }

                onAllow();
            }
        );
    }

    // ─── 4. Blocked Modal ("Password Not Allowed" + Forgot Password Redirect) ─

    function showBlockedModal({ title, code, reason, siteName, autoRedirectForgot }) {
        const existing = document.getElementById("pss-expired-backdrop");
        if (existing) existing.remove();

        const backdrop = document.createElement("div");
        backdrop.id = "pss-expired-backdrop";

        const isExpired = code === "EXPIRED";
        const badgeLabel =
            code === "EXPIRED" ? "EXPIRED PASSWORD (30-DAY LIMIT)" :
            code === "REUSED" ? "OLD PASSWORD REUSE DETECTED (MONGODB)" :
            code === "WEAK" ? "SECURITY REQUIREMENTS NOT MET" :
            code === "BREACHED" ? "DATA BREACH DETECTED (HAVEIBEENPWNED)" :
            "PASSWORD NOT ALLOWED";

        backdrop.innerHTML = `
            <div id="pss-expired-card">
                <div class="pss-card-header">
                    <div class="pss-shield">🚫</div>
                    <div>
                        <h2 id="pss-modal-title">${escHtml(title)}</h2>
                        <p>Password Security System — ${escHtml(badgeLabel)}</p>
                    </div>
                </div>

                <div class="pss-card-body">
                    <div class="pss-alert-box" id="pss-modal-reason">
                        <strong>🚫 ${escHtml(reason)}</strong>
                    </div>

                    <div class="pss-steps">
                        <div class="pss-step">
                            <span class="pss-step-num">1</span>
                            <span><strong>Password History (MongoDB):</strong> Must not match any of your previously used passwords.</span>
                        </div>
                        <div class="pss-step">
                            <span class="pss-step-num">2</span>
                            <span><strong>Security Requirements:</strong> Minimum 8 characters with uppercase, lowercase, number, and special character.</span>
                        </div>
                        <div class="pss-step">
                            <span class="pss-step-num">3</span>
                            <span><strong>Breach Check (HaveIBeenPwned):</strong> Must have 0 appearances in known data breaches.</span>
                        </div>
                    </div>

                    ${isExpired ? `
                        <div id="pss-redirect-status" class="pss-redirect-notice">
                            🔍 Scanning page for <strong>"Forgot Password"</strong> option to rotate your password...
                        </div>
                    ` : ""}

                    <button id="pss-btn-go-forgot" class="pss-btn pss-btn-primary pss-full-width">
                        🔑 Redirect to "Forgot Password" on ${escHtml(siteName)}
                    </button>

                    <div class="pss-divider">or</div>

                    <button id="pss-btn-close-modal" class="pss-btn pss-btn-outline pss-full-width">
                        Enter a Different Password
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);

        document.getElementById("pss-btn-go-forgot").addEventListener("click", () => {
            findAndRedirectForgotPassword(siteName);
        });

        document.getElementById("pss-btn-close-modal").addEventListener("click", () => {
            backdrop.remove();
        });

        // If blocked due to EXPIRED password, automatically scan the page and redirect to "Forgot Password"
        if (autoRedirectForgot) {
            setTimeout(() => {
                const target = locateForgotPasswordElement();
                const notice = document.getElementById("pss-redirect-status");
                if (target) {
                    if (notice) {
                        notice.innerHTML = `✅ Found <strong>"Forgot Password"</strong> on this page! Redirecting you in 2 seconds...`;
                    }
                    setTimeout(() => {
                        findAndRedirectForgotPassword(siteName);
                    }, 1800);
                } else if (notice) {
                    notice.innerHTML = `Click the button below to open the <strong>Forgot Password</strong> flow for ${escHtml(siteName)}.`;
                }
            }, 400);
        }
    }

    // ─── 5. Scan Page & Redirect to "Forgot Password" ─────────────────────────

    function locateForgotPasswordElement() {
        const phrases = [
            "forgot password", "forgot your password", "reset password",
            "forgot?", "trouble signing in", "trouble logging in",
            "can't log in", "lost your password", "recover password"
        ];

        const clickable = Array.from(document.querySelectorAll("a, button, [role='button'], span[onclick]"));
        for (const el of clickable) {
            if (el.id && el.id.startsWith("pss-")) continue;
            const text = (el.innerText || el.textContent || "").toLowerCase().trim();
            if (phrases.some(p => text.includes(p)) && isVisible(el)) {
                return el;
            }
        }

        const hrefSelectors = [
            'a[href*="forgot" i]',
            'a[href*="reset" i]',
            'a[href*="recover" i]',
            'a[href*="password_reset" i]',
            'a[href*="forgot-password" i]'
        ];
        for (const sel of hrefSelectors) {
            const el = document.querySelector(sel);
            if (el && isVisible(el)) return el;
        }

        return null;
    }

    function findAndRedirectForgotPassword(siteName) {
        const found = locateForgotPasswordElement();

        if (found) {
            found.style.outline = "3px solid #f59e0b";
            found.style.boxShadow = "0 0 0 6px rgba(245,158,11,0.35)";
            showToast(`🔑 Redirecting to "Forgot Password" on ${siteName}...`, "#f59e0b");

            setTimeout(() => {
                if (found.tagName === "A" && found.href) {
                    window.location.href = found.href;
                } else {
                    found.click();
                }
            }, 500);
            return;
        }

        // Fallback for major platforms when link is on a secondary step
        const knownResets = {
            "cuims.in": "https://uims.cuchd.in/uims/",
            "cuchd.in": "https://uims.cuchd.in/uims/",
            "coursera.org": "https://www.coursera.org/?authMode=resetPassword",
            "linkedin.com": "https://www.linkedin.com/uas/request-password-reset",
            "github.com": "https://github.com/password_reset",
            "tryhackme.com": "https://tryhackme.com/reset-password",
            "postman.com": "https://identity.getpostman.com/forgot-password",
            "getpostman.com": "https://identity.getpostman.com/forgot-password",
            "google.com": "https://accounts.google.com/signin/recovery",
            "microsoft.com": "https://account.live.com/password/reset",
            "twitter.com": "https://twitter.com/account/begin_password_reset",
            "x.com": "https://x.com/account/begin_password_reset",
            "instagram.com": "https://www.instagram.com/accounts/password/reset/",
            "facebook.com": "https://www.facebook.com/login/identify/"
        };

        const matched = Object.entries(knownResets).find(([d]) => domain.includes(d));
        if (matched) {
            showToast(`🔑 Redirecting to ${siteName} Forgot Password page...`, "#f59e0b");
            setTimeout(() => { window.location.href = matched[1]; }, 600);
            return;
        }

        showToast(`Please click "Forgot Password" on ${siteName} to reset your password via email.`, "#ef4444");
    }

    // ─── Toast & Helpers ──────────────────────────────────────────────────────

    function showToast(message, color) {
        const existing = document.getElementById("pss-toast");
        if (existing) existing.remove();

        const toast = document.createElement("div");
        toast.id = "pss-toast";
        toast.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
            background: ${color}; color: #fff; padding: 14px 20px;
            border-radius: 10px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 13px; font-weight: 600; max-width: 380px;
            box-shadow: 0 8px 28px rgba(0,0,0,0.35);
            white-space: pre-line; line-height: 1.5;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }

    function isVisible(el) {
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    function escHtml(str) {
        return String(str || "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function normalizeDomain(hostname) {
        return String(hostname || "").toLowerCase().replace(/^www\./, "").trim();
    }
})();
