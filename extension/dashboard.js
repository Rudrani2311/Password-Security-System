document.addEventListener("DOMContentLoaded", () => {
    chrome.runtime.sendMessage({ action: "GET_VAULT" }, response => {
        const tbody = document.getElementById("vault-tbody");
        const vault = (response && response.vault) ? response.vault : [];

        if (vault.length === 0) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td colspan="2">No websites tracked</td>`;
            tbody.appendChild(tr);
            return;
        }

        vault.forEach(site => {
            const days = site.status ? site.status.daysRemaining : 30;
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${site.domain}</td>
                <td>${days} days</td>
            `;
            tbody.appendChild(tr);
        });
    });
});
