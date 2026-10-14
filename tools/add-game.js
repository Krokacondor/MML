// Adds a game file to the league from the command line, as an alternative to
// the Dugout page:
//
//   node tools/add-game.js "D:\Downloads\Game.xlsx" [--date 2026-10-07] [--season s1] [--type playoffs]
//
// Several .csv files (stats, pitching, game info) can be given for one game.
// New teams are created automatically. Commit and push afterwards to publish.

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { readXlsx, readCsv } from '../js/lib/xlsx-lite.js';
import { parseGame } from '../js/lib/parse-game.js';
import { matchTeam, makeTeam, learnAliases, nextGameId, toStoredGame, serializeSeason, pretty, todayISO } from '../js/lib/league-ops.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const readJson = async (rel, fallback) => {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, rel), 'utf8'));
  } catch {
    return fallback;
  }
};

const date = opt('date', todayISO());
const type = opt('type', 'regular');
const week = opt('week');
const force = args.includes('--force') && args.splice(args.indexOf('--force'), 1);
const league = await readJson('data/league.json');
const seasonId = opt('season', league.currentSeason);
if (!args.length) {
  console.error('Usage: node tools/add-game.js <file.xlsx | files.csv...> [--date YYYY-MM-DD] [--season id] [--type regular|playoffs] [--force]');
  process.exit(1);
}
const seasonMeta = league.seasons.find((s) => s.id === seasonId);
if (!seasonMeta) throw new Error(`No season "${seasonId}" in data/league.json.`);

const sheets = [];
for (const file of args) {
  const bytes = await fs.readFile(file);
  if (/\.xlsx$/i.test(file)) sheets.push(...(await readXlsx(bytes, async (b) => zlib.inflateRawSync(b))));
  else sheets.push({ name: path.basename(file), rows: readCsv(bytes.toString('utf8')) });
}
const { game: parsed, warnings } = parseGame(sheets);

const teams = await readJson('data/teams.json', []);
const resolve = (side) => {
  let team = matchTeam(teams, side.name, side.label);
  if (!team) {
    team = makeTeam(teams, side.name, side.label);
    teams.push(team);
    console.log(`New team created: ${team.name}`);
  }
  learnAliases(team, side.name, side.label);
  return team;
};
const away = resolve(parsed.away);
const home = resolve(parsed.home);

const seasonFile = `data/seasons/${seasonId}.json`;
const season = await readJson(seasonFile, { id: seasonId, name: seasonMeta.name, games: [] });
if (season.games.some((g) => g.fp === parsed.fp) && !force) {
  console.error('This game is already in the season (same teams, score and stats). Use --force to add it anyway.');
  process.exit(1);
}
const game = toStoredGame(parsed, { id: nextGameId(season), date, week, type, awayTeam: away.id, homeTeam: home.id });
season.games.push(game);

await fs.writeFile(path.join(ROOT, 'data/teams.json'), pretty(teams));
await fs.writeFile(path.join(ROOT, seasonFile), serializeSeason(season));

console.log(`Added ${game.id}: ${away.name} ${game.away.score}, ${home.name} ${game.home.score} (${date})`);
console.log(`  ${parsed.batting.length} batters, ${parsed.pitching.length} pitchers`);
for (const w of warnings) console.log('  Note: ' + w);
