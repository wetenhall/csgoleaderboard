# Counter-Strike friends tournament dashboard

Typography uses bundled Rajdhani fonts from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/rajdhani), under the SIL Open Font License included in assets/fonts/OFL.txt. It provides a Counter-Strike-inspired style without requiring Stratum 2 font files or an external font service.

A static GitHub Pages dashboard for Duos (2 players) and Squads (5 players). Draw teams with a wheel, choose maps and 0–4 groups, run fixtures, record scores and player stats, and display standings and awards.

## Publish your own copy

1. Fork this repository, or copy its files (including .github/workflows) into a repository you own. If cloning locally, push to your own repository.
2. For a fresh tournament, replace tournament.json with tournament.example.json (copy its contents, keeping the filename tournament.json). This removes the example/copy’s players, results and branding from your new site.
3. Enable GitHub Actions if prompted. In Settings → Pages, set the source to GitHub Actions.
4. Push to your default branch, or run the Publish tournament workflow manually on that branch.
5. Open the URL shown by the Pages deployment. The build reads GITHUB_REPOSITORY and GITHUB_REF_NAME automatically, so saves target your own repository and deployed branch. Custom domains work with this workflow too.

Only the default branch deploys. No repository owner or API token needs to be placed in source code or Actions secrets.

## Connect as organiser

In Set up, follow the token instructions. Create a fine-grained token as the repository owner, select only your dashboard repository and grant Contents: Read and write. Organisation policies may require approval. A token cannot grant access your account does not already have.

Paste it into the dashboard and connect. Team setup and Options appear after connection. Remember for this tab uses session storage, scoped to the repository; disconnect clears it. Browser session restoration may retain it. Never commit tokens or include them in URLs.

## Run a tournament

- In Team setup, select Duos or Squads, pick maps and load one unique player name per line.
- Lock the player pool and spin to fill teams. Expand draw fills the browser page; Escape exits.
- Choose 0 groups for straight knockout or 1–4 balanced groups with at least two teams per group. The top two advance. Byes fill uneven brackets; with three groups, Group A and B winners receive playoff byes.
- Review team names and map assignments, then publish. Publishing a draw replaces the current tournament after confirmation.
- In Fixtures, enter rounds and optional kills/deaths/assists. Group ties count as draws; tied knockout games require a tiebreak winner. Correcting results can clear affected later results after confirmation.
- Options edits the top header and banner. Clear tournament removes tournament data while preserving headers and the organiser connection.

Saves update tournament.json through GitHub’s Contents API. Other viewers see changes after deployment and refresh. File-SHA checks reject concurrent edits: reload saved data before retrying. Published names and stats are public.

## Local development

Run node --test tournament.test.cjs and node build.cjs. Serve _site with a local static server. Local builds are read-only unless you set GITHUB_REPOSITORY to owner/repository and GITHUB_REF_NAME to the target branch before building. Never put a token in these variables.

The production bootstrap is generated from tournament.json. tournament.js is a legacy regression fixture and local fallback. Builds version asset filenames to avoid stale caches.

Standard owner.github.io/project hosting can also infer its repository from the URL when build metadata is absent, defaulting to main. Use the workflow or explicit build variables for custom domains, non-main branches or nonstandard hosting paths.
