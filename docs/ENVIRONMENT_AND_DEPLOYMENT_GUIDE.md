# HR Clouds Web — Environment Variables & CI/CD Deployment Guide

**Last Updated:** October 2026  
**Applies to:** Frontend Web Application (`HR-Clouds-Web`)  
**Target Audience:** Frontend Engineers, DevOps Engineers, and System Administrators  

---

## 1. Executive Summary & Architecture

The frontend uses **Vite + React**. Unlike backend services that read environment variables at runtime from process memory, Vite **inlines and replaces `import.meta.env.VITE_*` variables at compile time** (`npm run build`) directly into the minified JavaScript bundle.

### Core Architectural Principles:
1. **Zero Committed Secrets:** No `.env`, `.env.development`, or `.env.production` file containing credentials or secrets is ever committed to GitHub.
2. **Centralized Configuration:** All environment variables are consumed through a single module (`src/config/env.js`). Components and services never access `import.meta.env` directly.
3. **Dynamic CI/CD Environment Generation:** GitHub Actions runners dynamically generate the appropriate `.env` file on-the-fly using GitHub Repository Secrets before running `npm run build`.
4. **Lightweight Server Deployments:** The production/dev servers do not build code. They only host Nginx serving pre-compiled static files synced via `rsync`.

---

## 2. High-Level Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│                       LOCAL MACHINE                         │
│  .env.example ──(copy)──> .env.development (gitignored)     │
│                              │                              │
│                              ▼                              │
│                       npm run dev                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                 DEV PIPELINE (Branch: dev)                  │
│                                                             │
│  Push to `dev`                                              │
│       │                                                     │
│       ▼                                                     │
│  GitHub Action: deploy-dev-frontend.yml                     │
│       │                                                     │
│       ├─► Inject GitHub Secrets into step-level `env:`      │
│       ├─► Generate `.env.development`                       │
│       │     • VITE_API_BASE_URL = development.hrclouds.in   │
│       │     • VITE_RAZORPAY_KEY_ID = ${{ TEST_KEY }}        │
│       │                                                     │
│       ├─► npm run build -- --mode development               │
│       │                                                     │
│       └─► rsync dist/ ──► Server: /hrms-frontend-dev        │
│                           Nginx Reload                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                PROD PIPELINE (Branch: main)                 │
│                                                             │
│  Merge/Push to `main`                                       │
│       │                                                     │
│       ▼                                                     │
│  GitHub Action: deploy-main-frontend.yml                    │
│       │                                                     │
│       ├─► Inject GitHub Secrets into step-level `env:`      │
│       ├─► Generate `.env.production`                        │
│       │     • VITE_API_BASE_URL = api.hrclouds.in           │
│       │     • VITE_RAZORPAY_KEY_ID = ${{ LIVE_KEY }}        │
│       │                                                     │
│       ├─► npm run build (production mode)                   │
│       │                                                     │
│       └─► rsync dist/ ──► Server: /hrms-frontend-main       │
│                           Nginx Reload                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Environment Variables Inventory

| Variable Name | Description | Development Value | Production Value | Consuming File |
| :--- | :--- | :--- | :--- | :--- |
| **`VITE_API_BASE_URL`** | Backend API v1 gateway base URL *(trailing slashes automatically stripped)* | `https://development.hrclouds.in/api/v1` | `https://api.hrclouds.in/api/v1` | `src/shared/api/client.js` |
| **`VITE_GOOGLE_CLIENT_ID`** | Google OAuth Client ID for SSO | `503029004053-...apps.googleusercontent.com` | Same or Prod GCP Client ID | `src/App.jsx` |
| **`VITE_RAZORPAY_KEY_ID`** | Razorpay Public Key for plan subscriptions | `rzp_test_...` *(Test transactions)* | `rzp_live_...` *(Real payments)* | `src/auth/pages/RegisterOrgPage.jsx` |
| **`VITE_DOCMIND_API_KEY`** | Chatbot API Key for Maya AI assistant | `pk_live_...` | `pk_live_...` | `src/shared/hooks/useDocMindChat.js` |
| **`VITE_DOCMIND_API_URL`** | Chatbot backend URL *(Optional)* | Default: `https://api.codewithrishi.fun/api/public` | Default: `https://api.codewithrishi.fun/api/public` | `src/shared/hooks/useDocMindChat.js` |

---

## 4. Central Configuration Layer (`src/config/env.js`)

All environment access is centralized in `src/config/env.js`.

### Key Features & Safeguards:
1. **Static AST Analysis:** Uses static property references (`import.meta.env.VITE_*`) instead of dynamic dictionary access (`import.meta.env[key]`) so Vite's Rollup compiler can accurately inline strings.
2. **Whitespace & Empty String Sanitization:** Unset GitHub Secrets write `KEY=`. The helper functions treat empty or whitespace-only strings as unset, triggering defaults and fallbacks instead of crashing.
3. **Automatic URL Normalization:** Automatically strips trailing slashes via `.replace(/\/+$/, '')` to prevent double slashes (e.g. `//auth/login`) or broken routes.
4. **Defensive Runtime Warnings:** In production, if critical keys (like Razorpay or Google Client ID) are missing, diagnostic warnings are logged to the browser console.

