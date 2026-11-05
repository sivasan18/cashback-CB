# Smart Cashback – Cloudflare-Native Project

A production-ready cashback loyalty management system for small Xerox, printing, and mobile recharge shops, built entirely on the **Cloudflare Ecosystem** (**Cloudflare Pages**, **Cloudflare Workers**, **Cloudflare D1**, and **Cloudflare R2**).

---

## Architecture Overview

| Category | Platform / Technology |
|---|---|
| **Source Control** | GitHub (New independent repository) |
| **Frontend Hosting** | Cloudflare Pages |
| **Frontend Framework** | React 18, Vite 6, TypeScript, Tailwind CSS |
| **Backend & APIs** | Cloudflare Workers / Pages Functions (`/functions/api/*`) |
| **Database** | Cloudflare D1 (SQLite) with atomic transactions |
| **File Storage** | Cloudflare R2 (Private object storage for backups) |
| **Authentication** | Web Crypto PBKDF2-SHA256 (100k iterations) + HMAC-SHA256 JWT |
| **Routing** | Single Page Application (SPA) with Cloudflare `_redirects` |
| **Security** | Cloudflare Security Headers, Rate Limiting, WAF |

---

## Features

- 🧾 **Default Landing Page**: Administrator login redirects directly to **New Bill** (`/billing`).
- 🟢 **2% Cashback Loyalty**: Authoritative server-side calculation for purchases $\ge$ ₹99 on net amount paid.
- 💰 **Auto Maximum Redemption**: Automatically applies maximum eligible wallet balance to reduce bill, with instant manual adjustment.
- 📱 **Strict Mobile Prefix Search**: Searches mobile numbers matching exclusively from the beginning (`LIKE 'prefix%'`), ignoring middle or end matches.
- 🖥️ **Dual Screen Customer Display**: Cross-tab/window customer synchronization on second monitor (`/customer-display`) accessible without admin credentials.
- 💳 **Dynamic UPI QR Code**: Real-time generation of UPI payment links with merchant VPA and net payable amount.
- 🛡️ **Payment Verification Safety**: Transactions and cashback are never credited for unverified, cancelled, or expired UPI payments.
- 🔒 **Server-Side Transaction Integrity**: Idempotency keys prevent duplicate bill submissions; cancellations generate reversal entries.
- 👤 **Audit-Compliant Soft Deletion**: Deleting customers with purchases anonymizes personal data (`[Deleted Customer]`, `DEL...`) while retaining financial audit records.
- 🎨 **Raspberry & Pale Sky Theme**: Supports Light, Dark, and System preference with persistence.

---

## Local Development & Setup

### 1. Prerequisites
- Node.js v18 or higher
- npm v9 or higher
- Cloudflare Wrangler CLI (`npm install -g wrangler` or via `npx wrangler`)

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(In production, Cloudflare Pages and Workers automatically handle routing and bindings)*

### 4. Build the Frontend
```bash
npm run build
```

### 5. Run Automated Tests
```bash
# Run all verification suites
npm run test:all

# Run Cloudflare Workers & D1 E2E tests
npm run test:cf
```

---

## Cloudflare Provisioning & Deployment Guide

Follow these exact steps to deploy to your Cloudflare account:

### Step 1: Log in to Cloudflare CLI
```bash
npx wrangler login
```

### Step 2: Create Cloudflare D1 Database
```bash
npx wrangler d1 create smart-cashback-db
```
*Take note of the `database_id` output by Wrangler.*

### Step 3: Update `wrangler.toml`
Open `wrangler.toml` and replace `PASTE_YOUR_D1_DATABASE_ID_HERE` with your actual `database_id`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "smart-cashback-db"
database_id = "your-actual-database-id-here"
migrations_dir = "migrations"
```

### Step 4: Create Cloudflare R2 Storage Bucket
```bash
npx wrangler r2 bucket create smart-cashback-storage
```

### Step 5: Configure Production Worker Secret
Set the secret key used for signing JWT authentication tokens:
```bash
npx wrangler secret put JWT_SECRET
```
*(When prompted, enter a secure 32+ character random secret string)*

### Step 6: Apply Database Migrations to Cloudflare D1
Execute the versioned migrations on your remote D1 database:
```bash
npx wrangler d1 migrations apply smart-cashback-db --remote
```
*(This creates all tables, foreign keys, indexes, default shop settings, service categories, and the initial administrator account)*

### Step 7: Deploy via Cloudflare Pages
1. Push this project to your **new GitHub repository**:
   ```bash
   git remote add origin https://github.com/<your-username>/<your-new-repo>.git
   git branch -M main
   git push -u origin main
   ```
2. In the **Cloudflare Dashboard**:
   - Go to **Workers & Pages** &rarr; **Create application** &rarr; **Pages** &rarr; **Connect to Git**.
   - Select your new repository.
   - Build command: `npm run build`
   - Build output directory: `dist`
3. In your Cloudflare Pages project **Settings** &rarr; **Functions**:
   - Under **D1 Database Bindings**: Add binding named `DB` linked to `smart-cashback-db`.
   - Under **R2 Bucket Bindings**: Add binding named `STORAGE` linked to `smart-cashback-storage`.
   - Under **Environment Variables**: Add `JWT_SECRET` (as an encrypted variable matching your Worker secret).

---

## Administrator Credentials

- **Initial Email**: `sivar75@gmail.com`
- **Initial Password**: Configured in seed migration `0003_seed_admin.sql`
- **Password Updates**: Administrators can securely change passwords anytime via **Settings** &rarr; **Change Password**.
