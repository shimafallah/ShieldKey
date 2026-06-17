# ShieldKey — 2FA Authenticator

A professional Chrome extension that generates TOTP two-factor authentication codes directly from your browser toolbar. No phone needed.

## Features

- **TOTP Code Generation** — 6-digit codes with 30-second countdown ring
- **QR Code Scanning** — Scan QR codes from the current page or drag & drop / paste an image
- **Manual Entry** — Add accounts by typing the secret key, service name, and email
- **Search & Organize** — Filter accounts, drag to reorder, group by category
- **Copy on Click** — One click copies the code with visual feedback
- **Dark / Light Theme** — Toggle manually or follows system preference
- **Export / Import** — Backup and restore your vault as a JSON file

## Installation

### Chrome Web Store (Recommended)
1. Visit the [ShieldKey Chrome Web Store page](#https://chromewebstore.google.com/detail/fhpgdpegnobeeaelckegdfjpcjlmgglj)
2. Click **Add to Chrome**
3. Pin the extension from the toolbar puzzle icon

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the `chrome_auth` folder
6. Pin the extension from the toolbar puzzle icon

## How to Use

### Add Account — Manual
1. Click the **+** button
2. Enter **Service Name** (e.g. Google), **Email**, and **Secret Key**
3. Choose a category (optional)
4. Click **Save**

### Add Account — QR Code
1. Click **+** → switch to the **Scan QR** tab
2. Use one of these methods:
   - **Scan from Page** — detects QR images on the current tab
   - **Drag & Drop** — drag a screenshot of the QR code into the drop zone
   - **Paste** — take a screenshot (Ctrl+Shift+S or PrtSc), then press Ctrl+V in the extension
3. The fields will auto-fill → click **Save**

### Export Vault
Click the ⋮ menu → **Export Vault** → saves a `.json` backup file.

### Import Vault
Click the ⋮ menu → **Import Vault** → select a `.json` file.

**Import file format:**
```json
{
  "accounts": [
    {
      "issuer": "Google",
      "label": "user@gmail.com",
      "secret": "JBSWY3DPEHPK3PXP",
      "category": "email",
      "period": 30,
      "digits": 6
    }
  ]
}
```

Required fields: `issuer`, `secret`  
Optional fields: `label`, `category`, `period` (default 30), `digits` (default 6)

## QR Code Format

The extension reads standard TOTP QR codes in the `otpauth://` URI format:

```
otpauth://totp/GitHub:user@mail.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub
```

This is the same format used by Google Authenticator, Authy, and all major services.

## Project Structure

```
chrome_auth/
├── manifest.json        # Chrome Extension Manifest V3
├── popup/
│   ├── popup.html       # Extension popup UI
│   ├── popup.css        # Styles (dark + light theme)
│   └── popup.js         # Application logic
├── lib/
│   ├── totp.js          # TOTP algorithm (RFC 6238)
│   ├── qr-scanner.js    # QR code scanning utilities
│   ├── storage.js       # Chrome storage management
│   └── jsqr.min.js      # jsQR library for QR decoding
├── content/
│   └── scanner.js       # Content script for page QR scanning
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```
