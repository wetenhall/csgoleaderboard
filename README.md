# Friends Cup

GitHub Pages tournament manager: eight teams, two round-robin groups, cross-group semi-finals and a final. Supports two-player teams (16 players) and five-player teams (40 players).

## Run a tournament from the website

1. Open Organiser tools. Connect using a GitHub fine-grained personal access token owned by an account with write access to `wetenhall/csgoleaderboard`, restricted to this repository with **Contents: Read and write**. The token is kept only in tab memory; disconnect or close the tab to clear it. Never commit it or send it in chat.
2. Open Create a new tournament. Enter one unique player name per line, load the pool, choose team size, and tick exactly 16 or 40 players.
3. Lock the pool and spin once per player. Selected players are removed from the pool. Teams fill sequentially; once complete, teams are shuffled into two groups of four. Team names can then be edited.
4. Publish teams & groups. This replaces the current tournament and its results after confirmation.
5. Follow Match order: alternating group games, semi-finals, final. Open a game and enter both round scores. Optionally enter kills, deaths and assists for each player. Click Update & publish result.

Scores cannot be tied. Player stats must be all three values or all blank per player. Player totals include only games with recorded individual stats. Correcting an earlier result replaces its stats; if playoff opponents change, the site asks before clearing affected playoff results. Unresolved qualification ties expose a finishing-order form.

`Update` commits `tournament.json` to the main branch using GitHub's Contents API. It does not upload credentials. The organiser sees the new state immediately after GitHub confirms the save; other viewers see it after Pages deploys and they reload. Concurrent changes are rejected using the file SHA. Reload latest saved tournament before retrying a conflicting edit. Failed saves retain form entries. A new draw remains unpublished until confirmed; refreshing during a draw loses it.

## Data and deployment

`tournament.json` is the canonical shared data file. `tournament.js` is the original blank tournament fixture for regression tests and local fallback; production builds generate the bootstrap from JSON. Do not edit the fixture to update live results.

Run `node --test tournament.test.cjs` and `node build.cjs`. The build produces content-versioned assets in `_site/`. The Pages workflow validates and deploys on every main-branch push, including in-site result updates. GitHub Settings → Pages uses GitHub Actions.

Public site: https://wetenhall.github.io/csgoleaderboard/

GitHub tokens need only Contents access; no Actions or Workflows write permission is required to update tournament data. GitHub branch protection or token policies may independently restrict direct updates. All published player names and stats are public.
