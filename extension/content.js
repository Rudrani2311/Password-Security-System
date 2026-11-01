(function () {
    if (window.__pss_injected) return;
    window.__pss_injected = true;

    const domain = String(window.location.hostname || "").toLowerCase().replace(/^www\./, "").trim();
    let systemEnabled = true;
    let inputTimer = null;
    let redirectTimer = null;
    let validationSeq = 0;

    function isContextValid() {
        try {
            return Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
        } catch {
            return false;
        }
    }

    function safeSendMessage(payload, callback) {
        if (!isContextValid()) return;
        try {
            chrome.runtime.sendMessage(payload, res => {
                try {
                    if (!isContextValid() || chrome.runtime.lastError) return;
                } catch {
                    return;
                }
                if (typeof callback === "function") callback(res);
            });
        } catch {}
    }

    init();

    function init() {
        if (!isContextValid()) return;
        safeSendMessage({ action: "GET_SITE_STATUS", domain }, response => {
            if (!response) return;
            systemEnabled = response.enabled !== false;
            if (!systemEnabled) {
                removeAllPopups();
                return;
            }
            if (response.managed && response.status && response.status.isNearExpiry) {
                showExpiryBanner(response.status.daysRemaining);
            }
        });

        try {
            chrome.runtime.onMessage.addListener(msg => {
                if (!isContextValid()) return;
                if (msg && msg.action === "SYSTEM_TOGGLED") {
                    systemEnabled = Boolean(msg.enabled);
                    if (!systemEnabled) {
                        removeAllPopups();
                    } else {
                        const activePw = getActivePasswordInput();
                        if (activePw && activePw.value) evaluateTypedPassword(activePw);
                    }
                }
            });

            if (chrome.storage && chrome.storage.onChanged) {
                chrome.storage.onChanged.addListener((changes, area) => {
                    if (!isContextValid()) return;
                    if (area === "local" && changes.pss_settings && changes.pss_settings.newValue) {
                        systemEnabled = changes.pss_settings.newValue.enabled !== false;
                        if (!systemEnabled) {
                            removeAllPopups();
                        }
                    }
                });
            }
        } catch {}

        bindInputsAndForms();
        bindGlobalInterceptors();
        bindDemoPageBridge();
        const obs = new MutationObserver(() => {
            if (!isContextValid()) {
                obs.disconnect();
                return;
            }
            bindInputsAndForms();
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
    }

    function bindDemoPageBridge() {
        window.addEventListener("message", e => {
            if (!isContextValid()) return;
            if (e.source !== window || !e.data || e.data.source !== "PSS_DEMO_PAGE") return;
            if (e.data.action === "DEMO_SET_STATE") {
                validationSeq++;
                clearTimeout(inputTimer);
                clearTimeout(redirectTimer);
                removeAllPopups();

                const activePw = getActivePasswordInput();
                const pwToTrack = e.data.password || (activePw && activePw.value) || "Rudrani#2026$Valid!";

                safeSendMessage(
                    {
                        action: "DEMO_SET_STATE",
                        domain,
                        mode: e.data.mode || "SET_DAYS",
                        daysRemaining: e.data.daysRemaining,
                        password: pwToTrack,
                        username: e.data.username
                    },
                    res => {
                        if (res && res.status && res.status.isNearExpiry && systemEnabled) {
                            showExpiryBanner(res.status.daysRemaining);
                        }
                        if (activePw && res && res.status && !res.status.isExpired) {
                            activePw.dataset.pssValid = "1";
                        }
                        window.postMessage({ source: "PSS_EXTENSION_ACK", action: "DEMO_SET_STATE", result: res }, "*");
                    }
                );
            } else if (e.data.action === "DEMO_GET_STATUS") {
                safeSendMessage({ action: "GET_SITE_STATUS", domain }, res => {
                    window.postMessage({ source: "PSS_EXTENSION_ACK", action: "DEMO_GET_STATUS", result: res }, "*");
                });
            }
        });
    }

    function removeAllPopups() {
        clearTimeout(inputTimer);
        clearTimeout(redirectTimer);
        ["pss-not-allowed-backdrop", "pss-expiry-popup", "pss-redirect-popup"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
    }

    function removeBlockingPopups() {
        clearTimeout(redirectTimer);
        ["pss-not-allowed-backdrop", "pss-redirect-popup"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
    }

    function showExpiryBanner(days) {
        if (!systemEnabled) return;
        let box = document.getElementById("pss-expiry-popup");
        if (!box) {
            box = document.createElement("div");
            box.id = "pss-expiry-popup";
            box.className = "pss-bw-popup pss-top-banner";
            document.body.prepend(box);
        }
        box.textContent = `Your password is going to expire in ${days} day${days === 1 ? "" : "s"}.`;
    }

    function showRedirectingPopup(targetLabel) {
        if (!systemEnabled) return;
        let box = document.getElementById("pss-redirect-popup");
        if (!box) {
            box = document.createElement("div");
            box.id = "pss-redirect-popup";
            box.className = "pss-bw-popup pss-bottom-popup";
            document.body.appendChild(box);
        }
        box.textContent = `Redirecting to ${targetLabel.toLowerCase()}.`;
    }

    function showPasswordNotAllowed(reason) {
        if (!systemEnabled) return;

        let wrapper = document.getElementById("pss-not-allowed-backdrop");
        if (wrapper) {
            const reasonEl = document.getElementById("pss-modal-reason");
            if (reasonEl) reasonEl.textContent = reason;
            return;
        }

        wrapper = document.createElement("div");
        wrapper.id = "pss-not-allowed-backdrop";

        wrapper.innerHTML = `
            <div class="pss-not-allowed-card" id="pss-not-allowed-card">
                <div class="pss-na-header">
                    <div class="pss-na-title">Password not allowed</div>
                    <button type="button" id="pss-btn-close-x" class="pss-na-close" aria-label="Close">&#10005;</button>
                </div>
                <div class="pss-na-reason" id="pss-modal-reason">${escHtml(reason)}</div>
            </div>
        `;

        document.body.appendChild(wrapper);

        document.getElementById("pss-btn-close-x").addEventListener("click", () => {
            validationSeq++;
            clearTimeout(inputTimer);
            wrapper.remove();
        });
    }

    function checkLocalMissingRequirements(password) {
        if (!password || password.length < 8) {
            return { valid: false, reason: "Must be at least 8 characters." };
        }
        const missing = [];
        if (!/[A-Z]/.test(password)) missing.push("uppercase");
        if (!/[a-z]/.test(password)) missing.push("lowercase");
        if (!/[0-9]/.test(password)) missing.push("numbers");
        if (!/[^A-Za-z0-9]/.test(password)) missing.push("special characters");

        if (missing.length > 0) {
            const joined = missing.join(", ");
            const sentence = joined.charAt(0).toUpperCase() + joined.slice(1) + ".";
            return { valid: false, reason: sentence };
        }
        return { valid: true, reason: null };
    }

    function isResetOrSignupContext(input) {
        const url = window.location.href.toLowerCase();
        if (url.includes("forgot") || url.includes("reset") || url.includes("recover") || url.includes("signup") || url.includes("register")) {
            return true;
        }
        if (input && (input.autocomplete === "new-password" || (input.id && input.id.toLowerCase().includes("new")))) {
            return true;
        }
        return false;
    }

    function evaluateTypedPassword(input) {
        if (!systemEnabled) return;
        const val = input.value;
        if (!val) {
            input.dataset.pssValid = "0";
            removeBlockingPopups();
            return;
        }

        const localCheck = checkLocalMissingRequirements(val);
        if (!localCheck.valid) {
            input.dataset.pssValid = "0";
            if (document.getElementById("pss-not-allowed-backdrop")) {
                showPasswordNotAllowed(localCheck.reason);
            }
        }

        clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
            if (!systemEnabled) return;
            const latestVal = input.value;
            if (!latestVal) return;

            const latestLocal = checkLocalMissingRequirements(latestVal);
            if (!latestLocal.valid) {
                input.dataset.pssValid = "0";
                showPasswordNotAllowed(latestLocal.reason);
                return;
            }

            const mySeq = ++validationSeq;
            const strictReuse = isResetOrSignupContext(input);
            safeSendMessage(
                { action: "VALIDATE_PASSWORD", domain, password: latestVal, strictReuse },
                res => {
                    if (!res || !systemEnabled) return;
                    if (mySeq !== validationSeq || input.value !== latestVal) return;
                    if (!res.valid) {
                        input.dataset.pssValid = "0";
                        showPasswordNotAllowed(res.reason);
                    } else {
                        input.dataset.pssValid = "1";
                        removeBlockingPopups();
                    }
                }
            );
        }, 250);
    }

    function getActivePasswordInput(root = document) {
        const pwInputs = Array.from(root.querySelectorAll('input[type="password"]'));
        return [...pwInputs].reverse().find(i => i.value) || pwInputs[0] || null;
    }

    function bindInputsAndForms() {
        document.querySelectorAll('input[type="password"]').forEach(input => {
            if (input.dataset.pssInputBound === "1") return;
            input.dataset.pssInputBound = "1";
            input.dataset.pssValid = "0";

            input.addEventListener("input", () => {
                delete input.dataset.pssVerifiedAllow;
                evaluateTypedPassword(input);
            });
        });
    }

    function isSubmitOrAuthTrigger(el) {
        if (!el || !el.closest) return null;
        if (el.closest("#pss-not-allowed-backdrop")) return null;
        const btn = el.closest('button, input[type="submit"], input[type="button"], [role="button"]');
        if (!btn) return null;
        if (btn.dataset && btn.dataset.pssIgnore === "1") return null;
        if (btn.type === "submit") return btn;
        const form = btn.closest("form");
        if (form && form.querySelector('input[type="password"]')) return btn;
        const text = ((btn.innerText || btn.value || btn.getAttribute("aria-label") || "")).toLowerCase().trim();
        const authWords = ["log in", "login", "sign in", "signin", "sign up", "signup", "register", "continue", "submit", "update password"];
        if (authWords.some(w => text === w || text.startsWith(w)) && getActivePasswordInput()) {
            return btn;
        }
        return null;
    }

    function bindGlobalInterceptors() {
        window.addEventListener("click", e => {
            if (!systemEnabled) return;
            const trigger = isSubmitOrAuthTrigger(e.target);
            if (!trigger) return;

            const scope = trigger.closest("form") || document;
            const activePw = getActivePasswordInput(scope) || getActivePasswordInput(document);
            if (!activePw || !activePw.value) return;

            if (activePw.dataset.pssVerifiedAllow === "1") {
                delete activePw.dataset.pssVerifiedAllow;
                return;
            }

            clearTimeout(inputTimer);
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const userField = scope.querySelector('input[type="email"], input[name*="user" i], input[name*="email" i], input[type="text"]');
            const username = userField ? userField.value.trim() : "";

            handleLoginAttempt(activePw, activePw.value, username, () => {
                removeBlockingPopups();
                activePw.dataset.pssVerifiedAllow = "1";
                const form = trigger.closest("form");
                if (form) {
                    form.dataset.pssVerifiedAllow = "1";
                }
                trigger.click();
            });
        }, true);

        window.addEventListener("keydown", e => {
            if (!systemEnabled || e.key !== "Enter") return;
            const target = e.target;
            if (!target || (target.tagName !== "INPUT" && target.tagName !== "BUTTON")) return;

            const scope = (target.closest && target.closest("form")) || document;
            const activePw = getActivePasswordInput(scope) || getActivePasswordInput(document);
            if (!activePw || !activePw.value) return;

            if (activePw.dataset.pssVerifiedAllow === "1") {
                return;
            }

            clearTimeout(inputTimer);
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const userField = scope.querySelector('input[type="email"], input[name*="user" i], input[name*="email" i], input[type="text"]');
            const username = userField ? userField.value.trim() : "";

            handleLoginAttempt(activePw, activePw.value, username, () => {
                removeBlockingPopups();
                activePw.dataset.pssVerifiedAllow = "1";
                const form = activePw.closest("form");
                if (form) {
                    form.dataset.pssVerifiedAllow = "1";
                    const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
                    if (typeof form.requestSubmit === "function") {
                        try { form.requestSubmit(submitBtn || undefined); return; } catch {}
                    }
                    form.submit();
                }
            });
        }, true);

        window.addEventListener("submit", e => {
            if (!systemEnabled) return;
            const form = e.target;
            if (!form || !form.querySelector) return;
            const activePw = getActivePasswordInput(form);
            if (!activePw || !activePw.value) return;

            if (form.dataset.pssVerifiedAllow === "1" || activePw.dataset.pssVerifiedAllow === "1") {
                delete form.dataset.pssVerifiedAllow;
                delete activePw.dataset.pssVerifiedAllow;
                return;
            }

            clearTimeout(inputTimer);
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const userField = form.querySelector('input[type="email"], input[name*="user" i], input[name*="email" i], input[type="text"]');
            const username = userField ? userField.value.trim() : "";

            handleLoginAttempt(activePw, activePw.value, username, () => {
                removeBlockingPopups();
                form.dataset.pssVerifiedAllow = "1";
                activePw.dataset.pssVerifiedAllow = "1";
                const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
                if (typeof form.requestSubmit === "function") {
                    try { form.requestSubmit(submitBtn || undefined); return; } catch {}
                }
                form.submit();
            });
        }, true);
    }

    function handleLoginAttempt(pwInput, password, username, onAllow) {
        if (!isContextValid()) {
            onAllow();
            return;
        }
        const strictReuse = isResetOrSignupContext(pwInput);
        safeSendMessage(
            { action: "ATTEMPT_LOGIN", domain, username, password, strictReuse },
            response => {
                if (!response) {
                    onAllow();
                    return;
                }

                if (!response.allowed) {
                    const reason = response.reason || "Password does not meet requirements.";
                    if (pwInput) pwInput.dataset.pssValid = "0";
                    showPasswordNotAllowed(reason);
                    if (response.code === "EXPIRED") {
                        showRedirectingPopup("forgot password");
                        clearTimeout(redirectTimer);
                        redirectTimer = setTimeout(() => redirectToForgotPassword(), 1200);
                    }
                    return;
                }

                if (pwInput) pwInput.dataset.pssValid = "1";
                removeBlockingPopups();
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
