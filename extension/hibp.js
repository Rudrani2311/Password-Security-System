// Password Security System — HaveIBeenPwned Breach Detection
// Uses k-Anonymity: only first 5 chars of SHA-1 hash are sent over the network.

const PSHIBP = {
    async checkBreach(password) {
        if (!password || typeof password !== "string") {
            return { breached: false, count: 0, status: "EMPTY_PASSWORD" };
        }
        try {
            const fullHash = await PSSCrypto.sha1(password);
            const prefix = fullHash.substring(0, 5);
            const suffix = fullHash.substring(5);

            const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
                method: "GET",
                headers: { "Add-Padding": "true" }
            });

            if (!response.ok) {
                return { breached: false, count: 0, status: "API_UNAVAILABLE" };
            }

            const text = await response.text();
            let breachCount = 0;
            for (const line of text.split("\r\n")) {
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
        } catch (error) {
            console.error("[PSS] HIBP check error:", error);
            return { breached: false, count: 0, status: "OFFLINE_CHECK_SKIPPED", error: error.message };
        }
    }
};

if (typeof self !== "undefined") self.PSHIBP = PSHIBP;
