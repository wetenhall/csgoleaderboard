# Discord registration bot

The website stays on GitHub Pages. This Node.js bot connects to Discord using the Gateway, so no public HTTP endpoint or Interactions Endpoint URL is needed. Run one instance on an always-on computer or a Node hosting service with a persistent disk. It only requests the Guilds intent, not message-content access.

## Configure

1. In https://discord.com/developers/applications create an application. Under Bot generate a token.
2. Under Installation enable Guild Install and select bot and applications.commands. Grant View Channels, Send Messages, Embed Links and Read Message History. Open the installation link and add it to your server. The bot itself does not need Administrator.
3. Enable Developer Mode in Discord settings. Right-click your server and Copy Server ID. Optionally copy your organiser role ID. Server administrators always qualify; the configured role also qualifies. All publish requests check permissions on the server.
4. Copy `.env.example` to `.env` in this folder. Enter the bot token, server ID and optional role ID. Create a GitHub fine-grained token for this repository with Contents read/write. Enter it as GITHUB_TOKEN. Never commit or share either token.
5. Verify the branch and website URL. The defaults point to wetenhall/csgoleaderboard on main. The GitHub token owner must have permission to update that branch.
6. Install Node 22.12 or newer. In this folder run `npm ci`, then `npm start`. Keep the process running to handle registration. For hosting, set DATA_FILE to a file on the persistent disk and configure the environment secrets; run `node bot.cjs` when the host supplies environment variables directly.

## Use

Run `/event title:Friday 5v5 players:10` in your registration channel. Members click Register me to play, enter or confirm their gaming name and Submit. This first version uses a button and name form rather than a checkbox. The card lists everyone, permits name updates and withdrawal, and limits attendance to the requested capacity (2–64).

Once every place is filled, an organiser clicks Publish to site. The bot writes a snapshot to discord-events.json using GitHub SHA conflict protection, locks registration and displays View tournament. Only gaming names and event metadata are published; Discord account IDs remain in the private data file. Names and rosters will be public on GitHub and the website.

After GitHub Pages deployment, connect as organiser on the site, open Team setup, Refresh events, select the event and Load event players. Choose your format and create teams as usual. The event title becomes the tournament name/banner when you publish teams. Share the draw via Discord video; the website link shows the current tournament and stats, not a separate page per event.

The default event file is empty. No fake participants are deployed. To test, create an event for two players and register with two Discord accounts, then publish and load it on the site. A full 5v5 test requires ten registrations. The existing tournament is not replaced until the website organiser publishes teams.

Back up the private data file. Only one bot instance may access it. Published events remain in the website dropdown; pending events survive restarts on the persistent disk. This version does not include event deletion or reopening a published roster.
