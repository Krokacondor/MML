# Mario Mania League

The stat-tracking website for the Mario Mania League (MML), a CPU vs CPU Mario Super Sluggers league. It runs entirely on GitHub Pages, so it costs nothing and has no server or database to look after.

- Site: https://krokacondor.github.io/MML/
- Staff page (the Dugout): https://krokacondor.github.io/MML/dugout.html

## What is on it

- **Home**: league leaders with character pictures, standings, latest scores, and articles. Before a season's first game it shows how the previous season finished.
- **Teams**: every team's logo, roster, team totals, general manager, and game log, grouped by conference
- **Players**: a card for each player with season-by-season stats, career totals, awards and All-Star selections, and every team they have played for
- **Stats**: every stat from the season in sortable tables, for players or teams
- **Scores**: every game, each with a full box score
- **Awards**: the end-of-season awards, each league's All-Stars at their positions on a diamond, and the All-Star Game
- **League Banter**: made-up social media posts by players, GMs and others, filterable by team, player and kind of poster
- **The Dugout** (`dugout.html`): the staff page for uploading game files and editing everything else

The season menu at the top of the page switches between seasons.

## How it works

The "database" is a handful of JSON files in the `data/` folder. Each uploaded game is stored once, with every stat from the game file. All totals, averages, standings, and leader boards are worked out from those games each time a page loads, so deleting or fixing a game corrects every number that depended on it.

The Dugout reads a game file in your browser, shows you what it found, and saves it by making a commit to this repository through GitHub's API. GitHub Pages then republishes the site, usually within a minute.

## Setting up the Dugout

Nothing on the public site links to the Dugout.

**1. Make a GitHub key (once).** On GitHub: your profile picture > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token.

- Repository access: **Only select repositories**, and pick **MML**
- Permissions > Repository permissions > **Contents: Read and write**
- Pick an expiration date. When the key expires, make a new one and re-create the logins.

Copy the key. GitHub only shows it once.

**2. Sign in with the key.** Open the Dugout, expand "First time here, or no login yet?", paste the key, and choose "Sign in with the key".

**3. Create logins.** In the **Logins** tab, make a username and password for yourself and for anyone else who should be able to upload. From then on, people sign in with just their username and password.

### How safe is this?

- The page is unlisted, not secret. The repository is public, so someone curious could find it. What protects the league is that nothing can be saved without the key.
- A login is the key, encrypted with that person's password, stored in `data/access/`. Those files are public too, so **use long passwords** (the Dugout requires 12 or more characters). A short password could eventually be guessed by someone determined.
- The key can only change files in this one repository. It cannot touch anything else on your GitHub account.
- Every save is a commit, so any change, mistaken or malicious, can be seen and undone from the repository's history.
- To lock everyone out at once, delete the key on GitHub.

## Uploading a game

1. Open the Dugout and sign in.
2. In **Upload game**, drop in the game's `.xlsx` file (or the `.csv` files for one game).
3. Check the preview. The Dugout matches each team in the file to a league team, warns you if anything in the file does not add up or if the same game was already uploaded, and lists any player names it has never seen before.
4. Set the date, the week number (optional, but it is what groups the Scores page by week), and whether it is a regular season or playoff game, then save.

**Teams.** The first time a team appears it is created automatically. Use the **Teams** tab to set its general manager, conference, colors, short name, and logo. If a league team goes by a different name than the one the game prints (the game says "Mario Fireballs", the league says something else), choose your team in the preview once. The site remembers the file's name for next time.

**Player names.** A player is identified by name. If the same character is spelled two ways (Season 2 says "Red Koopa", a game file says "Red Koopa Troopa"), add the pair under **League > Player names** so both count as one player with one history.

### What the game file needs

The reader looks for these sheets by their contents, so sheet names and order do not matter:

| Sheet | What it holds |
| --- | --- |
| Game Info | Team names around a "VS" cell, the score, stadium, settings, lineups, and the inning-by-inning scorecard |
| Stats | One row per batter, with a header row starting Team, Player, Position |
| Pitching | One row per pitcher, with a header row starting Player, Team |

Only the Stats sheet is required. Team total rows are ignored because the site does its own adding up. If a file ever has a column the site does not know, the value is still saved and the Dugout tells you which column it was.

## Writing a story

Stories go in the Press Box (the News page and the bottom of Home).

1. Open the Dugout, sign in, and go to **Articles**.
2. Choose **Write a new story** (or pick an old one to edit).
3. Fill in the headline, date, summary (a sentence or two shown on the clipping), and the story itself. The preview under the story shows how it will look.
4. **Writer**: pick a writer from the list or type a new name. The writers can be made up ("Mr. Stats Man"). Choose a **writer's picture** the first time; it is remembered and shows on every story by that writer. Choosing a new one replaces it everywhere.
5. **Story picture** (optional): shown above the story and, cropped, on its clipping. Add a caption if you like. **Remove picture** takes it off.
6. Save. Pictures are shrunk in your browser before saving (stories up to 1400 pixels, writers to a 256-pixel square cut from the middle), so any size is fine.