### How to use in components:
```javascript
// ✅ Correct
import { ENV } from "@/config/env"; // or "../../config/env"
const apiUrl = ENV.API_BASE_URL;

// ❌ Incorrect (Do not access import.meta.env directly)
const apiUrl = import.meta.env.VITE_API_BASE_URL;
```

---

## 5. Local Development Setup

When working locally, developers do not need to configure GitHub Secrets.

1. **Copy the example template:**
   ```bash
   cp .env.example .env.development
   ```
2. **Run Vite development server:**
   ```bash
   npm run dev
   ```
   Vite automatically selects `.env.development` when running in dev mode.
3. **Git Protection:**
   `.gitignore` is configured to prevent `.env` and `.env.*` from ever being staged or committed (except `.env.example`).

---

## 6. GitHub Actions Deployment Pipelines

Both workflows are located in `.github/workflows/`.

### 6.1 Development Workflow (`deploy-dev-frontend.yml`)
- **Trigger:** Automatic on `push` to the `dev` branch.
- **Runner:** `ubuntu-latest`
- **Node Version:** `20` with `cache: 'npm'`
- **Steps:**
  1. `actions/checkout@v4`
  2. `npm ci` (fast, clean, reproducible dependency installation)
  3. **Generate `.env.development`:**
     Maps GitHub repository secrets into step-level environment variables, then writes `.env.development` using a bash heredoc.
  4. **Compile:** Runs `npm run build -- --mode development`.
  5. **Deploy:** Uses native SSH and `rsync -avz --delete` to sync `dist/` to `/home/$SERVER_USER/hrms-frontend-dev`.
  6. **Permissions & Reload:** Runs `chmod -R 755` on the web root and executes `sudo systemctl reload nginx`.

### 6.2 Production Workflow (`deploy-main-frontend.yml`)
- **Trigger:** Automatic on `push` or PR merge to the `main` branch.
- **Runner:** `ubuntu-latest`
- **Node Version:** `20` with `cache: 'npm'`
- **Steps:**
  1. `actions/checkout@v4`
  2. `npm ci`
  3. **Generate `.env.production`:**
     Injects `https://api.hrclouds.in/api/v1` and the live Razorpay secret `${{ secrets.VITE_RAZORPAY_KEY_ID_LIVE }}` into `.env.production`.
  4. **Compile:** Runs `npm run build` (Vite's default production build).
  5. **Deploy:** Uses native SSH and `rsync -avz --delete` to sync `dist/` to `/home/$SERVER_USER/hrms-frontend-main`.
  6. **Permissions & Reload:** Runs `chmod -R 755` and reloads Nginx.

---

## 7. Required GitHub Repository Secrets

Configure these in **GitHub Repository → Settings → Secrets and variables → Actions**:

| Secret Key | Description | Environment | Example Value |
| :--- | :--- | :--- | :--- |
| `SERVER_IP` | Public IP of the deployment EC2 / VPS server | Both | `13.204.xxx.xxx` |
| `SERVER_USER` | Linux SSH username on the server | Both | `ubuntu` |
| `SSH_PRIVATE_KEY` | OpenSSH private key with authorized server access | Both | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID | Both | `503029004053-...apps.googleusercontent.com` |
| `VITE_DOCMIND_API_KEY` | Chatbot API Key | Both | `pk_live_...` |
| `VITE_DOCMIND_API_URL` | Custom Chatbot Endpoint *(Optional)* | Both | `https://api.codewithrishi.fun/api/public` |
| `VITE_RAZORPAY_KEY_ID_TEST`| Razorpay Test Mode Key | **Dev** | `rzp_test_THx4QiTxpST25G` |
| `VITE_RAZORPAY_KEY_ID_LIVE`| Razorpay Live Mode Key | **Prod** | `rzp_live_xxxxxxxxxxxxxx` |

---

## 8. Release Process: Promoting from `dev` to `main`

Because environment variables and build targets are fully decoupled from the source code, merging to production requires **zero code modifications**:

1. Test your features thoroughly on the `dev` branch.
2. Confirm the dev build deployed successfully to `https://development.hrclouds.in`.
3. Open a Pull Request from `dev` into `main`.
4. Review the PR:
   - Ensure no `.env*` files or `dist/` artifacts are included in the diff.
5. Merge the PR into `main`.
6. GitHub Actions triggers `deploy-main-frontend.yml`, generates `.env.production` using live secrets, builds `dist/`, and updates the production Nginx web root.

---

## 9. Troubleshooting & FAQ

#### Q: The build failed with `Missing build-time config` or invalid Razorpay key.
**A:** Check GitHub Actions Secrets. Ensure `VITE_RAZORPAY_KEY_ID_TEST` (for dev) or `VITE_RAZORPAY_KEY_ID_LIVE` (for prod) is present and has no leading/trailing spaces.

#### Q: Nginx returns 404 or 403 after deployment.
**A:** The workflow automatically runs:
```bash
chmod +x /home/$SERVER_USER
chmod -R 755 /home/$SERVER_USER/hrms-frontend-[dev|main]
sudo systemctl reload nginx
```
If permission issues persist, verify that the Nginx user (`www-data` or `nginx`) has read access to the web root.

#### Q: How do I test the production build locally?
**A:** Create a local `.env.production` file (which is gitignored) and run:
```bash
npm run build
npx vite preview
```
This serves the compiled production build locally for verification.
