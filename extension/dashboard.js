document.addEventListener("DOMContentLoaded", () => {
    chrome.runtime.sendMessage({ action: "GET_VAULT" }, response => {
        const listEl = document.getElementById("vault-tbody");
        const vault = (response && response.vault) ? response.vault : [];

        if (vault.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.textContent = "No websites tracked yet.";
            listEl.appendChild(empty);
            return;
        }

        vault.forEach(site => {
            const days = site.status ? site.status.daysRemaining : 30;
            const row = document.createElement("div");
            row.className = "site-row";
            row.innerHTML = `
                <span class="site-domain">${site.domain}</span>
                <span class="site-days">${days} days</span>
            `;
            listEl.appendChild(row);
        });
    });
});
