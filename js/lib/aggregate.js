// Adds the game records up into season, team, player and career totals.
// Nothing here is saved: totals are rebuilt from the games on every page load,
// so fixing or deleting a game fixes every number that depended on it.

import { slug } from './html.js';
import { BAT_KEYS, PIT_KEYS } from './statdefs.js';

const addInto = (into, row, keys) => {
  for (const k of keys) if (row[k]) into[k] = (into[k] || 0) + row[k];
};
const blankLine = () => ({ g: 0, gp: 0, bat: {}, pit: {}, pos: {} });

export const sortGames = (games) =>
  [...games].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.id).localeCompare(String(b.id)));

// Totals for one set of games (a season's regular games, or its playoff games).
export function buildStats(games) {
  const teams = new Map();
  const players = new Map();
  const teamRec = (id) => {
    if (!teams.has(id)) teams.set(id, { id, ...blankLine(), w: 0, l: 0, t: 0, rs: 0, ra: 0, results: [] });
    return teams.get(id);
  };
  const playerRec = (name) => {
    const s = slug(name);
    if (!players.has(s)) players.set(s, { slug: s, name, ...blankLine(), teams: [], teamId: null, byTeam: new Map(), log: [] });
    return players.get(s);
  };

  for (const game of games) {
    const sides = { a: game.away, h: game.home };
    for (const [me, them] of [['a', 'h'], ['h', 'a']]) {
      const T = teamRec(sides[me].team);
      const rf = sides[me].score || 0;
      const ra = sides[them].score || 0;
      T.g++;
      T.gp++;
      T.rs += rf;
      T.ra += ra;
      if (rf > ra) T.w++;
      else if (rf < ra) T.l++;
      else T.t++;
      T.results.push({ game, home: me === 'h', opp: sides[them].team, rf, ra, res: rf > ra ? 'W' : rf < ra ? 'L' : 'T' });
    }

    // One appearance per player per game, however many sheets they show up on.
    const seen = new Map();
    const appearance = (row) => {
      const teamId = sides[row.t]?.team;
      const P = playerRec(row.p);
      const id = P.slug + '|' + teamId;
      if (!seen.has(id)) {
        if (!P.byTeam.has(teamId)) {
          P.byTeam.set(teamId, { teamId, ...blankLine() });
          P.teams.push(teamId);
        }
        P.teamId = teamId;
        const entry = { game, teamId, bat: null, pit: null };
        P.log.push(entry);
        const split = P.byTeam.get(teamId);
        P.g++;
        split.g++;
        seen.set(id, { P, split, entry, T: teamRec(teamId) });
      }
      return seen.get(id);
    };

    for (const row of game.batting || []) {
      const { P, split, entry, T } = appearance(row);
      entry.bat = row;
      for (const target of [P, split, T]) addInto(target.bat, row, BAT_KEYS);
      if (row.pos) for (const target of [P, split]) target.pos[row.pos] = (target.pos[row.pos] || 0) + 1;
    }
    for (const row of game.pitching || []) {
      const { P, split, entry, T } = appearance(row);
      entry.pit = row;
      for (const target of [P, split, T]) addInto(target.pit, row, PIT_KEYS);
      P.gp++;
      split.gp++;
    }
  }
  return { games, teams, players };
}

// Has this player played enough to appear on a rate-stat leader board?
export function isQualified(rec, stats, league, kind) {
  const q = league.qualifiers || {};
  const teamGames = stats.teams.get(rec.teamId)?.g || 0;
  if (kind === 'pit') return (rec.pit.outs || 0) / 3 >= (q.ipPerTeamGame ?? 1) * teamGames;
  return (rec.bat.pa || 0) >= (q.paPerTeamGame ?? 1) * teamGames;
}

// Positions played, most common first: "SS, 2B".
export const positions = (rec) =>
  Object.entries(rec.pos || {})
    .sort((a, b) => b[1] - a[1])
    .map((x) => x[0]);

export function buildLeague({ league, teams = [], players = {}, articles = [], seasons = {} }) {
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const model = {
    league,
    teams: teamMap,
    team: (id) => teamMap.get(id) || { id, name: id || 'Unknown team', abbr: '???', gm: '', colors: ['#4a5473', '#fffcf1'], missing: true },
    articles: [...articles].sort((a, b) => String(b.date).localeCompare(String(a.date))),
    seasons: [],
    players: new Map(),
  };

  for (const meta of league.seasons || []) {
    const games = sortGames(seasons[meta.id]?.games || []);
    const season = {
      ...meta,
      games,
      reg: buildStats(games.filter((g) => g.type !== 'playoffs')),
      post: buildStats(games.filter((g) => g.type === 'playoffs')),
    };
    model.seasons.push(season);

    for (const part of ['reg', 'post']) {
      for (const rec of season[part].players.values()) {
        if (!model.players.has(rec.slug)) {
          model.players.set(rec.slug, {
            slug: rec.slug,
            name: rec.name,
            info: players[rec.slug] || {},
            seasons: [],
            stints: [],
            career: { reg: blankLine(), post: blankLine() },
            last: null,
          });
        }
        const P = model.players.get(rec.slug);
        let row = P.seasons.find((x) => x.season === season);
        if (!row) P.seasons.push((row = { season, reg: null, post: null }));
        row[part] = rec;

        const total = P.career[part];
        total.g += rec.g;
        total.gp += rec.gp;
        addInto(total.bat, rec.bat, BAT_KEYS);
        addInto(total.pit, rec.pit, PIT_KEYS);
        for (const [pos, n] of Object.entries(rec.pos)) total.pos[pos] = (total.pos[pos] || 0) + n;

        // Team history, in order: a new stint starts whenever the team changes.
        for (const teamId of rec.teams) {
          const lastStint = P.stints[P.stints.length - 1];
          if (lastStint?.teamId === teamId) {
            if (!lastStint.seasons.includes(season)) lastStint.seasons.push(season);
          } else {
            P.stints.push({ teamId, seasons: [season] });
          }
        }
        P.last = { season, teamId: rec.teamId };
      }
    }
  }
  return model;
}
