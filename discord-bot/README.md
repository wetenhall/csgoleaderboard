# Discord registration bot

After selecting a Discord event on the site and clicking Publish teams, the bot automatically replies beneath that event's registration card with a generated team-card PNG showing the confirmed teams, players, captains and Single Game map, with a compact summary and View game button. Card height adapts to the roster size; website visuals are unchanged. It checks the repository every 30 seconds while running. Republishing changed teams updates the same reply; score changes do not create new announcements. Custom games without a Discord event are not posted. Existing teams published before this feature need publishing again from their selected event to link them.

The website stays on GitHub Pages. This Node.js bot connects to Discord using the Gateway, so no public HTTP endpoint or Interactions Endpoint URL is needed. Run one instance on an always-on computer or a Node hosting service with a persistent disk. It only requests the Guilds intent, not message-content access.

## Configure

1. In https://discord.com/developers/applications create an application. Under Bot generate a token.
2. Under Installation enable Guild Install and select bot and applications.commands. Grant View Channels, Send Messages, Embed Links, Attach Files and Read Message History. Open the installation link and add it to your server. The bot itself does not need Administrator.
3. Enable Developer Mode in Discord settings. Right-click your server and Copy Server ID. Optionally copy your organiser role ID. Server administrators always qualify; the configured role also qualifies. All publish requests check permissions on the server.
4. Copy `.env.example` to `.env` in this folder. Enter the bot token, server ID and optional role ID. Create a GitHub fine-grained token for this repository with Contents read/write. Enter it as GITHUB_TOKEN. Never commit or share either token.
5. Verify the branch and website URL. The defaults point to wetenhall/csgoleaderboard on main. The GitHub token owner must have permission to update that branch.
6. Install Node 22.12 or newer. In this folder run `npm ci`, then `npm start`. Keep the process running to handle registration. For hosting, set DATA_FILE to a file on the persistent disk and configure the environment secrets; run `node bot.cjs` when the host supplies environment variables directly.

## Use

Run `/csgame title:Friday 5v5 players:10` in your registration channel. Members click Register me to play, enter or confirm their gaming name and Submit. This first version uses a button and name form rather than a checkbox. The card lists everyone, permits name updates and withdrawal, and limits attendance to the requested capacity (2–64).

The public event card includes Publish game. It stays disabled until every place is filled and after publication. Only server administrators and the configured organiser role can publish; permission and attendance are checked again on the bot. Organisers can also use `/cspublish` to open the private publishing panel. The panel is visible only to the person who opened it, and permission is checked again when publishing. If attendance changes, reopen the panel to refresh the count. The bot writes a snapshot to discord-events.json using GitHub SHA conflict protection, locks registration and displays View tournament. Only gaming names and event metadata are published; Discord account IDs remain in the private data file. Names and rosters will be public on GitHub and the website.

After GitHub Pages deployment, connect as organiser on the site, open Team setup, Refresh Discord events, then select the event under Game selection at the top. Its players load automatically and custom player entry is hidden; choose Custom game to use your own names. Choose your format and create teams as usual. The event title becomes the tournament name/banner when you publish teams. Share the draw via Discord video; the website link shows the current tournament and stats, not a separate page per event.

The default event file is empty. No fake participants are deployed. To test, create an event for two players and register with two Discord accounts, then publish and load it on the site. A full 5v5 test requires ten registrations. The existing tournament is not replaced until the website organiser publishes teams.

Back up the private data file. Only one bot instance may access it. Published events remain in the website dropdown; pending events survive restarts on the persistent disk. This version does not include event deletion or reopening a published roster.



## FACEIT result imports

Set FACEIT_API_KEY privately in .env. FACEIT_HUB_ID defaults to the Pull up gang 1v1 queue. The bot checks the latest 100 queue entries every five minutes and publishes only completed games with available stats to faceit-games.json. This file contains match IDs, names, scores and KDA, never player Steam or FACEIT account IDs. Unchanged games do not cause commits. GitHub Pages deployment makes refreshed games available to the website.

Select FACEIT in tournament Options, or use Game platform on Fixtures for an existing tournament. Open a ready fixture, select a game, map every imported name to a fixture player and confirm the import. Name mappings are saved by provider and leaderboard name for future imports. Both full team rosters must match; duplicate use of the same game on another active fixture is rejected. Scores use FACEIT rounds won; imported KDA remains separate, including for 1v1. Corrections retain the existing protection for downstream playoff results. Leetify imports are deferred.

## Import inbox, name links, undo and Discord results

Fixtures includes an organiser-only import inbox and name-link manager. Suggestions require remembered aliases to match both complete rosters; ambiguous fixtures remain a manual choice. Used games display their active fixture or archived tournament and cannot be imported elsewhere. Name links can be changed, added or unlinked. Changing links never rewrites historical stats.

The most recent 10 result changes can be undone in order. Undo restores scores, player stats and playoff results cleared by that change. Starting a new draw clears its undo stack. Name links are managed separately and are not rolled back by result undo.

For tournaments linked to a Discord registration event, each saved fixture result gets a reply with a generated final-score card. Corrections edit that reply; undoing a result removes its card. The bot checks every 30 seconds and stores reply IDs to avoid duplicates. Custom tournaments without a linked Discord event do not announce results.

