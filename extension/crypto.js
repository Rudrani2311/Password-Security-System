// PassRotate Crypto Utility
// Provides Web Crypto API helpers for SHA-1 (HIBP) and SHA-256 (history fingerprinting)

const PassRotateCrypto = {
    /**
     * Compute SHA-1 hash in hexadecimal format (used for HIBP k-Anonymity)
     * @param {string} text
     * @returns {Promise<string>} Upper-cased 40-character hex string
     */
    async sha1(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest("SHA-1", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
        return hashHex.toUpperCase();
    },

    /**
     * Compute SHA-256 hash in hexadecimal format (used for password history check without plaintext storage)
     * @param {string} text
     * @returns {Promise<string>}
     */
    async sha256(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    },

    /**
     * Clean and normalize a domain name (e.g., 'https://www.coursera.org/login' -> 'coursera.org')
     * @param {string} urlOrDomain
     * @returns {string}
     */
    normalizeDomain(urlOrDomain) {
        try {
            if (!urlOrDomain) return "";
            let hostname = urlOrDomain;
            if (urlOrDomain.startsWith("http://") || urlOrDomain.startsWith("https://")) {
                hostname = new URL(urlOrDomain).hostname;
            } else if (urlOrDomain.includes("/")) {
                hostname = urlOrDomain.split("/")[0];
            }
            // Strip 'www.'
            return hostname.toLowerCase().replace(/^www\./, "").trim();
        } catch {
            return urlOrDomain.toLowerCase().trim();
        }
    }
};

// Expose globally for both service worker and browser window
if (typeof self !== "undefined") {
    self.PassRotateCrypto = PassRotateCrypto;
}
