# 🛡️ Password Security System

A Universal Browser Extension (Chrome / Edge / Brave — Manifest V3) backed by **MongoDB Atlas** and the **HaveIBeenPwned k-Anonymity API** that enforces password lifecycle security on **any website** (Coursera, CUIMS, LinkedIn, TryHackMe, Postman, GitHub, etc.).

---

## 🔒 Core Features

1. **Universal Login Interception**:
   - Works on any website login page. When you enter your username and password and click **Log In**, the extension verifies your password policy before allowing the login to proceed.
2. **30-Day Password Expiry & Auto-Redirect to "Forgot Password"**:
   - If your password for a website has expired (30+ days old), the extension blocks login (`Password Not Allowed — Password Expired`), automatically scans the page for the website's **"Forgot Password"** link, and redirects you to reset your password via email/OTP.
3. **5-Day Near-Expiry Warning Banner**:
   - When your password is within 5 days of expiring, a warning banner is displayed at the top of the website:  
     `⚠️ Password Security System Warning: Your password for [Site] is going to expire in 5 days.`
4. **3-Point Verification on Every New / Rotated Password**:
   - **MongoDB Password History (No Reuse)**: Stores SHA-256 password hashes in **MongoDB Atlas** (`site_credentials` and `password_history` collections) and blocks any previously used password.
   - **Security Complexity Requirements**: Requires at least 8 characters, including an uppercase letter (`A-Z`), lowercase letter (`a-z`), number (`0-9`), and special character (`@#?!$...`).
   - **Data Breach Detection (HaveIBeenPwned API)**: Uses SHA-1 k-Anonymity (sending only the first 5 hex characters of the hash) to block any password that has appeared in known data breaches.

---

## 🚀 Running & Deploying Anywhere

### 1. Local & Cloud Backend (MongoDB Atlas)
Create a `.env` file in the root folder:
```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?appName=Cluster0
MONGODB_DB_NAME=password_security
PORT=5000
```

Start the server:
```bash
npm install
npm start
```

### 2. Cloud Deployment (Render)
Push to GitHub (`origin main`) and connect the repository on [Render](https://render.com):
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Environment Variables**: Add `MONGODB_URI` and `MONGODB_DB_NAME=password_security` in Render's Environment tab.
- Once deployed at `https://password-security-system.onrender.com`, the extension automatically syncs with the cloud backend on **any computer** where the extension is installed. Users can also download the extension `.zip` directly from `https://password-security-system.onrender.com/download-extension`.

### 3. Loading the Browser Extension on Any Computer
1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `extension/` folder (or unzip `password-security-extension.zip` and select it).

---

## 🧪 Running Automated Tests

```bash
# Run unit, MongoDB API, and live HIBP breach tests (31 tests):
npm test

# Run real Chromium browser E2E tests with screenshots:
node tests/e2e-screenshots.js
```
