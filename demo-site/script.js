(function () {
    const params = new URLSearchParams(window.location.search);
    const rotatedBanner = document.getElementById("rotation-success-banner");
    if (rotatedBanner && params.get("rotated") === "1") {
        rotatedBanner.textContent = "Password updated and tracked for 30 days. You can now sign in with your new password.";
    }

    const statusLabel = document.getElementById("sim-status-label");
    const daysLabel = document.getElementById("sim-days-label");
    const currentPwLabel = document.getElementById("sim-current-pw");
    const feedbackBox = document.getElementById("sim-feedback");
    const pwInput = document.getElementById("demo-password");
    const userInput = document.getElementById("demo-username");

    let trackedPw = localStorage.getItem("pss_demo_last_pw") || "DemoPass1!";
    if (currentPwLabel) currentPwLabel.textContent = trackedPw;

    // Save the password used on login or rotation so the demo panel knows what password is active
    const loginForm = document.getElementById("demo-login-form");
    if (loginForm && pwInput) {
        loginForm.addEventListener("submit", () => {
            if (pwInput.value) {
                localStorage.setItem("pss_demo_last_pw", pwInput.value);
            }
        });
    }

    const resetForm = document.getElementById("reset-password-form");
    const newPwInput = document.getElementById("new-password-input");
    if (resetForm && newPwInput) {
        resetForm.addEventListener("submit", () => {
            if (newPwInput.value) {
                localStorage.setItem("pss_demo_last_pw", newPwInput.value);
            }
        });
    }

    // Toggle between Sign in and Sign up modes to test both
    const toggleBtn = document.getElementById("btn-toggle-auth-mode");
    const authHeading = document.getElementById("auth-heading");
    const authSubtitle = document.getElementById("auth-subtitle");
    const submitBtn = document.getElementById("btn-login-submit");
    const togglePrompt = document.getElementById("toggle-mode-prompt");
    let isSignUp = false;

    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            isSignUp = !isSignUp;
            if (isSignUp) {
                authHeading.textContent = "Student portal sign up";
                authSubtitle.textContent = "Create a new account with a password that meets all requirements.";
                submitBtn.textContent = "Sign up";
                togglePrompt.textContent = "Already have an account?";
                toggleBtn.textContent = "Sign in";
            } else {
                authHeading.textContent = "Student portal sign in";
                authSubtitle.textContent = "Enter your email and password to sign in to your account.";
                submitBtn.textContent = "Log in";
                togglePrompt.textContent = "Need a new account?";
                toggleBtn.textContent = "Sign up";
            }
        });
    }

    function updateStatusDisplay(statusObj) {
        if (!statusLabel || !daysLabel) return;
        if (!statusObj) {
            statusLabel.textContent = "Not tracked";
            daysLabel.textContent = "30 days";
            return;
        }
        daysLabel.textContent = `${statusObj.daysRemaining} days`;
        if (statusObj.isExpired) {
            statusLabel.textContent = "Expired";
        } else if (statusObj.isNearExpiry) {
            statusLabel.textContent = "Near expiry";
        } else {
            statusLabel.textContent = "Active";
        }
    }

    window.addEventListener("message", e => {
        if (e.source !== window || !e.data || e.data.source !== "PSS_EXTENSION_ACK") return;
        const res = e.data.result;
        if (res && res.status) {
            updateStatusDisplay(res.status);
        } else if (res && res.mode === "RESET") {
            updateStatusDisplay(null);
        }
    });

    // Query initial extension status on load
    setTimeout(() => {
        window.postMessage({ source: "PSS_DEMO_PAGE", action: "DEMO_GET_STATUS" }, "*");
    }, 300);

    function triggerInput(value) {
        if (!pwInput) return;
        pwInput.value = value;
        pwInput.focus();
        pwInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const btn5Days = document.getElementById("btn-sim-5days");
    if (btn5Days) {
        btn5Days.addEventListener("click", () => {
            trackedPw = localStorage.getItem("pss_demo_last_pw") || "DemoPass1!";
            if (currentPwLabel) currentPwLabel.textContent = trackedPw;
            window.postMessage({
                source: "PSS_DEMO_PAGE",
                action: "DEMO_SET_STATE",
                mode: "SET_DAYS",
                daysRemaining: 5,
                password: trackedPw,
                username: userInput ? userInput.value : "24bcs10304@cuchd.in"
            }, "*");
            if (feedbackBox) {
                feedbackBox.textContent = "Set to 5 days remaining. Look at the top of the page for the black-and-white 5-day expiry popup.";
            }
        });
    }

    const btnExpired = document.getElementById("btn-sim-expired");
    if (btnExpired) {
        btnExpired.addEventListener("click", () => {
            trackedPw = localStorage.getItem("pss_demo_last_pw") || "DemoPass1!";
            if (currentPwLabel) currentPwLabel.textContent = trackedPw;
            window.postMessage({
                source: "PSS_DEMO_PAGE",
                action: "DEMO_SET_STATE",
                mode: "SET_DAYS",
                daysRemaining: 0,
                password: trackedPw,
                username: userInput ? userInput.value : "24bcs10304@cuchd.in"
            }, "*");
            if (pwInput) {
                pwInput.value = trackedPw;
            }
            if (feedbackBox) {
                feedbackBox.textContent = `Set to 0 days remaining (Expired) and filled "${trackedPw}" in the password box. Click "Log in" to test expired blocking and automatic redirection to Forgot password.`;
            }
        });
    }

    const btnActive = document.getElementById("btn-sim-active");
    if (btnActive) {
        btnActive.addEventListener("click", () => {
            trackedPw = localStorage.getItem("pss_demo_last_pw") || "DemoPass1!";
            window.postMessage({
                source: "PSS_DEMO_PAGE",
                action: "DEMO_SET_STATE",
                mode: "SET_DAYS",
                daysRemaining: 30,
                password: trackedPw,
                username: userInput ? userInput.value : "24bcs10304@cuchd.in"
            }, "*");
            if (feedbackBox) {
                feedbackBox.textContent = "Reset to 30 days remaining (Active).";
            }
        });
    }

    const btnFillShort = document.getElementById("btn-fill-short");
    if (btnFillShort) {
        btnFillShort.addEventListener("click", () => {
            triggerInput("flower");
            if (feedbackBox) feedbackBox.textContent = 'Filled "flower" (< 8 characters).';
        });
    }

    const btnFillMissing = document.getElementById("btn-fill-missing");
    if (btnFillMissing) {
        btnFillMissing.addEventListener("click", () => {
            triggerInput("flowerrr");
            if (feedbackBox) feedbackBox.textContent = 'Filled "flowerrr" (missing uppercase, numbers, special characters). Try changing "f" to "F" to see "uppercase" removed live.';
        });
    }

    const btnFillBreached = document.getElementById("btn-fill-breached");
    if (btnFillBreached) {
        btnFillBreached.addEventListener("click", () => {
            triggerInput("P@ssw0rd123!");
            if (feedbackBox) feedbackBox.textContent = 'Filled "P@ssw0rd123!" (meets character rules, but leaked in a data breach via HaveIBeenPwned).';
        });
    }

    const btnReset = document.getElementById("btn-reset-demo");
    if (btnReset) {
        btnReset.addEventListener("click", () => {
            localStorage.removeItem("pss_demo_last_pw");
            trackedPw = "DemoPass1!";
            if (currentPwLabel) currentPwLabel.textContent = trackedPw;
            if (pwInput) pwInput.value = "";
            window.postMessage({
                source: "PSS_DEMO_PAGE",
                action: "DEMO_SET_STATE",
                mode: "RESET"
            }, "*");
            if (feedbackBox) {
                feedbackBox.textContent = "Cleared demo site password history and expiry state.";
            }
        });
    }
})();
