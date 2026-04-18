# Beast Mode Play Assets

These assets are generated from the live Beast Mode app and are ready to use in
the Google Play listing flow.

## Generated Files

- `feature-graphic-1024x500.png`
- `phone/01-auth.png`
- `phone/02-dashboard.png`
- `phone/03-meditation.png`
- `phone/04-leaderboard.png`
- `phone/05-settings.png`
- `manifest.json`

## Regenerate

Use the Play reviewer credentials from your local secure note, then run:

```bash
cd /root/projects/BeastMode
BEASTMODE_PLAY_USERNAME=playreview2026 \
BEASTMODE_PLAY_PASSWORD='your-reviewer-password' \
python3 scripts/generate-play-assets.py
```

The script captures mobile screenshots through headless Chrome and rebuilds the
feature graphic from the generated dashboard screenshot and the app icon.
