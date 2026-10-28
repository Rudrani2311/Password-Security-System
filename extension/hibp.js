// PassRotate HaveIBeenPwned (HIBP) Breach Detection Service
// Uses k-Anonymity model: sends only the first 5 characters of SHA-1 hash to api.pwnedpasswords.com
// Full password is NEVER exposed over the network.

const PassRotateHIBP = {
    /**
     * Check if a password has been leaked in public data breaches.
     * @param {string} password - The plain password to evaluate
     * @returns {Promise<{breached: boolean, count: number, hashPrefix: string, status: string}>}
     */
    async checkBreach(password) {
        if (!password || typeof password !== "string") {
            return { breached: false, count: 0, status: "EMPTY_PASSWORD" };
        }

        try {
            // Step 1: Compute SHA-1 of the password
            const fullHash = await PassRotateCrypto.sha1(password);
            const prefix = fullHash.substring(0, 5);
            const suffix = fullHash.substring(5);

            // Step 2: Fetch matches from HIBP range API (k-Anonymity)
            const apiUrl = `https://api.pwnedpasswords.com/range/${prefix}`;
            const response = await fetch(apiUrl, {
                method: "GET",
                headers: {
                    "Add-Padding": "true" // Extra privacy protection from HIBP
                }
            });

            if (!response.ok) {
                console.warn("HIBP API returned non-OK status:", response.status);
                return {
                    breached: false,
                    count: 0,
                    status: "API_UNAVAILABLE"
                };
            }

            const responseText = await response.text();
            const lines = responseText.split("\r\n");

            // Step 3: Search for matching suffix locally
            let breachCount = 0;
            for (const line of lines) {
                const [entrySuffix, countStr] = line.split(":");
                if (entrySuffix && entrySuffix.trim().toUpperCase() === suffix) {
                    breachCount = parseInt(countStr.trim(), 10) || 0;
                    break;
                }
            }

            return {
                breached: breachCount > 0,
                count: breachCount,
                hashPrefix: prefix,
                status: breachCount > 0 ? "COMPROMISED" : "SAFE"
            };
        } catch (error) {
            console.error("HIBP breach check error:", error);
            // Fallback gracefully so an offline user is not indefinitely blocked
            return {
                breached: false,
                count: 0,
                status: "OFFLINE_CHECK_SKIPPED",
                error: error.message
            };
        }
    }
};

if (typeof self !== "undefined") {
    self.PassRotateHIBP = PassRotateHIBP;
}
