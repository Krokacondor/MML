# Sluggers CPU League

A stat-tracking website for a CPU vs CPU Mario Super Sluggers league. It runs entirely on GitHub Pages, so it costs nothing and has no server or database to look after.

- **Home**: league leaders with mugshots, standings, latest scores, and articles
- **Teams**: every team's roster, team totals, general manager, and game log
- **Players**: a card for each player with season-by-season stats, career totals, and every team they have played for
- **Stats**: every stat from the season in sortable tables (batting, star and power, fielding, pitching), for players or teams
- **Scores**: every game, each with a full box score
- **The Dugout** (`dugout.html`): the staff page for uploading game files and editing everything else

## How it works

The "database" is a handful of JSON files in the `data/` folder. Each uploaded game is stored once, with every stat from the game file. All totals, averages, standings, and leader boards are worked out from those games each time a page loads, so deleting or fixing a game corrects every number that depended on it.

The Dugout reads a game file in your browser, shows you what it found, and saves it by making a commit to this repository through GitHub's API. GitHub Pages then republishes the site, usually within a minute.

## Putting it on GitHub

GitHub Pages is free for public repositories, so the repository needs to be public.

1. On github.com, create a new **public** repository, for example `sluggers-league`. Do not add a README or any other starter files.
2. In a terminal, from this folder:

   ```
   git add .
   git commit -m "Sluggers CPU League site"
   git remote add origin https://github.com/YOUR-USERNAME/sluggers-league.git
   git push -u origin main
   ```

3. On GitHub, open the repository's **Settings > Pages**. Under "Build and deployment", choose **Deploy from a branch**, pick **main** and **/ (root)**, and save.
4. After a minute the site is live at `https://YOUR-USERNAME.github.io/sluggers-league/`.

## Setting up the Dugout

The Dugout is at `https://YOUR-USERNAME.github.io/sluggers-league/dugout.html`. Nothing on the public site links to it.

**1. Make a GitHub key (once).** On GitHub: your profile picture > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token.

- Repository access: **Only select repositories**, and pick this one
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
3. Check the preview. The Dugout matches each team in the file to a league team, and warns you if anything in the file does not add up or if the same game was already uploaded.
4. Set the date and whether it is a regular season or playoff game, then save.

The first time a team appears it is created automatically. Use the **Teams** tab to set its general manager, colors, and short name. If a league team goes by a different name than the one the game prints (for example, your team is "Persia Cats" but the game file says "Mario Fireballs"), choose your team in the preview once. The site remembers the file's name for next time.

### What the game file needs

The reader looks for these sheets by their contents, so sheet names and order do not matter:

| Sheet | What it holds |
| --- | --- |
| Game Info | Team names around a "VS" cell, the score, stadium, settings, lineups, and the inning-by-inning scorecard |
| Stats | One row per batter, with a header row starting Team, Player, Position |
| Pitching | One row per pitcher, with a header row starting Player, Team |

Only the Stats sheet is required. Team total rows are ignored because the site does its own adding up. If a file ever has a column the site does not know, the value is still saved and the Dugout tells you which column it was.

## Working on it from your computer

You need Node.js (already installed). From this folder:

```
node tools/serve.js
```

Then open `http://localhost:8080/`. At `http://localhost:8080/dugout.html` you can choose **local mode**, which saves straight into the `data/` folder with no key needed. Commit and push afterwards to publish.

There is also a command-line importer:

```
node tools/add-game.js "D:\Downloads\Game.xlsx" --date 2026-10-07
```

## Mugshots

A player's picture is `assets/mugshots/<name>.png`, where the name is the player's name in lowercase with dashes: `bowser-jr.png`, `red-koopa-troopa.png`, `pink-yoshi.png`. Players without a picture get their initials instead. To add one, drop a PNG with the right name into that folder and push.

## Starting fresh

The site ships with the example game (Mario Fireballs at Jr. Rookies) and a placeholder article so the pages are not empty. To clear them, sign in to the Dugout and delete the game in **Games** and the story in **Articles**. The two example teams can be renamed in **Teams**, or removed by deleting them from `data/teams.json`.

## Where things live

```
index.html          the public site
dugout.html         the staff page
data/league.json    league name, seasons, settings
data/teams.json     teams, general managers, colors
data/players.json   optional player details (bats, throws, type, scouting report)
data/articles.json  articles
data/seasons/       one file per season, one game per line
data/access/        encrypted Dugout logins
assets/mugshots/    player pictures
js/lib/             the game file reader and all the stat math
js/site/            the public pages
js/dugout/          the staff page
tools/              local preview server and command-line importer
```

This is a fan project and is not affiliated with Nintendo.
