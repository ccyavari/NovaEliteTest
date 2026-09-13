# Nova Kai — Fantasy League Hub

A live, static website for the Nova Kai fantasy football league. Pulls standings,
matchups, transactions, and draft history directly from Sleeper's public API
(no backend, no API key needed) and displays it with Nova Kai branding.

## Files
- `index.html` — page structure
- `styles.css` — Nova Kai gold/black/red theme
- `app.js` — fetches live data from Sleeper and renders it
- `assets/nova-kai-logo.png` — your league logo

## Before you deploy
Open `app.js` and check the top of the file:

```js
const LEAGUE_ID = "1318997229251354624";
```

This is already set to your league ID. If you ever start a new league each
season (Sleeper sometimes issues a new league_id per season, linked via
`previous_league_id`), update this value.

## Run it locally
No build step needed — it's plain HTML/CSS/JS. From this folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## Push to your GitHub repo
From this folder:

```bash
git init
git add .
git commit -m "Nova Kai fantasy league hub"
git branch -M main
git remote add origin https://github.com/ccyavari/NovaElite-QuesoCorner.git
git push -u origin main
```

## Host it for free (GitHub Pages)
1. Push the code (above).
2. On GitHub, go to your repo → **Settings** → **Pages**.
3. Under "Build and deployment," set Source to **Deploy from a branch**,
   branch `main`, folder `/ (root)`.
4. Save. GitHub gives you a live URL like:
   `https://ccyavari.github.io/NovaElite-QuesoCorner/`
5. (Optional) Add a custom domain under the same Pages settings.

## Notes
- Sleeper's API is public and read-only — no login or key required.
- The player database (`/v1/players/nfl`) is a large file; the site caches it
  in the browser's `localStorage` for 24 hours so it isn't re-downloaded on
  every visit.
- Transactions and matchups are pulled live each time the page loads.