Stories live in `data/articles.json`, writers in `data/authors.json`, and their pictures in `assets/news/` and `assets/authors/`. Deleting a story deletes its picture too.

## Making a social post

Social posts are made-up social media posts (a picture of a post) by players, GMs or anyone else. They show on League Banter page, newest first, where visitors can filter them by team, by player, or by kind of poster.

1. In the Dugout, open **Social posts** and choose **New post**.
2. Add the picture: paste it (Ctrl+V), drag it into the box, or choose a file. It is shrunk to 1200 pixels wide before saving.
3. **Posted by**: a player (type the name; their latest team is filled in), a GM (pick the GM; their team is filled in), or someone else (type any name).
4. **Team** is what the team filter uses. Change it if the post belongs with a different team, or pick "No team".
5. Optional: type the words of the post (for screen readers), and tick **Spoiler** if the post gives away a result. A spoiler post stays covered until a visitor clicks it.

Posts live in `data/posts.json` and their pictures in `assets/posts/`. A link can open the page already filtered: `#/feed?team=wild-woods-1-uppers`, `#/feed?player=petey-piranha`, or `#/feed?kind=gm`. The page's name comes from `"feedName"` in `data/league.json` (League Banter when it is not set).

## Seasons

Start a new season in the Dugout under **League**. It becomes the current season: the one the site opens on and the one uploads go into.

A team in `data/teams.json` with a `"seasons"` list (for example `"seasons": ["s2"]`) belongs only to those seasons. A team without that list belongs to the current season. That is how the Season 2 clubs stay in Season 2 while Season 3 gets its own.

### Season 2

Season 2 was played before per-game files existed, so it is stored as season totals: one line per player in `data/seasons/s2.json`, taken from the "Season Totals" sheet of the league's stats workbook. That season kept hits by type, RBIs, walks, strikeouts, and pitching strikeouts. It did not keep runs or fielding, so those show as "-". At-bats were worked back from hits and batting average, and checked against slugging.

Season 2 game results are added to the same file by hand, from the league's scoreboard pictures: each game has its week, its number in the series (`"n"`), the score, and the inning-by-inning line where the picture shows it. An inning nobody can read is stored as `null` and shown as "?". Week 1 games also carry each player's line from the Week 1 sheets of the stats workbook, so they have box scores.

In a season stored as totals, the totals stay the season's numbers. Games add results, standings, box scores, game logs, and team history (a player who changed teams shows both), but their player lines are not added on top, so nothing is counted twice. Until every scheduled game is entered, the standings say how many are in.

The same file holds the Season 2 All-Star vote, tallied from the ballot spreadsheet. To rebuild it from the two workbooks (`--seats 2` means two All-Stars per position):

```
node tools/import-season-totals.js "D:\Downloads\sluggers_stats.xlsx" --season s2 --seats 2 --ballots "D:\Downloads\MML Season 2 All Star Voting (Responses).xlsx"
```

### Before a season starts

A season file can list the clubs that aren't announced yet, so the Home and Teams pages show the whole league as it takes shape:

- `"pending"`: one entry per club still to come, `{ "gm": "Daxx", "label": "New team", "note": "New team captain" }`. Remove an entry once its team is added to `data/teams.json` with that season in its `"seasons"` list.
- `"preseason"`: a sentence on where things stand (for example, that rosters are set at the re-draft).
- `"groups": false`: list the season's teams together instead of by Mushroom and Bowser League, until the season's groups are decided.

Until a team plays in the new season, its page shows its last season, with that season's tag (S2) on each panel. A new club run by a returning GM can point to the GM's old team with `"formerly": "<old team id>"` in `data/teams.json`: the new team's page shows "Previously" and the old team's page shows "Now", each linking to the other.

### Schedule and format

A season file can carry a `"schedule"` (one entry per week, each listing its series: the two teams, the stadium, and how many games) and a `"format"` sentence describing how the season is played. The Scores page shows the schedule week by week, and each team page lists that team's series. An uploaded game with a week number shows up under its series automatically.

Season 2 was six weeks of three-game series: 5-inning games with a 10-run mercy rule applied at the end of an inning. Season 3 is one 9-inning game per team each week, with 10 teams.

### Playoffs

Playoff games go in the same season file with `"type": "playoffs"`. A game without a date can carry a `"round"` (for example `"Mushroom League"` or `"World Series"`) and its number in the series as `"n"`. The Scores page lists each round after the regular season, in game order, and the Stats page gets a Regular season / Playoffs switch once playoff games have player lines.

