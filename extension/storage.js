// PassRotate Storage & Vault Management
// Stores encrypted/hashed credential metadata and rotation timestamps in chrome.storage.local

const PassRotateStorage = {
    DEFAULT_EXPIRY_DAYS: 30,
    DEFAULT_WARNING_DAYS: 5,

    /**
     * Get all vault entries
     * @returns {Promise<Array>}
     */
    async getVault() {
        return new Promise(resolve => {
            chrome.storage.local.get(["passrotate_vault"], result => {
                const vault = result.passrotate_vault;
                if (Array.isArray(vault) && vault.length > 0) {
                    resolve(vault);
                } else {
                    // Seed initial demo vault entries for immediate out-of-the-box testing
                    const initialSeeds = PassRotateStorage.getInitialSeeds();
                    chrome.storage.local.set({ passrotate_vault: initialSeeds }, () => {
                        resolve(initialSeeds);
                    });
                }
            });
        });
    },

    /**
     * Returns default demonstration sites including Coursera, GitHub, and Localhost Demo
     */
    getInitialSeeds() {
        const now = new Date();

        // 1. Coursera: Set to NEAR_EXPIRY (Day 26, 4 days left)
        const courseraRotated = new Date(now.getTime() - (26 * 24 * 60 * 60 * 1000));

        // 2. Cloud / Render Demo Site: Set to EXPIRED (Day 32, expired 2 days ago)
        const expiredRotated = new Date(now.getTime() - (32 * 24 * 60 * 60 * 1000));

        // 3. GitHub: Set to FRESH / ACTIVE (Day 3, 27 days left)
        const githubRotated = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));

        return [
            {
                id: "seed-coursera",
                domain: "coursera.org",
                siteName: "Coursera",
                username: "student.learner@gmail.com",
                lastRotatedAt: courseraRotated.toISOString(),
                expiryDays: 30,
                warningThresholdDays: 5,
                forgotPasswordUrl: "https://www.coursera.org/?authMode=resetPassword",
                passwordHashHistory: [],
                notes: "Coursera Account - Near Expiry Demo"
            },
            {
                id: "seed-demo",
                domain: "onrender.com",
                siteName: "Cloud Security Demo Portal",
                username: "alex.demo@gmail.com",
                lastRotatedAt: expiredRotated.toISOString(),
                expiryDays: 30,
                warningThresholdDays: 5,
                forgotPasswordUrl: "/forgot-password.html",
                passwordHashHistory: [],
                notes: "Cloud Render Demo Portal - Expired Demo"
            },
            {
                id: "seed-github",
                domain: "github.com",
                siteName: "GitHub",
                username: "developer@gmail.com",
                lastRotatedAt: githubRotated.toISOString(),
                expiryDays: 30,
                warningThresholdDays: 5,
                forgotPasswordUrl: "https://github.com/password_reset",
                passwordHashHistory: [],
                notes: "GitHub Account - Active"
            }
        ];
    },

    /**
     * Get settings
     */
    async getSettings() {
        return new Promise(resolve => {
            chrome.storage.local.get(["passrotate_settings"], result => {
                const defaults = {
                    userEmail: "security.user@gmail.com",
                    emailAlertsEnabled: true,
                    browserNotificationsEnabled: true,
                    defaultExpiryDays: 30,
                    defaultWarningDays: 5,
                    webhookAlertUrl: "https://passrotate-security-portal.onrender.com/api/alert-email"
                };
                resolve({ ...defaults, ...(result.passrotate_settings || {}) });
            });
        });
    },

    /**
     * Save settings
     */
    async saveSettings(settings) {
        return new Promise(resolve => {
            chrome.storage.local.set({ passrotate_settings: settings }, () => {
                resolve(settings);
            });
        });
    },

    /**
     * Get site entry matching a domain or URL
     */
    async getSite(urlOrDomain) {
        const domain = PassRotateCrypto.normalizeDomain(urlOrDomain);
        const vault = await this.getVault();
        return vault.find(entry => PassRotateCrypto.normalizeDomain(entry.domain) === domain) || null;
    },

    /**
     * Save or update site entry
     */
    async saveSite(entry) {
        const vault = await this.getVault();
        const cleanDomain = PassRotateCrypto.normalizeDomain(entry.domain);
        const existingIdx = vault.findIndex(
            e => (entry.id && e.id === entry.id) || PassRotateCrypto.normalizeDomain(e.domain) === cleanDomain
        );

        const record = {
            id: entry.id || "site_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
            domain: cleanDomain,
            siteName: entry.siteName || cleanDomain,
            username: entry.username || "",
            lastRotatedAt: entry.lastRotatedAt || new Date().toISOString(),
            expiryDays: entry.expiryDays || this.DEFAULT_EXPIRY_DAYS,
            warningThresholdDays: entry.warningThresholdDays || this.DEFAULT_WARNING_DAYS,
            forgotPasswordUrl: entry.forgotPasswordUrl || "",
            passwordHashHistory: entry.passwordHashHistory || [],
            notes: entry.notes || ""
        };

        if (existingIdx >= 0) {
            vault[existingIdx] = { ...vault[existingIdx], ...record };
        } else {
            vault.unshift(record);
        }

        return new Promise(resolve => {
            chrome.storage.local.set({ passrotate_vault: vault }, () => {
                resolve(record);
            });
        });
    },

    /**
     * Delete a site from the vault
     */
    async deleteSite(idOrDomain) {
        let vault = await this.getVault();
        const clean = PassRotateCrypto.normalizeDomain(idOrDomain);
        vault = vault.filter(e => e.id !== idOrDomain && PassRotateCrypto.normalizeDomain(e.domain) !== clean);
        return new Promise(resolve => {
            chrome.storage.local.set({ passrotate_vault: vault }, () => {
                resolve(true);
            });
        });
    },

    /**
     * Record a password rotation event for a domain
     */
    async recordRotation(domain, newPasswordPlain, username) {
        const site = (await this.getSite(domain)) || {
            domain: PassRotateCrypto.normalizeDomain(domain),
            siteName: domain,
            username: username || ""
        };

        const now = new Date();
        const newHash = newPasswordPlain ? await PassRotateCrypto.sha256(newPasswordPlain) : null;
        const history = site.passwordHashHistory || [];

        // Check password reuse (against last 3 passwords)
        if (newHash && history.slice(-3).includes(newHash)) {
            return {
                success: false,
                message: "Password Reuse Blocked: You cannot reuse one of your last 3 passwords!"
            };
        }

        if (newHash) {
            history.push(newHash);
            if (history.length > 5) history.shift();
        }

        site.lastRotatedAt = now.toISOString();
        if (username) site.username = username;
        site.passwordHashHistory = history;

        await this.saveSite(site);

        return {
            success: true,
            message: `Password rotated successfully for ${site.domain}! 30-day countdown has been reset.`,
            site: site
        };
    },

    /**
     * Compute real-time lifecycle status of an account
     */
    calculateStatus(entry) {
        if (!entry || !entry.lastRotatedAt) {
            return {
                status: "ACTIVE",
                daysRemaining: 30,
                daysSinceRotation: 0,
                isExpired: false,
                isNearExpiry: false,
                expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            };
        }

        const now = new Date();
        const lastRotated = new Date(entry.lastRotatedAt);
        const expiryDays = entry.expiryDays || this.DEFAULT_EXPIRY_DAYS;
        const warningDays = entry.warningThresholdDays || this.DEFAULT_WARNING_DAYS;

        const expiryDate = new Date(lastRotated.getTime() + expiryDays * 24 * 60 * 60 * 1000);
        const msRemaining = expiryDate.getTime() - now.getTime();
        const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
        const daysSinceRotation = Math.floor((now.getTime() - lastRotated.getTime()) / (1000 * 60 * 60 * 24));

        let status = "ACTIVE";
        let isExpired = false;
        let isNearExpiry = false;

        if (now >= expiryDate || daysRemaining <= 0) {
            status = "EXPIRED";
            isExpired = true;
        } else if (daysRemaining <= warningDays) {
            status = "NEAR_EXPIRY";
            isNearExpiry = true;
        }

        return {
            status,
            daysRemaining: isExpired ? 0 : daysRemaining,
            daysOverdue: isExpired ? Math.abs(daysRemaining) : 0,
            daysSinceRotation,
            isExpired,
            isNearExpiry,
            expiryDate: expiryDate.toISOString(),
            lastRotatedDate: lastRotated.toISOString()
        };
    },

    /**
     * Simulation tool for instant teacher testing and live grading demonstrations
     */
    async simulateState(domain, targetState) {
        const site = await this.getSite(domain);
        if (!site) return null;

        const now = new Date();
        let simulatedDate = now;

        if (targetState === "EXPIRED") {
            // Set rotated 32 days ago -> 2 days overdue
            simulatedDate = new Date(now.getTime() - 32 * 24 * 60 * 60 * 1000);
        } else if (targetState === "NEAR_EXPIRY") {
            // Set rotated 26 days ago -> 4 days remaining (within 5-day warning)
            simulatedDate = new Date(now.getTime() - 26 * 24 * 60 * 60 * 1000);
        } else {
            // Fresh / Active -> rotated today
            simulatedDate = now;
        }

        site.lastRotatedAt = simulatedDate.toISOString();
        await this.saveSite(site);
        return this.calculateStatus(site);
    }
};

if (typeof self !== "undefined") {
    self.PassRotateStorage = PassRotateStorage;
}
