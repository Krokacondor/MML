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

// Finds the league team a name from a game file refers to. Earlier names win.
export function matchTeam(teams, ...names) {
  for (const name of names.map(key).filter(Boolean)) {
    const hit = teams.find((t) => [t.name, ...(t.aliases || [])].some((a) => key(a) === name));
    if (hit) return hit;
  }
  return null;
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
export function learnAliases(team, ...names) {
  for (const name of names) {
    if (!name || [team.name, ...(team.aliases || [])].some((a) => key(a) === key(name))) continue;
    (team.aliases ||= []).push(name);
  }
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

export const pretty = (data) => JSON.stringify(data, null, 2) + '\n';

// Season files keep one game (or one player's season line) per row of text, so
// the file stays readable and changes show up cleanly in the repository history.
export function serializeSeason(season) {
  const { schedule, totals, games = [], ...meta } = season;
  const rows = (list) => (list.length ? `\n${list.map((item) => '    ' + JSON.stringify(item)).join(',\n')}\n  ` : '');
  let out = JSON.stringify(meta, null, 2).replace(/\n}$/, '');
  if (schedule) out += `,\n  "schedule": [${rows(schedule)}]`; // one week per line
  if (totals) out += `,\n  "totals": [${rows(totals)}]`;
  return `${out},\n  "games": [${rows(games)}]\n}\n`;
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
