// Password Security System — HaveIBeenPwned Breach Detection
// Uses k-Anonymity: only first 5 chars of SHA-1 hash are sent over the network.

const PSHIBP = {
    // Offline fallback SHA-1 hashes for common leaked passwords that pass complexity rules
    KNOWN_BREACHED_SHA1: new Set([
        "7751A23FA55170A57E90374DF13A3AB78EFE0E99", // P@ssw0rd123!
        "2891BACEEEF1652EE698294DA0E71BA78A2A4064", // Password123!
        "B8473B86D4C2072CA9B08BD28E373E8253E865C4", // Welcome@123
        "F865B53623B121FD34EE5426C792E5C33AF8C227", // admin123
        "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8"  // password
    ]),

    async checkBreach(password) {
        if (!password || typeof password !== "string") {
            return { breached: false, count: 0, status: "EMPTY_PASSWORD" };
        }
        try {
            const fullHash = await PSSCrypto.sha1(password);
            if (this.KNOWN_BREACHED_SHA1.has(fullHash)) {
                return { breached: true, count: 1000, status: "COMPROMISED" };
            }

            const prefix = fullHash.substring(0, 5);
            const suffix = fullHash.substring(5);

            // Simple GET without custom headers avoids CORS preflight failures
            let text = "";
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 4000);
                const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
                    method: "GET",
                    signal: controller.signal
                });
                clearTimeout(timer);
                if (response.ok) {
                    text = await response.text();
                }
            } catch {
                // Fallback to cloud or local backend proxy if direct browser request is blocked
                const bases = [
                    "https://password-security-system-zoni.onrender.com",
                    "http://localhost:5000"
                ];
                for (const b of bases) {
                    try {
                        const proxyRes = await fetch(`${b}/api/hibp/${prefix}`);
                        if (proxyRes.ok) {
                            text = await proxyRes.text();
                            if (text) break;
                        }
                    } catch {}
                }
            }

            if (!text) {
                return { breached: false, count: 0, status: "OFFLINE_CHECK_SKIPPED" };
            }

            let breachCount = 0;
            for (const line of text.split(/\r?\n/)) {
                const [entrySuffix, countStr] = line.split(":");
                if (entrySuffix && entrySuffix.trim().toUpperCase() === suffix) {
                    breachCount = parseInt(countStr.trim(), 10) || 0;
                    break;
                }
            }

            return {
                breached: breachCount > 0,
                count: breachCount,
                status: breachCount > 0 ? "COMPROMISED" : "SAFE"
            };
        } catch {
            return { breached: false, count: 0, status: "OFFLINE_CHECK_SKIPPED" };
        }
    }
};

if (typeof self !== "undefined") self.PSHIBP = PSHIBP;
