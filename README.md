# 🛡️ PassRotate — Universal Password Expiry, Rotation & Breach Defense Extension

> **A Universal Browser Extension (Chrome / Edge / Brave Manifest V3) enforcing a 30-Day Password Rotation Policy, 5-Day Near-Expiry Warnings, and HaveIBeenPwned (HIBP) Dark Web Breach Detection across ANY website (e.g., Coursera, GitHub, Google, or local portals).**

---

## 🎯 Project Overview & Objective

Major third-party platforms (like Coursera, GitHub, LinkedIn, or Netflix) manage their own authentication backends. They do not allow external students, enterprises, or plugins to modify their internal database engines to expire passwords.

**PassRotate** solves this fundamental challenge by acting as a **Zero-Trust Client-Side Security Gateway** directly inside the user's browser:
1. **Monitors Credential Age**: Automatically tracks when a password was last rotated for any visited domain.
2. **5-Day Near-Expiry Warning**: Alerts the user 5 days before the 30-day limit via an in-page floating alert bar, Chrome system notifications, and automated Gmail reminders.
3. **Mandatory 30-Day Lockout**: When the 30-day limit is reached, PassRotate intercepts login attempts on the website, locks the password field, and enforces password rotation.
4. **Option 1 ("Forgot Password & Gmail Reset")**: Provides a one-click gateway to the website's native *"Forgot Password"* flow, emailing a secure reset link to the user's Gmail.
5. **Have I Been Pwned (HIBP) Dark Web Breach Screening**: Uses **k-Anonymity SHA-1 hashing** to scan new passwords against billions of known leaked credentials without ever exposing the password over the network.
6. **Password Reuse Prevention**: Blocks users from rotating back to any of their last 3 passwords.

---

## 🏗️ Architectural Flow

```
                               ┌─────────────────────────────────────────────────────────────┐
                               │                    User's Web Browser                       │
                               │                                                             │
  Target Website               │   PassRotate Content Script      PassRotate Background      │
 (e.g. Coursera.org)           │   (Injected into Webpage)        Service Worker (V3)        │
  ┌───────────────────┐        │  ┌───────────────────────┐      ┌─────────────────────────┐ │
  │ Login Form        │◄───────┼──┤ Detects Domain        │◄────►│ Alarms & Storage Vault  │ │
  │ & Password Input  │        │  │ Injects 5-Day Banner  │      │ Badge Counters          │ │
  └─────────┬─────────┘        │  │ Enforces Lockout Modal│      │ Desktop Notifications   │ │
            │                  │  └───────────┬───────────┘      └───────────┬─────────────┘ │
            │ Blocked on Day 30+              │                              │               │
            ▼                                 │                              ▼               │
  ┌───────────────────┐                       │                  ┌─────────────────────────┐ │
  │ "Forgot Password" │◄──────────────────────┘                  │ Web Crypto API          │ │
  │ Link Clicked      │                                          │ SHA-1 Prefix (5 chars)  │ │
  └─────────┬─────────┘                                          └───────────┬─────────────┘ │
            │                                                                │               │
            │ Dispatches Reset Link to Gmail                                 │               │
            ▼                                                                │               │
  ┌───────────────────┐                                                      ▼               │
  │ User's Gmail      │                                          ┌─────────────────────────┐ │
  │ Secure Reset Link │                                          │ HaveIBeenPwned API      │ │
  └─────────┬─────────┘                                          │ (Dark Web Breach Check) │ │
            │                                                    └─────────────────────────┘ │
            ▼                                                                                │
  ┌───────────────────┐                                                                      │
  │ Rotates Password  │──────────────────────────────────────────────────────────────────────┘
  │ 30-Day Reset!     │
  └───────────────────┘
```

---

## 📂 Project Structure

```
Password-Security-System/
├── extension/                       # Chrome / Edge / Brave Extension (Manifest V3)
│   ├── manifest.json                # V3 manifest configuration & permissions
│   ├── icons/                       # High-res security shield icons (16, 48, 128px)
│   ├── background/
│   │   └── service-worker.js        # Background alarms, notifications, badge counters
│   ├── content/
│   │   ├── content-script.js        # In-page banner, lockout modal, forgot-password finder
│   │   └── content-styles.css       # Non-conflicting isolation styles for web page overlays
│   ├── popup/
│   │   ├── popup.html               # Quick toolbar popup interface
│   │   ├── popup.js                 # Popup controller & 1-click simulation buttons
│   │   └── popup.css                # Dark-themed responsive styles
│   ├── dashboard/
│   │   ├── dashboard.html           # Full-screen Security Command Center
│   │   ├── dashboard.js             # Vault table, metrics, settings, breach auditor
│   │   └── dashboard.css            # Enterprise cybersecurity styling
│   └── utils/
│       ├── crypto.js                # WebCrypto SHA-1 & SHA-256 helpers
│       ├── hibp.js                  # HaveIBeenPwned k-Anonymity breach scanner
│       └── storage.js               # chrome.storage.local vault management & simulations
├── demo-site/                       # Offline Coursera-like learning portal for demonstration
│   ├── index.html                   # Login page with password input & forgot password link
│   ├── forgot-password.html         # Simulated Gmail reset link flow & breach checking
│   ├── style.css                    # Modern UI styling
│   └── script.js                    # Demo page interactions
├── server.js                        # Lightweight demo web server & Gmail webhook dispatcher
├── package.json                     # Node.js configuration
├── legacy-backup/                   # Safely archived previous files from earlier iterations
└── README.md                        # Complete documentation & testing guide
```

