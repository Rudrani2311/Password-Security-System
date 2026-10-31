(function () {
    if (window.__pss_injected) return;
    window.__pss_injected = true;

    const domain = String(window.location.hostname || "").toLowerCase().replace(/^www\./, "").trim();
    let currentSite = null;
    let currentStatus = null;
    let inputTimer = null;

    init();

    function init() {
        chrome.runtime.sendMessage({ action: "GET_SITE_STATUS", domain }, response => {
            if (chrome.runtime.lastError || !response) return;
            if (response.managed) {
                currentSite = response.site;
                currentStatus = response.status;
                if (currentStatus.isNearExpiry) {
                    showExpiryBanner(currentStatus.daysRemaining);
                }
            }
        });

        bindInputsAndForms();
        const obs = new MutationObserver(() => bindInputsAndForms());
        obs.observe(document.documentElement, { childList: true, subtree: true });
    }

    // Black & white notification popup for near-expiry warning
    function showExpiryBanner(days) {
        if (document.getElementById("pss-expiry-popup")) return;
        const box = document.createElement("div");
        box.id = "pss-expiry-popup";
        box.className = "pss-bw-popup pss-top-banner";
        box.textContent = `password expires in ${days} days. Rotate password.`;
        document.body.prepend(box);
    }

    // Black & white notification popup for redirect
    function showRedirectingPopup(targetLabel) {
        let box = document.getElementById("pss-redirect-popup");
        if (!box) {
            box = document.createElement("div");
            box.id = "pss-redirect-popup";
            box.className = "pss-bw-popup pss-bottom-popup";
            document.body.appendChild(box);
        }
        box.textContent = `redirecting to ${targetLabel}`;
    }

    // Simplified light-blue & dark-blue "Password Not Allowed" popup matching the extension popup
    function showPasswordNotAllowed(reason) {
        const existing = document.getElementById("pss-not-allowed-backdrop");
        if (existing) existing.remove();

        const wrapper = document.createElement("div");
        wrapper.id = "pss-not-allowed-backdrop";

        wrapper.innerHTML = `
            <div class="pss-not-allowed-card" id="pss-not-allowed-card">
                <div class="pss-na-header">
                    <div class="pss-na-title">Password Not Allowed</div>
                    <button type="button" id="pss-btn-close-x" class="pss-na-close" aria-label="Close">&#10005;</button>
                </div>
                <div class="pss-na-reason" id="pss-modal-reason">${escHtml(reason)}</div>
            </div>
        `;

        document.body.appendChild(wrapper);

        document.getElementById("pss-btn-close-x").addEventListener("click", () => {
            clearTimeout(inputTimer);
            wrapper.remove();
        });
    }

    function bindInputsAndForms() {
        document.querySelectorAll('input[type="password"]').forEach(input => {
            if (input.dataset.pssInputBound === "1") return;
            input.dataset.pssInputBound = "1";

            input.addEventListener("input", () => {
                clearTimeout(inputTimer);
                const val = input.value;
                if (!val) return;
                inputTimer = setTimeout(() => {
                    chrome.runtime.sendMessage(
                        { action: "VALIDATE_PASSWORD", domain, password: val },
                        res => {
                            if (chrome.runtime.lastError || !res) return;
                            if (!res.valid) {
                                showPasswordNotAllowed(res.reason);
                            } else {
                                const openModal = document.getElementById("pss-not-allowed-backdrop");
                                if (openModal) openModal.remove();
                            }
                        }
                    );
                }, 600);
            });
        });

        document.querySelectorAll("form").forEach(form => {
            if (form.dataset.pssFormBound === "1") return;
            if (!form.querySelector('input[type="password"]')) return;
            form.dataset.pssFormBound = "1";

            form.addEventListener("submit", e => {
                if (form.dataset.pssVerifiedAllow === "1") {
                    delete form.dataset.pssVerifiedAllow;
                    return;
                }

                const pwInputs = Array.from(form.querySelectorAll('input[type="password"]'));
                const activePw = [...pwInputs].reverse().find(i => i.value) || pwInputs[0];
                const password = activePw ? activePw.value : "";
                if (!password) return;

                const userField = form.querySelector('input[type="email"], input[name*="user" i], input[name*="email" i], input[type="text"]');
                const username = userField ? userField.value.trim() : "";

                clearTimeout(inputTimer);
                e.preventDefault();
                e.stopImmediatePropagation();

                handleLoginAttempt(password, username, () => {
                    form.dataset.pssVerifiedAllow = "1";
                    const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
                    if (typeof form.requestSubmit === "function") {
                        try { form.requestSubmit(submitBtn || undefined); return; } catch {}
                    }
                    form.submit();
                });
            }, true);
        });
    }

    function handleLoginAttempt(password, username, onAllow) {
        chrome.runtime.sendMessage(
            { action: "ATTEMPT_LOGIN", domain, username, password },
            response => {
                if (chrome.runtime.lastError || !response) {
                    onAllow();
                    return;
                }

                if (!response.allowed) {
                    showPasswordNotAllowed(response.reason || "Password does not meet requirements.");
                    if (response.code === "EXPIRED") {
                        showRedirectingPopup("Forgot Password");
                        setTimeout(() => redirectToForgotPassword(), 1200);
                    }
                    return;
                }

                onAllow();
            }
        );
    }

    function redirectToForgotPassword() {
        const phrases = ["forgot password", "forgot your password", "reset password", "trouble signing in", "trouble logging in"];
        const links = Array.from(document.querySelectorAll("a, button, [role='button']"));
        for (const el of links) {
            const text = (el.innerText || el.textContent || "").toLowerCase().trim();
            if (phrases.some(p => text.includes(p))) {
                if (el.tagName === "A" && el.href) {
                    window.location.href = el.href;
                } else {
                    el.click();
                }
                return;
            }
        }

        const hrefEl = document.querySelector('a[href*="forgot" i], a[href*="reset" i], a[href*="recover" i]');
        if (hrefEl && hrefEl.href) {
            window.location.href = hrefEl.href;
            return;
        }

        const known = {
            "coursera.org": "https://www.coursera.org/?authMode=resetPassword",
            "linkedin.com": "https://www.linkedin.com/uas/request-password-reset",
            "github.com": "https://github.com/password_reset",
            "tryhackme.com": "https://tryhackme.com/reset-password",
            "postman.com": "https://identity.getpostman.com/forgot-password"
        };
        const match = Object.entries(known).find(([d]) => domain.includes(d));
        if (match) window.location.href = match[1];
    }

    function escHtml(str) {
        return String(str || "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
})();
