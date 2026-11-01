(function () {
    const pwInput = document.getElementById("demo-password");
    const userInput = document.getElementById("demo-username");
    const loginForm = document.getElementById("demo-login-form");
    const resetForm = document.getElementById("reset-password-form");
    const newPwInput = document.getElementById("new-password-input");

    if (loginForm && pwInput) {
        loginForm.addEventListener("submit", () => {
            if (pwInput.value) {
                localStorage.setItem("pss_demo_last_pw", pwInput.value);
            }
        });
    }

    if (resetForm && newPwInput) {
        resetForm.addEventListener("submit", () => {
            if (newPwInput.value) {
                localStorage.setItem("pss_demo_last_pw", newPwInput.value);
            }
        });
    }

    const btnActive = document.getElementById("btn-sim-active");
    const btn5Days = document.getElementById("btn-sim-5days");
    const btnExpired = document.getElementById("btn-sim-expired");
    const allBtns = [btnActive, btn5Days, btnExpired].filter(Boolean);

    function setActiveBtn(btn) {
        allBtns.forEach(b => b.classList.remove("active-option"));
        if (btn) btn.classList.add("active-option");
    }

    function setDaysState(daysRemaining, btn) {
        setActiveBtn(btn);
        const trackedPw = (pwInput && pwInput.value) || localStorage.getItem("pss_demo_last_pw") || "Rudrani#2026$Valid!";
        const daysElapsed = 30 - daysRemaining;
        const rotatedAt = new Date(Date.now() - daysElapsed * 86400000).toISOString();

        fetch("/api/update-date", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                domain: window.location.hostname,
                lastRotatedAt: rotatedAt
            })
        }).catch(() => {});

        window.postMessage({
            source: "PSS_DEMO_PAGE",
            action: "DEMO_SET_STATE",
            mode: "SET_DAYS",
            daysRemaining,
            password: trackedPw,
            username: userInput ? userInput.value : "24bcs10304@cuchd.in"
        }, "*");

        if (pwInput && !pwInput.value) {
            pwInput.value = trackedPw;
        }
    }

    if (btnActive) {
        btnActive.addEventListener("click", () => setDaysState(30, btnActive));
    }

    if (btn5Days) {
        btn5Days.addEventListener("click", () => setDaysState(5, btn5Days));
    }

    if (btnExpired) {
        btnExpired.addEventListener("click", () => setDaysState(0, btnExpired));
    }
})();