---

## ☁️ Deploying to Render (For Cloud Hosting on Any System)

To make your security demo portal and Gmail webhook accessible on **ANY machine, phone, or browser globally without localhost**:

### 1-Click Render Deployment Steps:
1. Push your repository to **GitHub**:
   ```bash
   git add .
   git commit -m "PassRotate - Universal Extension & Cloud Portal"
   git push origin main
   ```
2. Log into **[render.com](https://render.com/)** (Free tier).
3. Click **"New +"** -> **"Web Service"**.
4. Select your GitHub repository `Password-Security-System`.
5. Render automatically reads our `render.yaml` blueprint:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Port:** `10000` (detected automatically via `process.env.PORT`)
6. Click **"Deploy Web Service"**.
7. Once deployed, Render will give you a public URL:  
   `https://passrotate-security-portal.onrender.com`
8. Now, anyone in the world can open this link, test the Coursera-like learning portal, and receive cloud alerts from the extension!

---

## 🚀 How to Install & Run the Extension Locally or on Any Machine
1. Open Google Chrome (or Edge / Brave).
2. Navigate to: `chrome://extensions/`
3. Toggle on **"Developer mode"** in the top-right corner.
4. Click the **"Load unpacked"** button in the top-left corner.
5. Select the `extension` folder located inside this project:  
   `C:\Users\Rudrani Rakshit\Desktop\Password-Security-System\extension`
6. You will see **"PassRotate - Universal Password Expiry & Breach Guard"** active with its shield icon!

---

## 🧪 Step-by-Step Teacher Testing Guide

### Test 1: Testing on External Live Websites (e.g. Coursera)
1. Open Chrome and go to `https://www.coursera.org/`
2. Click the **PassRotate shield icon** in your Chrome toolbar.
3. PassRotate detects `coursera.org`. Click **"Day 26 (Warn 5d)"**:
   - Notice the amber badge `4d` appears on the extension icon.
   - Look at the top of Coursera's webpage: a floating warning banner appears:  
     *⚠️ "PassRotate Security Policy: Your password for Coursera expires in 4 days. Please rotate it before lockout occurs."*
4. In the PassRotate popup, click **"Day 32 (Expired)"**:
   - Notice the extension icon badge turns into a red `!`.
   - The webpage triggers the **PassRotate Security Gatekeeper Modal**:
     - *🚫 "Password Expired on Coursera — 30-Day Mandatory Rotation Policy"*
     - Password input fields are locked.
     - Click **`[ 🔄 Reset via Coursera "Forgot Password" ]`**:  
       PassRotate immediately finds and opens Coursera's password reset page so Coursera sends the reset link to your Gmail!

---

### Test 2: Testing on the Offline Demo Portal (`localhost:5000`)
1. Open `http://localhost:5000` in Chrome.
2. In the PassRotate popup, click **"Day 32 (Expired)"** for `localhost`.
3. Try to click on the password field or submit the login form.
4. PassRotate intercepts the submission and displays the Lockout Modal.
5. Click **"Reset via LearnHub Forgot Password"**:
   - You are taken to `forgot-password.html`.
   - Click **"Send Password Reset Link to Gmail"**.
   - Type in a new password.

---

### Test 3: Testing Dark Web Breach Detection (Have I Been Pwned)
1. Open the PassRotate popup or Dashboard.
2. In the **Dark Web Leak Checker**, enter a known leaked password (e.g., `password123` or `admin1234`).
3. Click **"Check"**:
   - 🚨 PassRotate alerts: *Compromised in 9,000,000+ public data breaches!*
4. Now enter a unique complex passphrase (e.g., `Rudrani#Cyber$ecurity!2026`).
5. Click **"Check"**:
   - ✅ PassRotate confirms: *0 known breaches found in HIBP database.*

---

## 🔒 Security Principles Explained for Examination

### 1. Why k-Anonymity for Breach Detection?
When querying HaveIBeenPwned:
- We compute `SHA-1(password) = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8`.
- Only the first 5 characters (`5BAA6`) are sent to `https://api.pwnedpasswords.com/range/5BAA6`.
- The API returns all suffixes matching that 5-char prefix.
- The browser checks the remaining 35 characters **locally**.
- **Result:** The user's actual password never leaves their machine, protecting privacy completely.

### 2. Client-Side Gatekeeping vs. Server Modding
External platforms (Coursera, Google) will never expose their private internal databases to external student projects. Operating as an enterprise client-side extension is the **exact method used by Okta Verify, 1Password, and Bitwarden** to enforce credential hygiene, zero-trust expiry, and breach defense across all SaaS tools.
