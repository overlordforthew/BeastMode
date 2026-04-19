# Firebase / FCM Setup for BeastMode Native Push

The BeastMode Android APK uses Firebase Cloud Messaging (FCM) for native push
delivery. This is what reaches the phone when the app is closed — web-push
does not work inside Capacitor's WebView.

## One-time setup (~5 minutes)

### 1. Create a Firebase project

1. Go to <https://console.firebase.google.com> and sign in with the
   `gilbarden@gmail.com` account (or whichever you own the app under).
2. Click **Add project** → name it `BeastMode` → continue.
3. Google Analytics: optional, disable is fine for now.

### 2. Add the Android app

1. In the Firebase project dashboard, click the Android icon (or
   **Add app → Android**).
2. **Android package name**: `com.namibarden.beastmode` (exact, lowercase).
3. **App nickname**: `BeastMode` (anything).
4. **Debug signing certificate SHA-1**: leave blank (not required for FCM).
5. Click **Register app**.

### 3. Download `google-services.json`

1. Download the file Firebase generates in step 3.
2. Place it at **`/root/projects/BeastMode/android/app/google-services.json`**
   (same folder as `build.gradle`).
3. You can skip the "Add Firebase SDK" step — the Gradle plugin is already wired.
4. Skip the verification step on the Firebase page.

### 4. Create a service account key for the server

The server needs this to call the FCM Admin API.

1. In Firebase console → **Project settings** (gear icon) → **Service accounts** tab.
2. Click **Generate new private key** → **Generate key**.
3. A JSON file downloads. **Do not commit it to git.**
4. Open the file, copy the entire JSON content.

### 5. Add the service account to the server environment

BeastMode reads the key from the `FIREBASE_SERVICE_ACCOUNT_JSON` environment
variable (stringified JSON).

**Via Coolify**:

1. Open the BeastMode app in Coolify
   (UUID `ug80oocw84scswk084kcw0ok`).
2. Go to **Environment Variables**.
3. Add:
   - Name: `FIREBASE_SERVICE_ACCOUNT_JSON`
   - Value: paste the entire JSON string (single line, no surrounding quotes,
     keep inner `\n` escaped).
4. Save → **Redeploy**.

### 6. Rebuild and install the APK

Once `google-services.json` and the env var are in place:

```bash
cd /root/projects/BeastMode
BEASTMODE_VERSION_CODE=4 BEASTMODE_VERSION_NAME=1.2.0 npm run mobile:build:android:release
docker cp android/app/build/outputs/apk/release/app-release.apk \
  $(docker ps --filter "name=ug80oocw84scswk084kcw0ok" -q | head -1):/app/android/app/build/outputs/apk/release/app-release.apk
```

Then install-over from the phone at
<https://beastmode.namibarden.com/beastmode.apk>.

## What changes in the app

- **Setup screen** now has a **Notifications** section with on/off toggle,
  sound picker (system default / classic / bell / siren), and test button.
- **Onboarding** nudge toggle routes through native FCM when the APK is used,
  keeps web-push as fallback in browsers.
- **Alarm sound** is stored per user (`user_settings.alarm_sound`). Channel
  IDs are pre-created at app boot: `beastmode_default`, `beastmode_classic`,
  `beastmode_bell`, `beastmode_siren`.
- Sound files live at `android/app/src/main/res/raw/beastmode_*.wav`.

## Security notes

- `google-services.json` is **not secret** — it's fine to check into git if you
  want (or leave gitignored; Play Store listing isn't affected either way).
- **The service account key IS secret.** Never commit it to git, never paste
  it in Slack/Discord. Coolify env var is the right home.
- The service account has `firebase_messaging.admin` scope by default — that's
  sufficient and nothing more.

## If something goes wrong

- `logger.info("Firebase Admin initialized for FCM push")` shows at server
  boot when the env is set correctly.
- `/api/config` returns `{ "fcmEnabled": true }` once configured.
- If the toggle stays off after tapping "TURN ON", check Android system
  settings → Apps → Beast Mode → Notifications are enabled for the relevant
  channels.
- Capacitor log: `docker logs ug80oocw84scswk084kcw0ok-* --tail 100 | grep -i fcm`.
