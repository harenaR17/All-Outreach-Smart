# 🚀 Self-Hosted Supabase Edge Functions Deployment Guide

This guide explains how to deploy and update Supabase Edge Functions (`sender`, `reply-checker`, `thread-sync`) on a **self-hosted Supabase instance** (e.g. running on Coolify, Docker Compose, or an independent VM).

---

## 💡 How Self-Hosted Edge Functions Work

On **Supabase Cloud**, functions are bundled and uploaded through the Supabase Management API via `supabase functions deploy`.

On **Self-Hosted Supabase** (such as Coolify or standard Docker setups):
1. The `edge-runtime` container runs on your server.
2. It mounts a host directory/volume directly as its functions root (e.g. `/home/deno/functions`).
3. Whenever files in that directory change, the edge-runtime **hot-reloads** them automatically. No container restart is required.

Deploying to self-hosted Supabase simply means copying the local functions and the shared utilities (`_shared/`) into that volume on your server.

---

## 📁 Functions Structure

Your local `supabase/functions/` directory contains:
```
supabase/functions/
├── _shared/                # Shared helpers (gmail.ts, telegram.ts, gemini.ts)
├── deno.d.ts               # Deno types
├── tsconfig.json           # Deno compiler config
├── sender/                 # Campaign sending engine
│   └── index.ts
├── reply-checker/          # Inbound reply analysis & conversation monitor
│   └── index.ts
└── thread-sync/            # SmartBox thread background sync
    └── index.ts
```

> **Important:** Whenever you deploy any function, always include the `_shared/` directory so dependencies resolve properly.

---

## 🛠️ Step 1: Locate Your Server Functions Volume

You need the path to the volume on your server where functions are stored:

### For Coolify:
1. Open your Coolify dashboard and navigate to your Supabase service.
2. Note the service ID (shown in the URL or settings, e.g. `vfvwm5jab6qgbtmc4mfywqu4`).
3. The volume path on the server is typically:
   ```bash
   /data/coolify/services/<service-id>/volumes/functions
   ```

### For Standalone Docker Compose:
Check your `docker-compose.yml` under the `edge-runtime` or `functions` service. Look for the volume mount on the host:
```yaml
volumes:
  - ./volumes/functions:/home/deno/functions:Z
```

---

## 🖥️ Step 2: Configure the PowerShell Script (Windows)

We provide an automated PowerShell deployment script template at [`scripts/deploy-functions.example.ps1`](./scripts/deploy-functions.example.ps1).

1. Copy the example script:
   ```powershell
   Copy-Item .\scripts\deploy-functions.example.ps1 .\scripts\deploy-functions.ps1
   ```
2. Open `.\scripts\deploy-functions.ps1` and edit the top configuration section:
   ```powershell
   # Path to your private SSH key
   $SSH_KEY       = "C:\path\to\your-ssh-key.pem"

   # SSH user and server IP / hostname
   $SSH_HOST      = "ubuntu@YOUR_SERVER_IP"

   # Remote volume path determined in Step 1
   $REMOTE_PATH   = "/data/coolify/services/<your-service-id>/volumes/functions"
   ```

### Full Script Template (`deploy-functions.ps1`)

```powershell
param(
    [string]$Function = "all"
)

# -------------------------------------------------------------
# Configuration
# -------------------------------------------------------------
$SSH_KEY       = "C:\path\to\your-ssh-key.pem"
$SSH_HOST      = "ubuntu@YOUR_SERVER_IP"
$REMOTE_PATH   = "/data/coolify/services/<your-service-id>/volumes/functions"
$FUNCTIONS_DIR = "$PSScriptRoot\..\supabase\functions"
$SSH_OPTS      = "-o StrictHostKeyChecking=no -o ConnectTimeout=10"
# -------------------------------------------------------------

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "`n> $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  [ERR] $msg" -ForegroundColor Red }

$allFunctions = @("sender", "reply-checker", "thread-sync")

if ($Function -eq "all") {
    $targets = $allFunctions
} else {
    $targets = $Function -split "," | ForEach-Object { $_.Trim() }
    foreach ($t in $targets) {
        if ($t -notin $allFunctions) {
            Write-Fail "Unknown function: '$t'. Valid options: $($allFunctions -join ', ')"
            exit 1
        }
    }
}

Write-Host "`n+----------------------------------------------+" -ForegroundColor Magenta
Write-Host "|   Supabase Edge Functions Deployment         |" -ForegroundColor Magenta
Write-Host "+----------------------------------------------+" -ForegroundColor Magenta
Write-Host "  Target : $SSH_HOST"
Write-Host "  Deploy : $($targets -join ', ')"