When a series ends early, add the games it never needed as slots, so viewers cannot tell from the number of games how the series went: `{ "id": "s2-081", "type": "playoffs", "round": "Bowser League", "n": 4, "notPlayed": true, "away": { "team": "ohio", "score": null, "line": [] }, "home": { ... } }`. While hidden they look like any other game; uncovered they show X for both scores and "Not played". They count for nothing.

### Spoilers

Every score on the site starts hidden under a striped box that is always two digits wide, so a lopsided score looks the same as a close one. Until a game is uncovered its scoreboard shows no inning columns (their count would give away a mercy-rule or extra-inning game) and its box score is replaced by a note. Hidden scores appear on: score cards, the ticker, game pages, team schedules and game logs, and the All-Star Game. Each game has an eye button that uncovers it; each week (and each playoff round) has one for all its games, and the Scores page has one for every score. A viewer's uncovered games are remembered in their own browser, so a game opened once stays open on every page. Standings, records and stat totals are not hidden.

### Awards and All-Stars

Both live in the season's file in `data/seasons/`.

- `"awards"` is a list of awards, each with a title and its winners. A winner is a player (`{ "p": "Petey Piranha" }`) or a general manager (`{ "gm": "Rory", "team": "star-road-superstars" }`). Winners get a badge on their player or team page.
- `"allStars"` holds the vote. The top `"seats"` vote-getters at each position are the All-Stars, shown on the Awards page at their positions on a diamond (P, C, 1B, 2B, 3B, SS, LF, CF, RF), one diamond per league. Vote counts are kept in the file but not shown. When two players tie for the last spot, both are shown as tied. To record who actually got the spot, add `"picked": ["Name One", "Name Two"]` to that position.
- `"allStars"` can also hold the All-Star Game as `"game"`: `{ "stadium", "note", "away": { "conf": "bk", "score": 21, "line": [...] }, "home": { ... } }`, using the conference ids from `data/league.json`. It shows on the Awards page and does not count toward any team's record or player's stats.

## Pictures

- **Characters**: `assets/mugshots/<name>.png`, where the name is the player's name in lowercase with dashes (`bowser-jr.png`, `red-koopa-troopa.png`). Game characters use the left-facing side-view sprites from the character select screen, from the Super Mario Wiki gallery for Mario Super Sluggers. Miis use a picture the league supplies (about 192 by 204 pixels, see-through background, facing left). Anyone without a picture yet gets the stand-in `_mii.png`. All game characters use the game's own 48-pixel icons, so every character looks consistent. They are enlarged four times with xBR, the pixel-art filter emulators like Dolphin use (a fixed rule, not AI). The untouched icons are kept in `assets/mugshots/original-48px/` as the source for the enlarged ones. After adding a new icon, run `powershell -File tools/upscale-icons.ps1 -ffmpeg <path to ffmpeg.exe>` to enlarge it the same way. To add or replace one, drop a PNG with the right name into that folder and push.
- **Full-body pictures** (optional): `assets/fullbody/<name>.png`, named the same way. Where a small sprite would have to be stretched (the player's own page and the number one spot on the leader board), the site shows the full-body picture instead when there is one. A see-through background and about 400 pixels tall works well.
- **Team logos**: `assets/teams/`. Set a team's logo in the Dugout's **Teams** tab by typing the file's path. A team without a logo shows its short name on a plate.
- **League logo**: each season in `data/league.json` can have a `"logo"`. A season without one borrows the most recent logo before it.
- **Conference logos**: `assets/conferences/`, listed in `data/league.json`.

## Working on it from your computer

You need Node.js (already installed). From this folder:

```
node tools/serve.js
```

Then open `http://localhost:8080/`. At `http://localhost:8080/dugout.html` you can choose **local mode**, which saves straight into the `data/` folder with no key needed. Commit and push afterwards to publish.

There is also a command-line importer for a single game:

```
node tools/add-game.js "D:\Downloads\Game.xlsx" --date 2026-10-07
```

## Where things live

```
index.html          the public site
dugout.html         the staff page
data/league.json    league name, seasons, conferences, player name spellings, settings
data/teams.json     teams, general managers, conferences, colors, logos
data/players.json   optional player details (bats, throws, type, scouting report)
data/articles.json  articles (stories)
data/authors.json   story writers and their pictures
data/posts.json     social posts
data/seasons/       one file per season: one game per line, or one player per line for totals seasons
data/access/        encrypted Dugout logins
assets/             character pictures, team, league and conference logos, story and writer pictures
js/lib/             the game file reader and all the stat math
js/site/            the public pages
js/dugout/          the staff page
tools/              local preview server and the importers
```

This is a fan project and is not affiliated with Nintendo.
