# IIS Deployment Guide — React Photo Tools

Ye steps aap **har bar deploy** ke liye follow kar sakte ho.

---

## 🎯 One-Time Setup (sirf pehli baar)

### 1. IIS Features enable

Control Panel → Programs → Turn Windows features on/off → **Internet Information Services** enable karo. Under it, enable:

- Web Management Tools → IIS Management Console
- World Wide Web Services → Application Development Features → Static Content
- World Wide Web Services → Common HTTP Features → Default Document, HTTP Errors, Static Content
- World Wide Web Services → Performance Features → Static Content Compression, Dynamic Content Compression

### 2. Install IIS modules (web.config ke rewrite/proxy rules ke liye)

Download & install ye 2 modules:

1. **URL Rewrite 2.1** — https://www.iis.net/downloads/microsoft/url-rewrite
2. **Application Request Routing 3.0** — https://www.iis.net/downloads/microsoft/application-request-routing

**ARR install ke baad proxy enable karein:**

- IIS Manager kholo
- Left pane top-level server node select karo (jaise `DESKTOP-XXX`)
- Double-click **Application Request Routing Cache**
- Right pane → **Server Proxy Settings**
- ✅ **Enable proxy** checkbox tick karo
- **Apply** click

### 3. Remove Server header globally (optional extra hardening)

Run `regedit` as admin, navigate to:
```
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\HTTP\Parameters
```
Add DWORD: `DisableServerHeader` = `1`, then `iisreset`.

---

## 🔁 Har Baar Deploy karne ke Steps

### Step 1: Build karo

Project folder mein terminal kholo:

```bash
cd E:\Project\photo\react-photo-tools
npm run build
```

`dist/` folder banega — usme sab kuch hai (HTML, JS, CSS, models, web.config).

### Step 2: Files copy karo IIS folder mein

Decide karo path — example `C:\inetpub\wwwroot\photo-tools`

**PowerShell script (fastest way):**

```powershell
# Save as deploy.ps1 in project folder, run as Administrator
$source = "E:\Project\photo\react-photo-tools\dist"
$dest = "C:\inetpub\wwwroot\photo-tools"

# Create destination if needed
if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }

# Clean old files
Remove-Item -Path "$dest\*" -Recurse -Force -ErrorAction SilentlyContinue

# Copy fresh build
Copy-Item -Path "$source\*" -Destination $dest -Recurse -Force

# Set permissions
icacls $dest /grant "IIS_IUSRS:(OI)(CI)RX" /T | Out-Null

# Recycle app pool
Import-Module WebAdministration
Restart-WebAppPool -Name "photo-tools-pool" -ErrorAction SilentlyContinue

Write-Host "✓ Deployed $source → $dest" -ForegroundColor Green
```

**Manual way (agar script nahi chalana):**
1. `dist/` folder ka content copy karo
2. `C:\inetpub\wwwroot\photo-tools` mein paste karo (overwrite)

### Step 3: Pehli baar IIS mein site banao (sirf ek baar)

1. **IIS Manager** kholo (`inetmgr` command se)
2. Left tree mein `Sites` → right-click → **Add Website**
3. Form fill karo:
   - **Site name**: `photo-tools`
   - **Physical path**: `C:\inetpub\wwwroot\photo-tools`
   - **Application pool**: create new ya default
   - **Binding**:
     - Type: `http`
     - Port: `8080` (ya `80` agar default website band hai)
     - Host name: blank ya `photos.local`
4. **OK**

### Step 4: App Pool configure (sirf ek baar)

1. IIS Manager → **Application Pools** → apna pool select karo
2. Right pane → **Basic Settings**
   - .NET CLR version: **No Managed Code** (pure static site)
3. Right pane → **Advanced Settings**
   - Start Mode: `AlwaysRunning`
   - Idle Time-out (minutes): `0` (never recycle on idle)

### Step 5: Browse karke test karo

- IIS Manager → site select → right pane → **Browse :8080 (http)**
- Ya browser mein khud navigate karo: `http://localhost:8080`
- Test karo:
  - Home page load ho raha hai?
  - `/face-match` URL direct type karke F5 — 404 nahi aana chahiye (SPA fallback kaam kar raha hai)
  - Face matcher mein model load ho raha hai? (Network tab mein `.bin` files 200)
  - AI Image Generator → Gemini select → image generate karo

---

## 🔒 HTTPS Enable Karna (production ke liye zaroori)

### Self-signed cert (local/intranet):

```powershell
# PowerShell as Admin
$cert = New-SelfSignedCertificate -DnsName "photos.local", "localhost" -CertStoreLocation "cert:\LocalMachine\My" -NotAfter (Get-Date).AddYears(5)
```

Phir IIS Manager → site → **Bindings** → Add → Type: `https`, Port: `443`, SSL cert: select the new cert → OK.

### Public domain (Let's Encrypt):

**win-acme** tool use karo: https://www.win-acme.com/
Download → `wacs.exe` run karo → IIS site select → automatic setup.

---

## 🩺 Common Issues & Fixes

| Symptom | Cause | Fix |
|---|---|---|
| **500.19** on load | URL Rewrite/ARR missing | Step 2 (one-time setup) install karo |
| **500.19 config error** mentioning `<outboundRules>` | URL Rewrite module not installed | URL Rewrite 2.1 install |
| **404** on `/face-match` direct link | SPA fallback fail | web.config missing — dist se copy hua? URL Rewrite installed? |
| **502** on AI image generate (Pollinations mode) | ARR proxy disabled | Step 2 mein "Enable proxy" check karo |
| `.bin` model files 404 | MIME missing | web.config mein mimeMap for .bin hai — check file uploaded |
| CORS error in console | Headers stripping in proxy | web.config already handles, re-copy |
| Blank white page | JS 404 ya CSP block | F12 Network tab check (DevTools block only prod, dev mein F12 works) |
| Browser cache dikh raha hai | Old bundle cached | Ctrl+F5 ya incognito. Hash file names naya bundle force karte hain |
| App pool keeps stopping | Permissions | Step 2 deploy script ka icacls line check karo |

---

## 📋 Release Checklist

Deploy karne se pehle:

- [ ] `.env.local` mein real Gemini API key daali hai
- [ ] `npm run build` successful
- [ ] `dist/web.config` exist karta hai (auto hota hai, verify karo)
- [ ] `dist/models/*.bin` exist karte hain (face matching ke liye)
- [ ] `dist/models/*.json` exist karte hain
- [ ] HTTPS binding configured hai
- [ ] IIS App Pool running hai
- [ ] Browse se home page khul raha hai
- [ ] Deep link (`/face-match`) F5 pe 404 nahi de raha

---

## ⚠️ Security Notes

**Client-side protections (already added):**
- Right-click, F12, Ctrl+Shift+I, Ctrl+U blocked (production only)
- DevTools open detection + block overlay
- Console methods neutralized
- `console.*` calls stripped at build time
- CSP headers, HSTS, Frame-deny, Referrer-policy in web.config

**But remember — client-side ≠ real security:**
- Gemini API key production bundle mein visible hai (anyone can extract)
- DevTools blocks bypassable (Ctrl+Shift+I before any JS, external debuggers, etc.)
- **Public deployment ke liye**: backend proxy banao (FastAPI/Node) jo API key server pe rakhe. Then React se sirf apne backend ko call karo.

**Intranet / trusted network deployment ke liye** ye current setup adequate hai.

---

## 🔄 Update / Redeploy Flow

1. Code change karo
2. `npm run build`
3. PowerShell deploy script chala (Step 2 ka)
4. Browser refresh (Ctrl+F5)

Done. Ye process 30 second ka hai.
