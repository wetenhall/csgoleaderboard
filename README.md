# Friends Cup

A single-page Counter-Strike tournament: two groups of four, round-robin group matches, cross-group semi-finals (A1 vs B2, B1 vs A2), and a final. Fifteen matches total. No dependencies, accounts, database, or build step. Open `index.html` locally.

## Updates through Codex

Give Codex team names or results, for example: “Team 01 beat Team 02, 13–9 in A1. Update the tournament and push.” Edit `tournament.js`; standings and progression calculate automatically. Team names are placeholders until provided.

Keep team IDs stable when renaming teams. To record a completed match, replace its `result: null` with:

```js
result: { teams: ['t1', 't2'], scores: [13, 9] }
```

Participant order must match the fixture. Scores are final rounds won in a single-map match, including overtime. Draws are not accepted. Group ranking is wins, then round difference. After all six group matches, top two qualify. If teams remain tied for either qualifying position, decide a tiebreak, then list the tied team IDs in finishing order in that group's `tiebreakOrder` array. It only breaks equal wins and round difference; it never overrides them.

For playoffs, record the actual advancing participant IDs with the result. If an earlier correction changes playoff participants, clear affected later results before entering replacements. Invalid or stale results prevent publishing via the data check.

## GitHub Pages

Repository: https://github.com/wetenhall/csgoleaderboard

In repository **Settings → Pages**, choose **GitHub Actions** as the source. The included workflow validates tournament results and deploys the static page on pushes to `main`. Run the workflow manually after enabling Pages if needed.

## Validation

Run `node --test tournament.test.cjs` before publishing results. The tests cover group standings, cross-group seeding, ties, result validation and progression to a champion.
