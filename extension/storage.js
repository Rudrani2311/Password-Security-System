const PSSStorage = {
    DEFAULT_EXPIRY_DAYS: 30,
    DEFAULT_WARNING_DAYS: 5,
    CLOUD_SERVER_URL: "https://password-security-system.onrender.com",
    LOCAL_SERVER_URL: "http://localhost:5000",

    async getUserId() {
        return new Promise(resolve => {
            chrome.storage.local.get(["pss_user_id"], result => {
                if (result.pss_user_id) {
                    resolve(result.pss_user_id);
                    return;
                }
                const bytes = new Uint8Array(8);
                crypto.getRandomValues(bytes);
                const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
                const userId = `user_${hex}`;
                chrome.storage.local.set({ pss_user_id: userId }, () => resolve(userId));
            });
        });
    },

    async getApiEndpoints() {
        const settings = await this.getSettings();
        const urls = [];
        if (settings.serverUrl) urls.push(settings.serverUrl.replace(/\/+$/, ""));
        if (!urls.includes(this.LOCAL_SERVER_URL)) urls.push(this.LOCAL_SERVER_URL);
        if (!urls.includes(this.CLOUD_SERVER_URL)) urls.push(this.CLOUD_SERVER_URL);
        return urls;
    },

    async fetchBackend(path, options = {}) {
        const endpoints = await this.getApiEndpoints();
        const userId = await this.getUserId();
        const headers = {
            ...(options.headers || {}),
            "X-PSS-User-Id": userId
        };
        for (const base of endpoints) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 3500);
                const res = await fetch(`${base}${path}`, { ...options, headers, signal: controller.signal });
                clearTimeout(timer);
                if (res.ok) return await res.json();
            } catch {}
        }
        return null;
    },

    async getSettings() {
        return new Promise(resolve => {
            chrome.storage.local.get(["pss_settings"], result => {
                resolve({
                    enabled: true,
                    defaultExpiryDays: 30,
                    defaultWarningDays: 5,
                    serverUrl: "http://localhost:5000",
                    ...(result.pss_settings || {})
                });
            });
        });
    },

    async saveSettings(settings) {
        return new Promise(resolve => {
            chrome.storage.local.set({ pss_settings: settings }, () => resolve(settings));
        });
    },

    async getVault() {
        return new Promise(resolve => {
            chrome.storage.local.get(["pss_vault"], async result => {
                let localVault = Array.isArray(result.pss_vault) ? result.pss_vault : [];
                localVault = localVault.filter(item => {
                    const d = PSSCrypto.normalizeDomain(item.domain);
                    return d && !d.endsWith(".example.com");
                });

                const remote = await this.fetchBackend("/api/sites");
                if (remote && Array.isArray(remote.sites)) {
                    const remoteDomains = new Set(remote.sites.map(r => PSSCrypto.normalizeDomain(r.domain)));
                    for (const item of localVault) {
                        const d = PSSCrypto.normalizeDomain(item.domain);
                        if (d && !remoteDomains.has(d)) {
                            await this.fetchBackend("/api/track-site", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    domain: d,
                                    username: item.username || "",
                                    lastRotatedAt: item.lastRotatedAt || new Date().toISOString()
                                })
                            });
                        }
                    }

                    const map = new Map();
                    for (const item of localVault) map.set(PSSCrypto.normalizeDomain(item.domain), item);
                    for (const rItem of remote.sites) {
                        const d = PSSCrypto.normalizeDomain(rItem.domain);
                        if (d && !d.endsWith(".example.com")) {
                            map.set(d, { ...(map.get(d) || {}), ...rItem, domain: d });
                        }
                    }
                    localVault = Array.from(map.values());
                    chrome.storage.local.set({ pss_vault: localVault });
                } else {
                    chrome.storage.local.set({ pss_vault: localVault });
                }
                resolve(localVault);
            });
        });
    },

    async getSite(domain) {
        const clean = PSSCrypto.normalizeDomain(domain);
        if (!clean) return null;
        const remote = await this.fetchBackend(`/api/site/${encodeURIComponent(clean)}`);
        const vault = await new Promise(r => chrome.storage.local.get(["pss_vault"], res => r(res.pss_vault || [])));
        const localSite = vault.find(e => PSSCrypto.normalizeDomain(e.domain) === clean) || null;

        if (remote && remote.managed && remote.site) {
            const merged = { ...(localSite || {}), ...remote.site, domain: clean };
            await this.saveSite(merged, false);
            return merged;
        }
        return localSite;
    },

    async saveSite(entry, syncRemote = true) {
        const vault = await new Promise(r => chrome.storage.local.get(["pss_vault"], res => r(res.pss_vault || [])));
        const cleanDomain = PSSCrypto.normalizeDomain(entry.domain);
        const idx = vault.findIndex(e => PSSCrypto.normalizeDomain(e.domain) === cleanDomain);
        const record = {
            domain: cleanDomain,
            username: entry.username || "",
            currentPasswordHash: entry.currentPasswordHash || "",
            lastRotatedAt: entry.lastRotatedAt || new Date().toISOString(),
            expiryDays: entry.expiryDays || 30,
            warningThresholdDays: entry.warningThresholdDays || 5,
            passwordHashHistory: entry.passwordHashHistory || []
        };
        if (idx >= 0) vault[idx] = { ...vault[idx], ...record };
        else vault.unshift(record);
        await new Promise(r => chrome.storage.local.set({ pss_vault: vault }, r));

        if (syncRemote) {
            await this.fetchBackend("/api/track-site", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    domain: cleanDomain,
                    username: record.username,
                    lastRotatedAt: record.lastRotatedAt
                })
            });
        }
        return record;
    },

    async deleteSite(domain) {
        const clean = PSSCrypto.normalizeDomain(domain);
        let vault = await new Promise(r => chrome.storage.local.get(["pss_vault"], res => r(res.pss_vault || [])));
        vault = vault.filter(e => PSSCrypto.normalizeDomain(e.domain) !== clean);
        await new Promise(r => chrome.storage.local.set({ pss_vault: vault }, r));
        await this.fetchBackend(`/api/sites/${encodeURIComponent(clean)}`, { method: "DELETE" });
        return true;
    },

    // Dynamically checks only what is missing in sentence case
    checkStrength(password) {
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
    },

    async validatePassword(domain, plainPassword, strictReuse = false) {
        const settings = await this.getSettings();
        if (settings.enabled === false) {
            return { valid: true, code: "DISABLED", reason: null };
        }

        const cleanDomain = PSSCrypto.normalizeDomain(domain);
        const shaHash = await PSSCrypto.sha256(plainPassword);
        const site = await this.getSite(cleanDomain);

        const remoteReuse = await this.fetchBackend("/api/check-reuse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain: cleanDomain, password: plainPassword })
        });

        if (site) {
            const status = this.calculateStatus(site);
            const isCurrent =
                (remoteReuse && remoteReuse.isCurrent) ||
                (site.currentPasswordHash && site.currentPasswordHash === shaHash);

            if (isCurrent && !strictReuse) {
                if (status.isExpired) {
                    return { valid: false, code: "EXPIRED", reason: "Password expired." };
                }
                return { valid: true, code: "ACTIVE", reason: null };
            }

            if (Array.isArray(site.passwordHashHistory) && site.passwordHashHistory.includes(shaHash)) {
                return { valid: false, code: "REUSED", reason: "Old password not allowed." };
            }
        }

        if (remoteReuse && remoteReuse.reused) {
            return { valid: false, code: "REUSED", reason: "Old password not allowed." };
        }

        const strength = this.checkStrength(plainPassword);
        if (!strength.valid) {
            return { valid: false, code: "WEAK", reason: strength.reason };
        }

        const breach = await PSHIBP.checkBreach(plainPassword);
        if (breach.breached) {
            return { valid: false, code: "BREACHED", reason: "This password was leaked in a data breach." };
        }

        return { valid: true, code: "OK", reason: null };
    },

    async evaluateLoginAttempt(domain, plainPassword, username = "", siteName = "", strictReuse = false) {
        const settings = await this.getSettings();
        if (settings.enabled === false) {
            return { allowed: true, code: "DISABLED" };
        }

        const cleanDomain = PSSCrypto.normalizeDomain(domain);
        const shaHash = await PSSCrypto.sha256(plainPassword);
        const site = await this.getSite(cleanDomain);

        const remoteCheck = await this.fetchBackend("/api/check-reuse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain: cleanDomain, password: plainPassword })
        });

        if (site && !strictReuse) {
            const status = this.calculateStatus(site);
            const isCurrentPassword =
                (remoteCheck && remoteCheck.isCurrent) ||
                (site.currentPasswordHash && site.currentPasswordHash === shaHash);

            if (isCurrentPassword) {
                if (status.isExpired) {
                    return {
                        allowed: false,
                        code: "EXPIRED",
                        reason: "Password expired.",
                        site,
                        status
                    };
                }
                return { allowed: true, code: "ACTIVE", site, status };
            }
        }

        const validation = await this.validatePassword(cleanDomain, plainPassword, strictReuse);
        if (!validation.valid) {
            return {
                allowed: false,
                code: validation.code,
                reason: validation.reason
            };
        }

        const rot = await this.recordRotation(cleanDomain, plainPassword, username);
        return {
            allowed: true,
            code: "TRACKED",
            site: rot.site,
            status: this.calculateStatus(rot.site)
        };
    },

    async recordRotation(domain, plainPassword, username = "") {
        const cleanDomain = PSSCrypto.normalizeDomain(domain);
        const shaHash = await PSSCrypto.sha256(plainPassword);
        const nowIso = new Date().toISOString();

        let site = (await this.getSite(cleanDomain)) || {
            domain: cleanDomain,
            username: username || "",
            passwordHashHistory: []
        };

        const history = Array.isArray(site.passwordHashHistory) ? [...site.passwordHashHistory] : [];
        if (!history.includes(shaHash)) history.push(shaHash);

        site.currentPasswordHash = shaHash;
        site.passwordHashHistory = history;
        site.lastRotatedAt = nowIso;
        if (username) site.username = username;

        await this.saveSite(site, false);

        await this.fetchBackend("/api/record-rotation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                domain: cleanDomain,
                username: site.username || "",
                password: plainPassword,
                rotatedAt: nowIso
            })
        });

        return { success: true, site };
    },

    calculateStatus(entry) {
        if (!entry || !entry.lastRotatedAt) {
            return { status: "ACTIVE", daysRemaining: 30, daysOverdue: 0, isExpired: false, isNearExpiry: false };
        }
        const now = new Date();
        const lastRotated = new Date(entry.lastRotatedAt);
        const expiryDays = entry.expiryDays || 30;
        const warningDays = entry.warningThresholdDays || 5;
        const expiryDate = new Date(lastRotated.getTime() + expiryDays * 86400000);
        const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000);
        const isExpired = now >= expiryDate || daysRemaining <= 0;
        const isNearExpiry = !isExpired && daysRemaining <= warningDays;

        return {
            status: isExpired ? "EXPIRED" : isNearExpiry ? "NEAR_EXPIRY" : "ACTIVE",
            daysRemaining: isExpired ? 0 : daysRemaining,
            daysOverdue: isExpired ? Math.abs(daysRemaining) : 0,
            isExpired,
            isNearExpiry
        };
    }
};

if (typeof self !== "undefined") self.PSSStorage = PSSStorage;