# 1. Check SSH key exists
Write-Step "Checking SSH key..."
if (-not (Test-Path $SSH_KEY)) {
    Write-Fail "SSH key not found at: $SSH_KEY"
    exit 1
}
Write-Success "Key found"

# 2. Package functions into a tar archive
Write-Step "Packaging functions..."
$tarPath = "$env:TEMP\edge_functions_deploy.tar"
$includePaths = @("_shared", "deno.d.ts", "tsconfig.json") + $targets
$tarArgs = @("-cf", $tarPath, "-C", $FUNCTIONS_DIR) + $includePaths
tar @tarArgs
Write-Success "Packaged: $($includePaths -join ', ')"

# 3. Upload to server
Write-Step "Uploading to server..."
$scpCmd = "scp -i `"$SSH_KEY`" $SSH_OPTS `"$tarPath`" `"${SSH_HOST}:/tmp/edge_deploy.tar`""
Invoke-Expression $scpCmd
Write-Success "Uploaded"

# 4. Extract into persistent volume
Write-Step "Extracting into persistent volume..."
$remoteCmd = "sudo tar -xf /tmp/edge_deploy.tar -C $REMOTE_PATH && sudo rm /tmp/edge_deploy.tar"
ssh -i $SSH_KEY ($SSH_OPTS -split " ") $SSH_HOST $remoteCmd
Write-Success "Extracted to $REMOTE_PATH"

# 5. Verify deployed functions
Write-Step "Verifying..."
$remoteList = ssh -i $SSH_KEY ($SSH_OPTS -split " ") $SSH_HOST "sudo ls $REMOTE_PATH"
foreach ($fn in $targets) {
    if ($remoteList -match $fn) {
        Write-Success "$fn -- present on server"
    } else {
        Write-Fail "$fn -- NOT found! Check manually."
    }
}

Write-Host "`n+----------------------------------------------+" -ForegroundColor Green
Write-Host "|   Deployment complete!                       |" -ForegroundColor Green
Write-Host "+----------------------------------------------+" -ForegroundColor Green
Write-Host "  Functions URL: https://<your-supabase-domain>/functions/v1/<name>"
Write-Host "  Note: Edge-runtime hot-reloads automatically from the volume mount.`n"
```

---

## 🚀 Step 3: Run the Deployment

### Deploy all functions:
```powershell
.\scripts\deploy-functions.ps1
```

### Deploy a specific function:
```powershell
.\scripts\deploy-functions.ps1 -Function reply-checker
```

### Deploy multiple functions:
```powershell
.\scripts\deploy-functions.ps1 -Function "sender,reply-checker"
```

---

## 🐧 Alternative: Bash / macOS / Linux Command

If you deploy from macOS or Linux instead of PowerShell, you can run this equivalent 3-step pipeline:

```bash
# 1. Package functions
tar -cf /tmp/edge_deploy.tar -C supabase/functions _shared deno.d.ts tsconfig.json sender reply-checker thread-sync

# 2. Upload to server
scp -i /path/to/private-key.pem /tmp/edge_deploy.tar ubuntu@YOUR_SERVER_IP:/tmp/edge_deploy.tar

# 3. Extract to volume and clean up
ssh -i /path/to/private-key.pem ubuntu@YOUR_SERVER_IP \
  "sudo tar -xf /tmp/edge_deploy.tar -C /data/coolify/services/<service-id>/volumes/functions && sudo rm /tmp/edge_deploy.tar"
```

---

## ⚙️ Environment Variables on Self-Hosted Functions

Make sure the following environment variables are configured in your self-hosted Supabase environment (e.g. in your Coolify service environment variables or in `.env.functions`):

| Variable | Description |
| :--- | :--- |
| `SUPABASE_URL` | Your Supabase API URL (e.g. `http://kong:8000` or public HTTPS URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (for database mutations) |
| `CRON_SECRET` | Secret token to authenticate cron trigger calls |
| `TELEGRAM_BOT_TOKEN` | *(Optional)* Telegram bot token for instant reply notifications |

---

## 🔍 Verification & Troubleshooting

### 1. Test Calling the Function Directly
You can send a test invocation via `curl`:
```bash
curl -X POST https://<your-supabase-domain>/functions/v1/reply-checker \
  -H "Authorization: Bearer <your-service-role-key>" \
  -H "x-cron-secret: <your-cron-secret>"
```

### 2. Inspect Edge Runtime Logs
On your server, you can view the live execution logs of the container:
```bash
# Locate the container name or ID
docker ps | grep edge-runtime

# Stream container logs
docker logs -f <container-id>
```

### 3. File Permissions
If the container cannot read newly uploaded files, ensure volume permissions allow read access:
```bash
sudo chmod -R 755 /data/coolify/services/<service-id>/volumes/functions
```
