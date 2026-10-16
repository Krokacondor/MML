// Builds a season file from a workbook of season totals, for seasons that were
// tracked before per-game files existed (Season 2).
//
//   node tools/import-season-totals.js <stats.xlsx> --season s2 [--ballots <all-star votes.xlsx>]
//
// The stats workbook needs a "Season Totals" sheet with these columns:
//   Player, Team, BA, SLG, Singles, Doubles, Triples, HR, RBIs, Walked,
//   Struck Out, Strikeouts (as a pitcher), BB (walks given up as a pitcher)
// At-bats are not in the sheet, so they are worked back from hits and BA and
// checked against SLG. Teams must already exist in data/teams.json.
//
// The ballots workbook is a Google Forms export: one row per voter, one column
// per position, each answer written as "Player (Team)".

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { readXlsx } from '../js/lib/xlsx-lite.js';
import { matchTeam, serializeSeason } from '../js/lib/league-ops.js';
import { allStarsAt } from '../js/lib/aggregate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const readJson = async (rel, fallback) => JSON.parse(await fs.readFile(path.join(ROOT, rel), 'utf8').catch(() => JSON.stringify(fallback)));
const open = async (file) => readXlsx(await fs.readFile(file), async (b) => zlib.inflateRawSync(b));
const table = (sheet) => {
  const [head, ...rows] = sheet.rows;
  return rows.filter((r) => r.length).map((r) => Object.fromEntries(head.map((h, i) => [String(h).trim(), r[i]])));
};

const seasonId = opt('season');
const ballotFile = opt('ballots');
const seats = Number(opt('seats', 1)); // All-Stars per position
const [statsFile] = args;
if (!statsFile || !seasonId) {
  console.error('Usage: node tools/import-season-totals.js <stats.xlsx> --season <id> [--ballots <votes.xlsx>]');
  process.exit(1);
}
const league = await readJson('data/league.json');
const teams = await readJson('data/teams.json', []);
const meta = league.seasons.find((s) => s.id === seasonId);
if (!meta) throw new Error(`No season "${seasonId}" in data/league.json.`);
const teamId = (name) => {
  const team = matchTeam(teams, String(name).replace(/[‘’]/g, "'"));
  if (!team) throw new Error(`Team "${name}" is not in data/teams.json.`);
  return team.id;
};

// ---- Season totals ---------------------------------------------------------

const sheet = (await open(statsFile)).find((s) => /season totals/i.test(s.name));
if (!sheet) throw new Error('The workbook has no "Season Totals" sheet.');
const n = (v) => Number(v) || 0;
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v));
const notes = [];
const totals = table(sheet).map((r) => {
  const b1 = n(r.Singles), b2 = n(r.Doubles), b3 = n(r.Triples), hr = n(r.HR);
  const h = b1 + b2 + b3 + hr;
  const tb = b1 + 2 * b2 + 3 * b3 + 4 * hr;
  const ab = n(r.BA) ? Math.round(h / n(r.BA)) : 0;
  if (!ab) notes.push(`${r.Player}: no hits, so at-bats cannot be worked out.`);
  else if (Math.abs(h / ab - n(r.BA)) > 0.0006 || Math.abs(tb / ab - n(r.SLG)) > 0.0006) {
    notes.push(`${r.Player}: ${h} hits in ${ab} at-bats gives ${(h / ab).toFixed(3)} / ${(tb / ab).toFixed(3)}, sheet says ${r.BA} / ${r.SLG}.`);
  }
  const bb = n(r.Walked);
  const line = { team: teamId(r.Team), p: String(r.Player).trim(), bat: clean({ ab, pa: ab + bb, h, b1, b2, b3, hr, tb, rbi: n(r.RBIs), bb, so: n(r['Struck Out']) }) };
  const pit = clean({ k: n(r.Strikeouts), bb: n(r.BB) });
  if (Object.keys(pit).length) line.pit = pit;
  return line;
});

// ---- All-Star ballots ------------------------------------------------------

// Names the ballot spelled differently from the stats sheet ("Grey" is also read as "Gray").
const SAME_PLAYER = { 'Numbuh 4': 'Numbuh Four', 'Numbah Four': 'Numbuh Four', 'Weird Al Yankovic': 'Weird Al' };
let allStars = null;
if (ballotFile) {
  const [head, ...ballots] = (await open(ballotFile))[0].rows.filter((r) => r.length);
  const known = new Map(totals.map((t) => [t.p, t.team]));
  const conferences = [];
  head.forEach((cell, col) => {
    // Headers read "Mushroom Kingdom ... First Base (1B)". The group is matched on its
    // first word, so it still lines up if the league calls it "Mushroom League".
    const m = /^\s*(\w+)\s+(?:Kingdom|League|Conference|Division)\b[\s\S]*\((\w+)\)\s*$/.exec(String(cell || ''));
    if (!m) return;
    const conf = league.conferences.find((c) => c.name.toLowerCase().startsWith(m[1].toLowerCase()));
    if (!conf) throw new Error(`No conference starting with "${m[1]}" in data/league.json.`);
    let group = conferences.find((c) => c.id === conf.id);
    if (!group) conferences.push((group = { id: conf.id, name: conf.name, picks: [] }));
    const tally = new Map();
    for (const row of ballots) {
      const vote = /^(.*?)\s*\((.*)\)\s*$/.exec(String(row[col] || '').replace(/[‘’]/g, "'"));
      if (!vote) continue;
      const name = SAME_PLAYER[vote[1]] || vote[1].replace(/\bGrey\b/, 'Gray');
      if (!known.has(name)) notes.push(`Ballot names "${vote[1]}" (${vote[2]}), who is not in the season totals.`);
      tally.set(name, (tally.get(name) || 0) + 1);
    }
    const votes = [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p, count]) => ({ p, team: known.get(p) || null, n: count }));
    group.picks.push({ pos: m[2], votes });
  });
  allStars = { ballots: ballots.length, seats, conferences };
}

// ---- Write -----------------------------------------------------------------

const file = `data/seasons/${seasonId}.json`;
const existing = await readJson(file, {});
// Everything else already in the file (awards, schedule, format, games) is kept as it is.
const { allStars: oldStars, totals: oldTotals, games: oldGames, ...kept } = existing;
const season = {
  ...kept,
  id: seasonId,
  name: meta.name,
  note: "Season 2 did not keep runs or fielding stats.",
  tracked: { bat: ['ab', 'pa', 'h', 'b1', 'b2', 'b3', 'hr', 'tb', 'rbi', 'bb', 'so'], pit: ['k', 'bb'] },
  ...(allStars || oldStars ? { allStars: allStars || oldStars } : {}),
  totals,
  games: oldGames || [],
};
await fs.writeFile(path.join(ROOT, file), serializeSeason(season));

const perTeam = {};
for (const t of totals) perTeam[t.team] = (perTeam[t.team] || 0) + 1;
console.log(`Wrote ${file}: ${totals.length} players on ${Object.keys(perTeam).length} teams.`);
console.log('  ' + Object.entries(perTeam).map(([t, c]) => `${t} ${c}`).join(', '));
if (allStars) {
  console.log(`All-Stars from ${allStars.ballots} ballots:`);
  for (const conf of allStars.conferences) {
    console.log(`  ${conf.name}:`);
    for (const pick of conf.picks) {
      const stars = allStarsAt(pick, seats);
      console.log(`    ${pick.pos.padEnd(3)} ${stars.map((v) => `${v.p} ${v.n}`).join(', ')}${stars.length > seats ? '   <-- tie for the last spot' : ''}`);
    }
  }
}
for (const note of [...new Set(notes)]) console.log('  Note: ' + note);
