// Password Security System — Storage & MongoDB Sync Engine
// Syncs password hashes, history, and 30-day expiry dates with MongoDB Atlas backend + chrome.storage.local

const PSSStorage = {
    DEFAULT_EXPIRY_DAYS: 30,
    DEFAULT_WARNING_DAYS: 5,
    CLOUD_SERVER_URL: "https://password-security-system.onrender.com",
    LOCAL_SERVER_URL: "http://localhost:5000",

    /**
     * Resolves active backend URL (tries configured URL or local server, falls back to cloud server)
     */
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
        for (const base of endpoints) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 3500);
                const res = await fetch(`${base}${path}`, {
                    ...options,
                    signal: controller.signal
                });
                clearTimeout(timer);
                if (res.ok) {
                    return await res.json();
                }
            } catch {
                // Try next endpoint
            }
        }
        return null;
    },

    // ─── Local Vault Cache ────────────────────────────────────────────────────

    async getVault() {
        return new Promise(resolve => {
            chrome.storage.local.get(["pss_vault"], async result => {
                let localVault = Array.isArray(result.pss_vault) ? result.pss_vault : [];

                // Sync with MongoDB backend if reachable
                const remote = await this.fetchBackend("/api/sites");
                if (remote && Array.isArray(remote.sites) && remote.mongoConnected) {
                    const mergedMap = new Map();
                    for (const item of localVault) {
                        mergedMap.set(PSSCrypto.normalizeDomain(item.domain), item);
                    }
                    for (const rItem of remote.sites) {
                        const d = PSSCrypto.normalizeDomain(rItem.domain);
                        const existing = mergedMap.get(d) || {};
                        const combinedHistory = Array.from(new Set([
                            ...(existing.passwordHashHistory || []),
                            ...(rItem.passwordHashHistory || []),
                            ...(rItem.currentPasswordHash ? [rItem.currentPasswordHash] : [])
                        ]));
                        mergedMap.set(d, {
                            ...existing,
                            ...rItem,
                            domain: d,
                            passwordHashHistory: combinedHistory
                        });
                    }
                    localVault = Array.from(mergedMap.values());
                    chrome.storage.local.set({ pss_vault: localVault });
                }

                resolve(localVault);
            });
        });
    },

    async _saveVault(vault) {
        return new Promise(resolve => {
            chrome.storage.local.set({ pss_vault: vault }, resolve);
        });
    },

    // ─── Settings ─────────────────────────────────────────────────────────────

    async getSettings() {
        return new Promise(resolve => {
            chrome.storage.local.get(["pss_settings"], result => {
                const defaults = {
                    browserNotificationsEnabled: true,
                    defaultExpiryDays: 30,
                    defaultWarningDays: 5,
                    serverUrl: "http://localhost:5000"
                };
                resolve({ ...defaults, ...(result.pss_settings || {}) });
            });
        });
    },

    async saveSettings(settings) {
        return new Promise(resolve => {
            chrome.storage.local.set({ pss_settings: settings }, () => resolve(settings));
        });
    },

    // ─── Site Lookup & Management ─────────────────────────────────────────────

    async getSite(domain) {
        const clean = PSSCrypto.normalizeDomain(domain);
        if (!clean) return null;

        // Check MongoDB backend first for freshest state
        const remote = await this.fetchBackend(`/api/site/${encodeURIComponent(clean)}`);
        const vault = await new Promise(r => chrome.storage.local.get(["pss_vault"], res => r(res.pss_vault || [])));
        const localSite = vault.find(e => PSSCrypto.normalizeDomain(e.domain) === clean) || null;

        if (remote && remote.managed && remote.site) {
            const combinedHistory = Array.from(new Set([
                ...(localSite ? localSite.passwordHashHistory || [] : []),
                ...(remote.site.passwordHashHistory || []),
                ...(remote.site.currentPasswordHash ? [remote.site.currentPasswordHash] : [])
            ]));
            const merged = {
                ...(localSite || {}),
                ...remote.site,
                domain: clean,
                passwordHashHistory: combinedHistory
            };
            await this.saveLocalSiteOnly(merged);
            return merged;
        }

        return localSite;
    },

    async saveLocalSiteOnly(entry) {
        const vault = await new Promise(r => chrome.storage.local.get(["pss_vault"], res => r(res.pss_vault || [])));
        const cleanDomain = PSSCrypto.normalizeDomain(entry.domain);
        const idx = vault.findIndex(e => PSSCrypto.normalizeDomain(e.domain) === cleanDomain);

        const record = {
            id: entry.id || "site_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
            domain: cleanDomain,
            siteName: entry.siteName || cleanDomain,
            username: entry.username || "",
            currentPasswordHash: entry.currentPasswordHash || "",
            lastRotatedAt: entry.lastRotatedAt || new Date().toISOString(),
            expiryDays: entry.expiryDays || this.DEFAULT_EXPIRY_DAYS,
            warningThresholdDays: entry.warningThresholdDays || this.DEFAULT_WARNING_DAYS,
            passwordHashHistory: entry.passwordHashHistory || []
        };

        if (idx >= 0) {
            vault[idx] = { ...vault[idx], ...record };
        } else {
            vault.unshift(record);
        }

        await this._saveVault(vault);
        return record;
    },

    async saveSite(entry) {
        return this.saveLocalSiteOnly(entry);
    },

    async deleteSite(domain) {
        const clean = PSSCrypto.normalizeDomain(domain);
        let vault = await new Promise(r => chrome.storage.local.get(["pss_vault"], res => r(res.pss_vault || [])));
        vault = vault.filter(e => PSSCrypto.normalizeDomain(e.domain) !== clean);
        await this._saveVault(vault);
        await this.fetchBackend(`/api/sites/${encodeURIComponent(clean)}`, { method: "DELETE" });
        return true;
    },

    // ─── Password Security Requirements (8+ chars, upper, lower, digit, special) ──

    checkStrength(password) {
        if (!password || password.length < 8) {
            return { valid: false, reason: "Password must be at least 8 characters long." };
        }
        if (!/[A-Z]/.test(password)) {
            return { valid: false, reason: "Password must include at least one uppercase letter (A-Z)." };
        }
        if (!/[a-z]/.test(password)) {
            return { valid: false, reason: "Password must include at least one lowercase letter (a-z)." };
        }
        if (!/[0-9]/.test(password)) {
            return { valid: false, reason: "Password must include at least one number (0-9)." };
        }
        if (!/[^A-Za-z0-9]/.test(password)) {
            return { valid: false, reason: "Password must include at least one special character (e.g. @, #, $, !)." };
        }
        return { valid: true, reason: null };
    },

    // ─── Full 3-Step Password Validation (Reuse + Strength + HIBP Breach) ────

    async validatePassword(domain, plainPassword, username = "") {
        const cleanDomain = PSSCrypto.normalizeDomain(domain);
        const newHash = await PSSCrypto.sha256(plainPassword);

        // 1. Check if password was used before (Local + MongoDB)
        const site = await this.getSite(cleanDomain);
        if (site) {
            const history = site.passwordHashHistory || [];
            if (site.currentPasswordHash === newHash || history.includes(newHash)) {
                return {
                    valid: false,
                    code: "REUSED",
                    reason: "Password Not Allowed: You have used this password before. Please choose a brand new password."
                };
            }
        }

        const remoteReuse = await this.fetchBackend("/api/check-reuse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain: cleanDomain, username, passwordHash: newHash })
        });
        if (remoteReuse && remoteReuse.reused) {
            return {
                valid: false,
                code: "REUSED",
                reason: "Password Not Allowed: This password matches one of your old passwords stored in MongoDB."
            };
        }

        // 2. Check security complexity requirements
        const strength = this.checkStrength(plainPassword);
        if (!strength.valid) {
            return {
                valid: false,
                code: "WEAK",
                reason: `Password Not Allowed: ${strength.reason}`
            };
        }

        // 3. Check HaveIBeenPwned Data Breach API
        const breachResult = await PSHIBP.checkBreach(plainPassword);
        if (breachResult.breached) {
            return {
                valid: false,
                code: "BREACHED",
                reason: `Password Not Allowed: This password has appeared in ${breachResult.count.toLocaleString()} known data breaches (HaveIBeenPwned).`
            };
        }

        return { valid: true, code: "OK", reason: null };
    },

    // ─── Login Interception Gatekeeper ────────────────────────────────────────

    /**
     * Evaluates a login attempt when a user submits a login form on any website.
     * Enforces:
     *  - Expiry lockout (if site password is expired and user hasn't rotated to a valid new password)
     *  - If user enters a new/rotated password (or first-time login), checks:
     *      1) Not in old password history (MongoDB + local)
     *      2) Meets 8+ char & character combination requirements
     *      3) Not in HaveIBeenPwned data breaches
     */
    async evaluateLoginAttempt(domain, plainPassword, username = "", siteName = "") {
        const cleanDomain = PSSCrypto.normalizeDomain(domain);
        const passwordHash = await PSSCrypto.sha256(plainPassword);
        const site = await this.getSite(cleanDomain);

        if (site) {
            const status = this.calculateStatus(site);

            // Case A: User is logging in with their existing stored password
            if (site.currentPasswordHash && site.currentPasswordHash === passwordHash) {
                if (status.isExpired) {
                    return {
                        allowed: false,
                        code: "EXPIRED",
                        reason: `Password Not Allowed: Your password for ${site.siteName || cleanDomain} expired ${status.daysOverdue > 0 ? status.daysOverdue + " days ago" : "today"} (30-day policy). You must reset your password via "Forgot Password".`,
                        site,
                        status
                    };
                }

                // Active & valid existing password
                return {
                    allowed: true,
                    code: "ACTIVE",
                    reason: null,
                    site,
                    status
                };
            }

            // Case B: Site is tracked with NO hash recorded yet, and it is EXPIRED
            if (!site.currentPasswordHash && status.isExpired) {
                return {
                    allowed: false,
                    code: "EXPIRED",
                    reason: `Password Not Allowed: Your password for ${site.siteName || cleanDomain} has expired. Please reset it via "Forgot Password".`,
                    site,
                    status
                };
            }

            // Case C: User typed a DIFFERENT password on a tracked site
            // (e.g. they just rotated their password via Forgot Password, OR they typed an old password)
            const validation = await this.validatePassword(cleanDomain, plainPassword, username || site.username);
            if (!validation.valid) {
                return {
                    allowed: false,
                    code: validation.code,
                    reason: validation.reason,
                    site,
                    status
                };
            }

            // Passes all 3 checks! Record the new rotated password in MongoDB & local vault
            const rotResult = await this.recordRotation(cleanDomain, plainPassword, username || site.username, siteName || site.siteName);
            return {
                allowed: true,
                code: "ROTATED",
                reason: "New password verified (not reused, meets security requirements, 0 breaches). 30-day timer reset!",
                site: rotResult.site,
                status: this.calculateStatus(rotResult.site)
            };
        }

        // Case D: First-time login on an untracked website
        // Validate the password against all 3 security rules before allowing login & tracking
        const validation = await this.validatePassword(cleanDomain, plainPassword, username);
        if (!validation.valid) {
            return {
                allowed: false,
                code: validation.code,
                reason: validation.reason,
                site: null,
                status: null
            };
        }

        // Save to MongoDB and local vault to start the 30-day countdown
        const rotResult = await this.recordRotation(cleanDomain, plainPassword, username, siteName || cleanDomain);
        return {
            allowed: true,
            code: "FIRST_LOGIN_TRACKED",
            reason: null,
            site: rotResult.site,
            status: this.calculateStatus(rotResult.site)
        };
    },

    // ─── Record Rotation ──────────────────────────────────────────────────────

    async recordRotation(domain, plainPassword, username = "", siteName = "") {
        const cleanDomain = PSSCrypto.normalizeDomain(domain);
        const newHash = await PSSCrypto.sha256(plainPassword);
        const nowIso = new Date().toISOString();

        let site = (await this.getSite(cleanDomain)) || {
            domain: cleanDomain,
            siteName: siteName || cleanDomain,
            username: username || "",
            passwordHashHistory: []
        };

        const history = Array.isArray(site.passwordHashHistory) ? [...site.passwordHashHistory] : [];
        if (site.currentPasswordHash && !history.includes(site.currentPasswordHash)) {
            history.push(site.currentPasswordHash);
        }
        if (!history.includes(newHash)) {
            history.push(newHash);
        }
        if (history.length > 15) history.splice(0, history.length - 15);

        site.currentPasswordHash = newHash;
        site.passwordHashHistory = history;
        site.lastRotatedAt = nowIso;
        if (username) site.username = username;
        if (siteName) site.siteName = siteName;

        const savedLocal = await this.saveLocalSiteOnly(site);

        // Sync to MongoDB Atlas backend
        await this.fetchBackend("/api/record-rotation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                domain: cleanDomain,
                siteName: site.siteName || cleanDomain,
                username: site.username || "",
                passwordHash: newHash,
                rotatedAt: nowIso
            })
        });

        return {
            success: true,
            message: `Password saved for ${cleanDomain}. 30-day expiry countdown started.`,
            site: savedLocal
        };
    },

    // ─── Status Calculation ───────────────────────────────────────────────────

    calculateStatus(entry) {
        if (!entry || !entry.lastRotatedAt) {
            return {
                status: "ACTIVE",
                daysRemaining: this.DEFAULT_EXPIRY_DAYS,
                daysOverdue: 0,
                daysSinceRotation: 0,
                isExpired: false,
                isNearExpiry: false,
                expiryDate: new Date(Date.now() + this.DEFAULT_EXPIRY_DAYS * 86400000).toISOString(),
                lastRotatedDate: new Date().toISOString()
            };
        }

        const now = new Date();
        const lastRotated = new Date(entry.lastRotatedAt);
        const expiryDays = entry.expiryDays || this.DEFAULT_EXPIRY_DAYS;
        const warningDays = entry.warningThresholdDays || this.DEFAULT_WARNING_DAYS;
        const expiryDate = new Date(lastRotated.getTime() + expiryDays * 86400000);
        const msRemaining = expiryDate.getTime() - now.getTime();
        const daysRemaining = Math.ceil(msRemaining / 86400000);
        const daysSinceRotation = Math.floor((now.getTime() - lastRotated.getTime()) / 86400000);

        const isExpired = now >= expiryDate || daysRemaining <= 0;
        const isNearExpiry = !isExpired && daysRemaining <= warningDays;

        return {
            status: isExpired ? "EXPIRED" : isNearExpiry ? "NEAR_EXPIRY" : "ACTIVE",
            daysRemaining: isExpired ? 0 : daysRemaining,
            daysOverdue: isExpired ? Math.abs(daysRemaining) : 0,
            daysSinceRotation,
            isExpired,
            isNearExpiry,
            expiryDate: expiryDate.toISOString(),
            lastRotatedDate: lastRotated.toISOString()
        };
    }
};

if (typeof self !== "undefined") self.PSSStorage = PSSStorage;
