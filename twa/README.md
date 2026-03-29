# StormTracker Android APK (TWA)

Build a native Android APK from the StormTracker PWA using a Trusted Web Activity (TWA). No native Android code required — it wraps the existing web app in a lightweight Android shell.

## Prerequisites

- **Node.js** v18+ — [nodejs.org](https://nodejs.org)
- **Java JDK** 17 — [adoptium.net](https://adoptium.net)
- **Android SDK** — Install via [Android Studio](https://developer.android.com/studio) or standalone command-line tools
  - Required SDK components: `build-tools;34.0.0`, `platforms;android-34`
  - Set `ANDROID_HOME` environment variable to your SDK path

## Step 1: Install Bubblewrap

```bash
npm install -g @nicolo-ribaudo/bubblewrap
```

Verify:
```bash
bubblewrap --version
```

## Step 2: Initialize the TWA Project

From this `twa/` directory:

```bash
bubblewrap init --manifest="https://capflyingfun.github.io/StormTracker/manifest.json"
```

Bubblewrap will prompt for settings. The defaults from `twa-manifest.json` should work. Accept the defaults or customize as needed.

When prompted for a signing key:
- **First time**: Choose "Create a new signing key" and remember the passwords
- **Subsequent builds**: Use the same keystore file and passwords

## Step 3: Build the APK

```bash
bubblewrap build
```

This produces two files:
- `app-release-signed.apk` — Signed APK ready for sideloading
- `app-release-bundle.aab` — Android App Bundle for Play Store upload

If the build produces an unsigned APK (`app-release-unsigned.apk`), sign it manually:

```bash
# Create a keystore (first time only)
keytool -genkey -v -keystore stormtracker-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias stormtracker

# Sign the APK
apksigner sign --ks stormtracker-keystore.jks --ks-key-alias stormtracker app-release-unsigned.apk
```

## Step 4: Sideload to Your Device

### Option A: Via ADB (USB)

1. Enable **Developer Options** on your Android device (tap Build Number 7 times in Settings > About Phone)
2. Enable **USB Debugging** in Developer Options
3. Connect your phone via USB

```bash
adb install app-release-signed.apk
```

### Option B: Direct Transfer

1. Copy `app-release-signed.apk` to your phone (email, cloud drive, USB transfer)
2. Open the file on your phone
3. Allow installation from unknown sources when prompted

## Step 5: Set Up Digital Asset Links (Optional — for Play Store)

For the TWA to run in full-screen (no browser bar), you need Digital Asset Links verification:

1. Get your signing key's SHA-256 fingerprint:
```bash
keytool -list -v -keystore stormtracker-keystore.jks -alias stormtracker
```

2. Copy the SHA-256 fingerprint (looks like `AB:CD:EF:12:...`)

3. Edit `docs/.well-known/assetlinks.json` — replace `YOUR_SHA256_FINGERPRINT_HERE` with your actual fingerprint. The format is colon-separated uppercase hex pairs, e.g.:
   ```
   "sha256_cert_fingerprints": ["AB:CD:EF:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A"]
   ```

4. Commit and push to GitHub so it's served at:
   `https://capflyingfun.github.io/StormTracker/.well-known/assetlinks.json`

5. Verify it works:
```bash
curl https://capflyingfun.github.io/StormTracker/.well-known/assetlinks.json
```

## Step 6: Publish to Google Play (Optional)

1. Create a [Google Play Developer account](https://play.google.com/console/) ($25 one-time fee)
2. Create a new app in Play Console
3. Upload the `.aab` file (Android App Bundle) — NOT the `.apk`
4. Fill in the store listing (screenshots, description, etc.)
5. Complete the content rating questionnaire
6. Set pricing (Free)
7. Submit for review

## Updating the App

When you update StormTracker:
1. Increment `appVersionCode` and `appVersionName` in `twa-manifest.json`
2. Run `bubblewrap build` again
3. Upload the new `.aab` to Play Console (if published)

Sideloaded users get the new web content automatically (it loads from the live website), but a new APK is needed for Play Store updates.

## Troubleshooting

**Browser bar showing instead of fullscreen?**
- Digital Asset Links not set up — follow Step 5 above
- Chrome cache — clear Chrome data and reopen the app

**App crashes on launch?**
- Ensure Chrome is installed and updated on the device
- TWA requires Chrome 72+ (most devices have this)

**"App not installed" error?**
- Enable "Install from unknown sources" in device settings
- Ensure no conflicting version is already installed: `adb uninstall com.stormtracker.app`

## Architecture

```
StormTracker PWA (GitHub Pages)
        ↓
  TWA Android Shell (this APK)
        ↓
  Chrome Custom Tab (fullscreen, no browser UI)
        ↓
  User sees native-feeling app
```

The APK is just a thin wrapper. All app logic, updates, and data come from the live PWA at `capflyingfun.github.io/StormTracker/`.
