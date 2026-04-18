# Beast Mode Play Console Notes

Last updated: April 18, 2026

## Core App Details

- App name: `Beast Mode`
- Package name: `com.namibarden.beastmode`
- Category: `Health & Fitness`
- Default website: `https://beastmode.namibarden.com`
- Support URL: `https://beastmode.namibarden.com/support`
- Privacy policy URL: `https://beastmode.namibarden.com/privacy`
- Account deletion URL: `https://beastmode.namibarden.com/delete-account`
- Contact email: `overlord.gil.ai@gmail.com`

## Store Listing Copy

### Short description

Micro-workouts and meditation resets that keep your streak alive.

### Full description

Beast Mode is a fast daily reset app built for people who do better with momentum than with guilt.

Use short movement breaks and guided meditation sessions to stay sharp, protect your streak, and stack real progress without blowing up your day.

What Beast Mode does:

- Launch 2-minute movement resets when your energy dips
- Track streaks, points, missions, and awards
- Mix micro-workouts with meditation sessions
- Add accountability with rivals, buddies, and lightweight team pressure
- Enable nudges so Beast Mode can pull you back in at the right moment

Built for:

- desk workers
- remote teams
- creators
- founders
- anyone who wants consistency without a giant fitness plan

Beast Mode is not a full gym-programming app. It is a daily movement and focus system designed to help you actually show up.

## Review And Compliance Notes

- Login is required to use the app.
- Account creation is available in-app.
- Account deletion is available in-app under Settings -> Danger Zone.
- Outside-the-app deletion instructions are available at the public deletion URL above.
- No ads.
- No in-app purchases.
- No health-device integrations.

## Data Safety Draft

Likely collected:

- Personal info: username, optional email
- App activity: workouts, meditation sessions, streak and leaderboard activity
- Device or app identifiers: push subscription endpoint when nudges are enabled

Likely declarations:

- Data is collected to provide core app functionality, account management, and optional notifications.
- Data is not sold.
- Data is not shared for advertising.
- Users can request deletion in-app and outside the app.

Validate these declarations against the live app behavior before final submission.

## Release Assets

- Signed APK: `android/app/build/outputs/apk/release/app-release.apk`
- Signed AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- Upload certificate fingerprints are generated locally by the Android signing setup.
- Current internal-test release target: version code `2`, version name `1.0.1`
- Play listing assets live under `docs/play-assets/`
- Feature graphic: `docs/play-assets/feature-graphic-1024x500.png`
- Phone screenshots: `docs/play-assets/phone/*.png`

## Submission Checklist

1. Upload the signed `.aab` to the internal testing track first.
2. Add the support, privacy, and deletion URLs above.
3. Complete App Access with reviewer credentials created specifically for Play review.
4. Complete Data Safety and Content Rating.
5. Upload the generated feature graphic and at least 2-4 phone screenshots from `docs/play-assets/phone/`.
6. After internal review passes, promote to closed or production.

## Exact Upload Sequence

1. In Play Console, create or open the `Beast Mode` app under package `com.namibarden.beastmode`.
2. Go to `Testing -> Internal testing` and create a release.
3. Upload `android/app/build/outputs/bundle/release/app-release.aab`.
4. Set the support, privacy, and deletion URLs from the top of this doc.
5. In `App access`, use the dedicated reviewer account created outside git for Play review.
6. In `Store listing`, use the short/full description above plus the assets in `docs/play-assets/`.
7. Finish `Data safety`, `Content rating`, and `Target audience`.
8. Submit to internal testing first, then install from the Play review link before promoting any wider track.
