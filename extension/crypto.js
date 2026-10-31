// Password Security System — Crypto Utilities
// SHA-1 for HIBP k-Anonymity, SHA-256 for password history hashing

const PSSCrypto = {
    async sha1(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest("SHA-1", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    },

    async sha256(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    },

    normalizeDomain(urlOrDomain) {
        try {
            if (!urlOrDomain) return "";
            let hostname = urlOrDomain;
            if (urlOrDomain.startsWith("http://") || urlOrDomain.startsWith("https://")) {
                hostname = new URL(urlOrDomain).hostname;
            } else if (urlOrDomain.includes("/")) {
                hostname = urlOrDomain.split("/")[0];
            }
            return hostname.toLowerCase().replace(/^www\./, "").trim();
        } catch {
            return urlOrDomain.toLowerCase().trim();
        }
    }
};

if (typeof self !== "undefined") self.PSSCrypto = PSSCrypto;
