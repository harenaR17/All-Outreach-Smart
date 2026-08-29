# 🚀 Outreach Smart — Complete Deployment & Setup Guide

This guide takes you from a freshly cloned GitHub repository and a Cloudflare account all the way to a fully operational, automated cold outreach system.

---

## 📋 Table of Contents
1. [Prerequisites](#-prerequisites)
2. [Phase 1: Clone & Local Preparation](#-phase-1-clone--local-preparation)
3. [Phase 2: Deploy to Cloudflare Workers](#-phase-2-deploy-to-cloudflare-workers)
4. [Phase 3: Running the Interactive Setup Wizard (Steps 1–5)](#-phase-3-running-the-interactive-setup-wizard-steps-15)
5. [Phase 4: Configure Cloudflare Worker Environment Variables](#-phase-4-configure-cloudflare-worker-environment-variables)
6. [Phase 5: Connecting Sending Inboxes (Google Workspace Service Account)](#-phase-5-connecting-sending-inboxes-google-workspace-service-account)
7. [Phase 6: First Outreach Campaign Walkthrough](#-phase-6-first-outreach-campaign-walkthrough)
8. [🛠️ Troubleshooting & Verification](#️-troubleshooting--verification)

---

## 🧰 Prerequisites

Before starting, ensure you have:
- **Node.js**: v20.x or higher installed.
- **Git**: Installed and configured.
- **Cloudflare Account**: [Sign up for free](https://dash.cloudflare.com/sign-up) (Workers plan).
- **Supabase Account**: [Sign up for free](https://supabase.com) (Create a new project).
- **Google Cloud & Google Workspace**:
  - A Google Cloud Platform (GCP) project with the **Gmail API** enabled.
  - Super Admin access to your **Google Workspace Admin Console** for the sending domains.
- **Google Gemini API Key**: [Get a free API key from Google AI Studio](https://aistudio.google.com/) (Used for AI lead analysis, reply classification, and personalization).
- *(Optional)* **Telegram Bot Token**: Created via [@BotFather](https://t.me/botfather) for instant mobile reply notifications.

---

## 📦 Phase 1: Clone & Local Preparation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/All-Outreach-Smart.git
   cd All-Outreach-Smart
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

3. **Check `wrangler.jsonc`:**
   Ensure the worker name matches your desired name (default is `all-outreach-smart`):
   ```jsonc
   {
     "$schema": "node_modules/wrangler/config-schema.json",
     "name": "all-outreach-smart",
     "main": ".open-next/worker.js",
     "compatibility_date": "2026-08-26",
     "compatibility_flags": ["nodejs_compat"],
     "assets": {
       "directory": ".open-next/assets",
       "binding": "ASSETS"
     },
     "keep_vars": true,
     "observability": {
       "enabled": true
     }
   }
   ```

---

## ☁️ Phase 2: Deploy to Cloudflare Workers

1. **Authenticate Wrangler with Cloudflare:**
   ```bash
   npx wrangler login
   ```
   *A browser window will open asking you to authorize Wrangler with your Cloudflare account.*

2. **Build and Deploy:**
   ```bash
   npm run deploy
   ```
   *This command uses `@opennextjs/cloudflare` to build your Next.js application into Cloudflare Worker bundle assets and pushes it to Cloudflare.*

3. **Copy your Worker URL:**
   At the end of deployment, Wrangler will output your live URL:
   ```text
   Uploaded all-outreach-smart (...)
   Deployment complete!
   https://all-outreach-smart.<your-subdomain>.workers.dev
   ```

---

## 🧙 Phase 3: Running the Interactive Setup Wizard (Steps 1–5)

Open your deployed worker URL in your browser:
👉 `https://all-outreach-smart.<your-subdomain>.workers.dev/setup`

Follow the 5 setup steps:

### Step 1: Connect Supabase
- In your [Supabase Dashboard](https://supabase.com/dashboard) -> Project Settings -> **API**:
  - **Project URL**: `https://<project-ref>.supabase.co`
  - **Anon Key (`anon` / `public`)**: Copy the public key.
  - **Service Role Key (`service_role` / `secret`)**: Copy the service role key.
- *(Optional)* **Supabase Personal Access Token**: (Found in Supabase Account Settings -> Access Tokens). Used to automatically deploy Edge Functions and manage secrets.
- Click **Validate & Next**.

### Step 2: Database Schema & Migrations
- Click **Run Database Migrations**.
- The wizard executes the migration scripts to create tables:
  - `email_accounts`, `campaigns`, `campaign_steps`, `campaign_email_accounts`, `leads`, `lead_imports`, `campaign_leads`, `sends`, `replies`, `gemini_api_keys`, `api_keys`, `telegram_notify_recipients`.
- Click **Next** once all checks turn green.

### Step 3: Create Admin Account
- Set your Admin **Email** and secure **Password**.
- Click **Create Admin Account**.

### Step 4: AI & Notification Integrations
- **Gemini API Key**: Paste your Google AI Studio API key.
- *(Optional)* **Telegram Bot Token** & **Chat ID**: For real-time notifications when a prospect replies.
- Click **Save & Continue**.

### Step 5: Edge Functions & Cron Jobs
- The wizard generates a secure **`CRON_SECRET`** and configures Supabase Edge Functions (`sender` and `reply-checker`).
- Click **Finish Setup**.
- **Important**: Copy down the `CRON_SECRET` displayed on the completion screen.

---

## 🔑 Phase 4: Configure Cloudflare Worker Environment Variables

Because Cloudflare Worker filesystems are read-only in production, server-side cron webhooks and new browser sessions authenticate via Cloudflare's Environment Variables.

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com).
2. Navigate to **Workers & Pages** → Select **`all-outreach-smart`**.
3. Click on **Settings** → **Variables and Secrets**.
4. Add the following variables:

| Variable Name | Type | Value / Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Plain text | Your Supabase Project URL (`https://xyz.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Plain text | Your Supabase `anon` public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Your Supabase `service_role` secret key |
| `CRON_SECRET` | Secret / Plain text | The secret generated in Step 5 (e.g., `68038377c57488...`) |
| `SETUP_COMPLETED` | Plain text | `true` |

5. Click **Deploy / Save Changes**.

---

## 📬 Phase 5: Connecting Sending Inboxes (Google Workspace Service Account)

Outreach Smart uses **Google Service Accounts with Domain-Wide Delegation** (direct Gmail API) instead of fragile SMTP/IMAP passwords or interactive OAuth redirects. This provides maximum deliverability, rock-solid stability, and native thread preservation.

You can connect unlimited mailboxes across any Google Workspace domain you administer using a single service account.

### Step A: Google Cloud Console Setup (One-time)
1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a project (e.g. `outreach-smart-mailer`).
2. **Enable the Gmail API**:
   - Navigate to **APIs & Services** → **Library**.
   - Search for **Gmail API** and click **Enable**.
3. **Create the Service Account**:
   - Go to **IAM & Admin** → **Service Accounts** → Click **Create Service Account**.
   - Name: `outreach-sender` (e.g. `outreach-sender@<project>.iam.gserviceaccount.com`).
   - Click **Create and Continue**, then click **Done**.
4. **Generate JSON Key**:
   - Click on your newly created Service Account → Go to the **Keys** tab.
   - Click **Add Key** → **Create new key** → Select **JSON** → Click **Create**.
   - Save the downloaded `.json` file securely on your computer.
5. **Enable Domain-Wide Delegation & Get Client ID**:
   - In the Service Account details, click **Edit** (or the **Details** tab).
   - Expand **Advanced settings** and check **Enable Google Workspace Domain-wide Delegation**.
   - Note the **OAuth 2 Client ID** (a 21-digit numeric ID, e.g. `109283746519283746519`).

---

### Step B: Google Workspace Admin Console Setup (Per Domain)
For **each domain** you want to send emails from:

1. Log in to [Google Workspace Admin Console](https://admin.google.com) as a Super Admin.
2. Navigate to **Security** → **Access and data control** → **API controls**.
3. Scroll down and click **Manage Domain-Wide Delegation**.
4. Click **Add new**:
   - **Client ID**: Paste the 21-digit numeric Client ID from Step A.5.
   - **OAuth Scopes (comma-separated)**: Paste the exact scopes:
     ```text
     https://www.googleapis.com/auth/gmail.send, https://www.googleapis.com/auth/gmail.readonly, https://www.googleapis.com/auth/gmail.modify
     ```
5. Click **Authorize**.

> [!TIP]
> You can reuse the exact same Service Account JSON key across multiple Workspace domains. You only need to repeat Step B in the Admin Console of each domain.

---

### Step C: Add the Inbox in Outreach Smart Dashboard
1. Open the dashboard and navigate to **Inboxes** → Click **+ Add Inbox**.
2. Fill in the inbox connection form:
   - **Mailbox Email Address**: The actual Workspace mailbox email (e.g. `alex@yourdomain.com`).
   - **Display Name**: The sender name displayed to recipients (e.g. `Alex Doe`).
   - **Service Account Client Email**: Found in your JSON key file (`client_email`).
   - **Private Key**: The entire `private_key` from your JSON key file (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`).
   - **Daily Send Limit**: Maximum emails this inbox will send per day (Default: `30`, resets at UTC midnight).
   - **Minimum Spacing Between Sends**: Minimum delay in seconds before this inbox sends another email (Default: `180` seconds / 3 minutes).
3. Click **Connect & Verify Inbox**.

#### 🔍 Automatic Verification Checks:
When you click submit, Outreach Smart automatically executes two live checks:
1. **Gmail Read Profile Check**: Tests domain delegation and reads the mailbox profile.
2. **Self-Test Send**: Sends a silent confirmation email to the inbox itself to guarantee sending capability.

Once verified, the inbox is marked **Active** and ready for outreach!

---

### ⚙️ Per-Inbox Sending & Fairness Rules
- **Hard Daily Limits**: Once an inbox hits its limit (e.g. 30/day), it automatically rests until the next UTC day. No exceptions or rerouting.
- **Per-Inbox Cooldown**: Consecutive sends from the same inbox respect the `min_seconds_between_sends` setting (e.g. 3 minutes).
- **Equal Distribution for New Leads**: When starting a sequence with a new lead, the sender function picks the eligible inbox that has gone longest without starting a new lead (`last_new_lead_sent_at`).
- **Thread Continuity for Follow-ups**: Follow-up steps always stay on the *original inbox* that sent Step 1 to preserve the Gmail thread conversation.

---

## 🎯 Phase 6: First Outreach Campaign Walkthrough

Navigate to your dashboard: `https://all-outreach-smart.<your-subdomain>.workers.dev`.

### 1. Import Leads
1. Go to **Leads** → Click **Import CSV / Excel**.
2. Upload your spreadsheet with lead details (`email`, `first_name`, `last_name`, `company`, `website`, etc.).
3. Map your spreadsheet columns to lead variables.
4. Duplicates are automatically detected and skipped based on email address.

### 2. Create an Outreach Campaign
1. Go to **Campaigns** → Click **+ Create Campaign**.
2. **Campaign Settings**:
   - Assign an **Inbox Pool** (select one or multiple verified inboxes for automatic load rotation).
   - Set **Schedule & Timezone** (e.g. Mon–Fri, 9:00 AM – 5:00 PM in prospect timezone).
3. **Build Sequence Steps**:
   - **Step 1 (Initial Email)**: Write subject and body using template variables (`{{first_name}}`, `{{company}}`).
   - **Step 2 (Follow-up)**: Add a 3-day delay. Follow-ups automatically send as a reply in the same Gmail thread (`In-Reply-To` / `References`).
   - **Step 3 (Final Breakup)**: Add a 4-day delay.
4. **Attach Leads**: Select the leads to enroll into this campaign.
5. Click **Launch Campaign**.

### 3. Automated Execution & Smart Reply Detection
- **Automated Sender (`/api/cron/sender`)**: Runs every ~1 minute, checking campaign working windows, inbox daily limits, and minimum spacing.
- **Automated Reply Checker (`/api/cron/reply-checker`)**: Polls Gmail threads every 30 minutes:
  - **Bounces**: Marks lead as bounced globally.
  - **Auto-replies / Out of Office**: Logged without interrupting the campaign sequence.
  - **Real Replies**: Automatically stops future sequence emails for that lead, triggers Gemini AI to classify sentiment (*interested*, *not_interested*, *out_of_office*, *wrong_person*), and dispatches instant Telegram alerts to registered team members.

---

## 🛠️ Troubleshooting & Verification

### 1. Verification of Cron Endpoints
You can manually test your cron routes using `curl`:
```bash
curl -X POST https://all-outreach-smart.<your-subdomain>.workers.dev/api/cron/sender \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```
**Expected Response:** `{"success":true,"processed":...}`

### 2. Check Worker Logs in Real Time
```bash
npx wrangler tail
```
This streams real-time HTTP requests, errors, and execution logs from your Cloudflare Worker.

### 3. Common Inbox Verification Errors & Fixes
- **`GMAIL_DELEGATION_NOT_CONFIGURED` / `unauthorized_client`**: The numeric Client ID has not been added to Domain-Wide Delegation in the Google Workspace Admin Console, or the scopes have a typo.
- **`GMAIL_USER_NOT_FOUND`**: The mailbox address entered does not exist in your Google Workspace organization.
- **`INVALID_PRIVATE_KEY`**: Ensure the entire private key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` with line breaks is pasted.

### 4. Updating the Application
Whenever you make updates or pull new features:
```bash
git pull origin main
npm install
npm run deploy
```
*Cloudflare Workers uses zero-downtime rolling deployments.*
