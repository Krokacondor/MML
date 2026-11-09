// Changes to the league's data files. Shared by the upload page and the
// command-line importer so both write games the same way.

import { slug } from './html.js';

export const GAME_TYPES = { regular: 'Regular season', playoffs: 'Playoffs' };

// Starting colors handed to new teams: [main, trim].
export const TEAM_COLORS = [
  ['#d63a2f', '#fffcf1'], ['#2f6fd0', '#f5b326'], ['#1f6b47', '#f5b326'], ['#f5b326', '#16213f'],
  ['#7a3fb8', '#fffcf1'], ['#e8741c', '#16213f'], ['#15929a', '#fffcf1'], ['#d6508f', '#16213f'],
  ['#16213f', '#d63a2f'], ['#7c5a36', '#f5b326'], ['#6fae2e', '#16213f'], ['#8f1d2c', '#f5b326'],
];

const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// Finds the league team a name from a game file refers to. A team's own name
// beats another team's alias; otherwise earlier names win.
export function matchTeam(teams, ...names) {
  const keys = names.map(key).filter(Boolean);
  for (const own of [true, false]) {
    for (const name of keys) {
      const hit = teams.find((t) => (own ? [t.name] : t.aliases || []).some((a) => key(a) === name));
      if (hit) return hit;
    }
  }
  return null;
}

// Finds the team a game file's lineup belongs to: the one whose season players
// (a Map of team id -> Set of player slugs) include most of its batters.
export function matchByPlayers(teams, players, batters) {
  let best = null;
  let most = 0;
  for (const t of teams) {
    const mine = players.get(t.id);
    const n = mine ? batters.filter((p) => mine.has(slug(p))).length : 0;
    if (n > most) [best, most] = [t, n];
  }
  return most >= Math.ceil(batters.length / 2) ? best : null;
}

export function makeTeam(teams, name, label) {
  const base = slug(name) || 'team';
  let id = base;
  for (let n = 2; teams.some((t) => t.id === id); n++) id = `${base}-${n}`;
  const words = name.trim().split(/\s+/);
  const abbr = (words.length > 1 ? words[words.length - 1] : name).replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
  return {
    id,
    name,
    abbr,
    gm: '',
    colors: TEAM_COLORS[teams.length % TEAM_COLORS.length],
    aliases: label && key(label) !== key(name) ? [label] : [],
  };
}

// Remembers the names a game file used for a team, so the next file matches by itself.
// A name belongs to one team only: another team's own name is never learned, and
// a name that moves (the game names a team after its captain) leaves its old team.
export function learnAliases(teams, team, ...names) {
  for (const name of names) {
    if (!name || teams.some((t) => t !== team && key(t.name) === key(name))) continue;
    for (const t of teams) if (t !== team && t.aliases) t.aliases = t.aliases.filter((a) => key(a) !== key(name));
    if ([team.name, ...(team.aliases || [])].some((a) => key(a) === key(name))) continue;
    (team.aliases ||= []).push(name);
  }
}

// The scheduled series between two teams: in the given week, or else the first
// week they meet without a game saved yet. Gives { week, teams, home, stadium, ... }.
export function findSeries(season, a, b, week) {
  const meet = (x, y) => [x, y].includes(a) && [x, y].includes(b);
  const saved = (w) => (season.games || []).some((g) => g.week === w && meet(g.away.team, g.home.team));
  for (const w of season.schedule || []) {
    if (week ? w.week !== Number(week) : saved(w.week)) continue;
    const series = (w.series || []).find((s) => meet(...s.teams));
    if (series) return { week: w.week, ...series };
  }
  return null;
}

// The game itself doesn't care who is home: the schedule's home team only picks
// the stadium. So a stored game's sides follow the schedule, not the file, and
// this swaps them when the two disagree. Each team keeps its own line and stats.
export function swapSides(game) {
  const flip = (r) => ({ ...r, t: r.t === 'a' ? 'h' : r.t === 'h' ? 'a' : r.t });
  return { ...game, away: game.home, home: game.away, batting: game.batting.map(flip), pitching: game.pitching.map(flip) };
}

export function nextGameId(season) {
  const max = (season.games || []).reduce((m, g) => Math.max(m, Number((/(\d+)$/.exec(g.id) || [0, 0])[1])), 0);
  return `${season.id}-${String(max + 1).padStart(3, '0')}`;
}

// A parsed game plus the uploader's choices -> the record kept in the season file.
export function toStoredGame(parsed, { id, date, week, type, awayTeam, homeTeam }) {
  const side = (s, team) => ({ team, score: s.score, ...(s.user ? { user: s.user } : {}), line: s.line });
  const game = { id, date, ...(Number(week) > 0 ? { week: Number(week) } : {}), type: type || 'regular' };
  if (parsed.stadium) game.stadium = parsed.stadium;
  if (parsed.settings && Object.keys(parsed.settings).length) game.settings = parsed.settings;
  return {
    ...game,
    away: side(parsed.away, awayTeam),
    home: side(parsed.home, homeTeam),
    batting: parsed.batting,
    pitching: parsed.pitching,
    fp: parsed.fp,
  };
}

// A Mii: a shirt label ("Red Mii (F)") or a player data/players.json lists
// without a game "name". Miis can't be a lineup's star.
export const isMii = (name, players = {}) => / Mii \([MF]\)$/.test(name) || Boolean(players[slug(name)] && !players[slug(name)].name);

// The game's stadiums and whether each is played by day, at night, or both.
// A week's games each pick one, and no stadium is used twice in a week.
export const STADIUMS = [
  ['Bowser Castle', ['night']],
  ['Bowser Jr. Playroom', ['day']],
  ['Daisy Cruiser', ['day', 'night']],
  ['DK Jungle', ['day', 'night']],
  ["Luigi's Mansion", ['night']],
  ['Mario Stadium', ['day', 'night']],
  ['Peach Ice Garden', ['day', 'night']],
  ['Wario City', ['day', 'night']],
  ['Yoshi Park', ['day', 'night']],
];
export const TIME_ICON = { day: '☀️', night: '🌙' };
// A scheduled game's stadium as shown: "Mario Stadium ☀️".
export const stadiumLabel = (s) => (s.stadium ? `${s.stadium}${TIME_ICON[s.time] ? ` ${TIME_ICON[s.time]}` : ''}` : '');

// A team's general managers. "gm" is one name, or a list for a co-managed team.
export const gmsOf = (team) => [].concat(team?.gm || []).filter(Boolean);
export const gmLabel = (team) => gmsOf(team).join(', ');

export const pretty = (data) => JSON.stringify(data, null, 2) + '\n';

// Season files keep one game (or one player's season line) per row of text, so
// the file stays readable and changes show up cleanly in the repository history.
export function serializeSeason(season) {
  const { schedule, draft, moves, rosters, totals, games = [], ...meta } = season;
  const rows = (list) => (list.length ? `\n${list.map((item) => '    ' + JSON.stringify(item)).join(',\n')}\n  ` : '');
  let out = JSON.stringify(meta, null, 2).replace(/\n}$/, '');
  if (schedule) out += `,\n  "schedule": [${rows(schedule)}]`; // one week per line
  if (draft) out += `,\n  "draft": [${rows(draft)}]`; // one pick per line
  if (moves) out += `,\n  "moves": [${rows(moves)}]`; // one player moving per line
  if (rosters) out += `,\n  "rosters": [${rows(rosters)}]`; // one team per line
  if (totals) out += `,\n  "totals": [${rows(totals)}]`;
  return `${out},\n  "games": [${rows(games)}]\n}\n`;
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
