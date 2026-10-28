// LearnHub Academy Demo Site Interactivity

document.addEventListener("DOMContentLoaded", () => {
    // 1. Login Form (index.html)
    const loginForm = document.getElementById("demo-login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", (e) => {
            // Note: If PassRotate extension is active and password has expired,
            // the content script will intercept this event and show the Lockout Gatekeeper.
            e.preventDefault();
            const username = document.getElementById("demo-username").value;
            alert(`🎉 Login Successful!\n\nWelcome back, ${username}!\nYour password is compliant under the 30-day rotation policy.`);
        });
    }

    // 2. Forgot Password Flow (forgot-password.html)
    const btnSendReset = document.getElementById("btn-send-reset-link");
    const stepRequest = document.getElementById("step-request-link");
    const stepSetNew = document.getElementById("step-set-new-password");

    if (btnSendReset) {
        btnSendReset.addEventListener("click", () => {
            const email = document.getElementById("reset-email-input").value;
            if (!email) {
                alert("Please enter a valid email address.");
                return;
            }

            btnSendReset.innerText = "⏳ Dispatching to Gmail...";
            btnSendReset.disabled = true;

            setTimeout(() => {
                alert(`📧 Reset Link Sent!\n\nWe sent an official password reset link to ${email}.\nSimulating user clicking the link in Gmail now...`);
                stepRequest.style.display = "none";
                stepSetNew.style.display = "block";
            }, 800);
        });
    }

    // New Password Form
    const newPwForm = document.getElementById("new-password-form");
    if (newPwForm) {
        newPwForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const newPw = document.getElementById("new-pw-input").value;
            const confirmPw = document.getElementById("confirm-pw-input").value;

            if (newPw !== confirmPw) {
                alert("⚠️ Error: Passwords do not match!");
                return;
            }

            if (newPw.length < 6) {
                alert("⚠️ Error: Password must be at least 6 characters.");
                return;
            }

            alert("🎉 Password Reset Successful!\n\nYour LearnHub password has been rotated.\nThe PassRotate 30-day countdown is now reset.\nRedirecting to Sign In page...");
            window.location.href = "index.html";
        });
    }
});