## Game-night organiser tools

Use `/csadmin` to open a private event menu. It offers FACEIT import refresh/review, sync status, substitute offers/confirmation, Sort VC, voice cleanup and recap posting. Every action checks the organiser role or Administrator permission again. Import reviews use existing name mappings, show the proposed stats and require a separate confirmation. Unfamiliar or ambiguous names can still be reviewed on the website.

Registration cards now include Join waiting list and Leave waiting list, including after publication. Published players can request withdrawal without immediately changing the roster. An organiser selects the departing player and offers the first waiting player a place; the offered player accepts within 10 minutes, then the organiser confirms. Offers mention only that waiting player. Before publication, a withdrawal offers a vacant place automatically when a queue exists. A pending vacant-place offer reserves that last registration slot. Cancel an offer to free the reservation or offer again.

Confirmed replacements update the published roster and current linked tournament atomically. Historical lineups, player names and KDA are preserved; a substitute receives a new opaque player ID and appears in future games. Substitution clears the old result-undo stack because it changes the roster. Completed tournaments cannot be substituted.

Sort VC appears under published teams and in the organiser panel. It creates channels named after the published teams inside the server’s existing `custom games` category. Repeated sorts reuse those channels and move any tracked team channels back into that category. Sorting requires exactly one category named `custom games`. Discord identities are matched privately to registered gaming names; only players already connected to voice are moved. The bot needs Manage Channels, Move Members, View Channel and Connect; GuildVoiceStates is a non-privileged intent enabled in code. Cleanup deletes only tracked empty channels and empty legacy categories created by the bot. Occupied channels and the shared `custom games` category remain.

Groups, knockout and double elimination get a single auto-updating next-fixtures card, checked every 30 seconds, with active/upcoming games, maps, qualification waits and server readiness. Single Game does not get a queue. Completed linked tournaments receive a recap with podium, final match score, match-win standings, top fragger and MVP. Corrections update the same recap; undoing completion removes it. Player mentions are disabled on automated fixture and recap updates.

## Captain voting

Use `/csadmin` → select the event → Start captain vote. Registered players use the public Vote for captain button to open a private candidate selector. Each player has one vote and can change it until the organiser closes voting. Candidates include registered players only, with paging for larger events. The top two become captains. Ties at the cutoff are resolved explicitly by an organiser, preserving candidates with more votes. Cancel captain vote clears the election and published selections. A changed registration roster invalidates old ballots.

Closing a successful vote writes only the two captain names into the published Discord event (or includes them on its first publication). Refresh/reload the event on the website, choose Captain case draft and Start team creation: the voted captains are preselected for review. Voting does not change teams that have already been published. Discord voter IDs and ballots remain in the bot's private data file.

The website captain selection section has a Start Discord vote button beside Start captain draft for a loaded Discord event. Clicking it queues an explicit request in the event file; the running bot checks within 30 seconds, including before teams are published. Selecting captain mode never opens a vote. Repeated requests preserve an already-open election and its ballots. Close and resolve the election through /csadmin, then refresh the event on the website to load the elected captains.

To cancel an event, use /csadmin, select the event, and click the red Cancel event button. A private confirmation is required and checked against the requesting organiser. Cancellation disables registration and votes, stops event sync, and removes the published event from the website selection list while preserving published tournament teams and results. Create a replacement with /csgame. Voice channels are kept; use Clean up voice channels before cancelling if required.

Website deletion now records explicit event deletion requests. The bot processes these on its 30-second sync, closes registration and voting, and deletes tracked registration, team, vote, server, fixture, recap and result messages. Failed cleanup is retried; website tournament results and voice channels are preserved. Previously removed events without a deletion request are not automatically deleted.

## Random member case opening

Run `/csroll` to pick one member uniformly from all non-bot server members, including offline members. The public reply plays a CS-style animated GIF with a scrolling rarity-colored name strip, an easing stop and a winner reveal. Names use server display names; the final reply also identifies the username. Mentions are disabled. There is a 15-second server cooldown and one animation at a time. Rendering runs in a worker so other bot commands remain responsive.

Enable **Server Members Intent** under Discord Developer Portal → your application → Bot → Privileged Gateway Intents. This command reads the full member list through paginated REST requests rather than relying on cached/online members; no member IDs are published to GitHub. No new Gateway intent or message-content access is required. The bot needs Attach Files and Embed Links in the command channel. Restart the bot to register the command.

Run /csrollchannel to use the same single-play case animation with only non-bot members in your current voice channel. Join voice before running it. The candidate list is captured when the roll starts, and both roll commands share the cooldown. This command uses the existing voice-state intent and does not require the Server Members Intent setting.


Fixtures Refresh games now requests a fresh FACEIT import through the running bot. Connect as organiser; the page waits up to 90 seconds and reads the new feed directly. FACEIT dropdowns and the import inbox show only games completed today or yesterday in Europe/London time; historical imported results are preserved.

## Countdown timer
Run /cscounter to open a duration form, or /cscounter duration:00:10:00 for a ten-minute timer. The public message displays HH:MM:SS, updating about once a second subject to Discord rate limits. One countdown can run per channel. The creator or an organiser can cancel it with Cancel timer. Timers use a saved deadline, survive restarts and finish at 00:00:00 without pinging members.

