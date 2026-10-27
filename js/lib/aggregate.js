// Adds the season records up into season, team, player and career totals.
// Nothing here is saved: totals are rebuilt on every page load, so fixing or
// deleting a game fixes every number that depended on it.
//
// A season is normally a list of games. A season from before box scores were
// kept can instead carry "totals": one ready-made line per player, plus a
// "tracked" list saying which stats were recorded that year. Games can be added
// to such a season too: they supply results, standings and box scores, while
// the ready-made lines stay the season's numbers, so nothing is counted twice.

import { slug } from './html.js';
import { BAT_KEYS, PIT_KEYS } from './statdefs.js';

const addInto = (into, row, keys) => {
  for (const k of keys) if (row?.[k]) into[k] = (into[k] || 0) + row[k];
};
export const blankLine = () => ({ g: 0, gp: 0, bat: {}, pit: {}, pos: {} });

export const sortGames = (games) =>
  [...games].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.id).localeCompare(String(b.id)));

// Totals for one set of games (a season's regular games, or its playoff games).
export function buildStats(games, { totals = [], tracked = null, canon = (name) => name } = {}) {
  const teams = new Map();
  const players = new Map();
  // A totals season: its player lines in games fill box scores, game logs and
  // team history, but are not added up.
  const ledger = totals.length > 0;
  const teamRec = (id) => {
    if (!teams.has(id)) teams.set(id, { id, ...blankLine(), w: 0, l: 0, t: 0, rs: 0, ra: 0, results: [] });
    return teams.get(id);
  };
  const playerRec = (rawName) => {
    const name = canon(rawName);
    const s = slug(name);
    if (!players.has(s)) players.set(s, { slug: s, name, ...blankLine(), teams: [], teamId: null, byTeam: new Map(), log: [] });
    return players.get(s);
  };
  const splitRec = (P, teamId) => {
    if (!P.byTeam.has(teamId)) {
      P.byTeam.set(teamId, { teamId, ...blankLine() });
      if (!P.teams.includes(teamId)) P.teams.push(teamId);
    }
    P.teamId = teamId;
    return P.byTeam.get(teamId);
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
        const entry = { game, teamId, bat: null, pit: null };
        P.log.push(entry);
        let own = [];
        if (ledger) {
          if (!P.teams.includes(teamId)) P.teams.push(teamId);
          P.teamId = teamId;
        } else {
          own = [P, splitRec(P, teamId)];
          for (const target of own) target.g++;
        }
        // own: the player's lines to add this game to. sums: those plus the team's.
        seen.set(id, { entry, own, sums: ledger ? [] : [...own, teamRec(teamId)] });
      }
      return seen.get(id);
    };

    for (const row of game.batting || []) {
      const { entry, own, sums } = appearance(row);
      entry.bat = row;
      for (const target of sums) addInto(target.bat, row, BAT_KEYS);
      if (row.pos) for (const target of own) target.pos[row.pos] = (target.pos[row.pos] || 0) + 1;
    }
    for (const row of game.pitching || []) {
      const { entry, own, sums } = appearance(row);
      entry.pit = row;
      for (const target of sums) addInto(target.pit, row, PIT_KEYS);
      for (const target of own) target.gp++;
    }
  }

  // Ready-made season lines. Nobody counted games for these, so games stay unknown.
  for (const row of totals) {
    const P = playerRec(row.p);
    const targets = [P, splitRec(P, row.team), teamRec(row.team)];
    for (const target of targets) {
      addInto(target.bat, row.bat, BAT_KEYS);
      addInto(target.pit, row.pit, PIT_KEYS);
      target.tracked = tracked;
      target.g = null;
      target.gp = null;
    }
  }
  // hasResults: there are scores to show. countsGames: games played per player are known.
  return { games, teams, players, hasResults: games.length > 0, countsGames: games.length > 0 && !ledger };
}

// How much of a season's schedule has a result on the site.
export function scheduleProgress(season) {
  const scheduled = season.schedule.reduce((n, wk) => n + wk.series.reduce((m, s) => m + (s.games || 1), 0), 0);
  return { played: season.reg.games.length, scheduled, partial: scheduled > 0 && season.reg.games.length > 0 && season.reg.games.length < scheduled };
}

// Did this player pitch? Works for totals seasons too, where games pitched is unknown.
export const pitched = (rec) => (rec.gp || 0) > 0 || Object.keys(rec.pit || {}).length > 0;

// Has this player played enough to appear on a rate-stat leader board?
export function isQualified(rec, stats, league, kind) {
  const q = league.qualifiers || {};
  const teamGames = stats.teams.get(rec.teamId)?.g || 0;
  if (!teamGames) {
    // No game counts to measure against: ask for half the league leader's plate appearances.
    if (kind === 'pit') return true;
    stats.mostPA ??= Math.max(0, ...[...stats.players.values()].map((p) => p.bat.pa || 0));
    return (rec.bat.pa || 0) >= stats.mostPA / 2;
  }
  if (kind === 'pit') return (rec.pit.outs || 0) / 3 >= (q.ipPerTeamGame ?? 1) * teamGames;
  return (rec.bat.pa || 0) >= (q.paPerTeamGame ?? 1) * teamGames;
}

// Positions played, most common first: "SS, 2B".
export const positions = (rec) =>
  Object.entries(rec.pos || {})
    .sort((a, b) => b[1] - a[1])
    .map((x) => x[0]);

// Who a position's vote sends to the All-Star team: the top "seats" vote-getters,
// plus anyone tied with the last of them. A pick can instead name its All-Stars
// outright in "picked", which settles a tie the way the league actually did.
export function allStarsAt(pick, seats = 1) {
  const sorted = [...pick.votes].sort((a, b) => b.n - a.n);
  if (pick.picked) return sorted.filter((v) => pick.picked.includes(v.p));
  const cut = sorted[Math.min(seats, sorted.length) - 1]?.n ?? 0;
  return sorted.filter((v) => v.n >= cut);
}

// The teams that belong to a season: every team with stats in it, plus teams
// signed up for it that have not played yet. A team with a "seasons" list
// belongs only to those seasons; one without belongs to the current season.
export function teamsIn(model, season) {
  const ids = new Set([...season.reg.teams.keys(), ...season.post.teams.keys()]);
  for (const t of model.teams.values()) {
    const member = t.seasons ? t.seasons.includes(season.id) : season.id === model.league.currentSeason && t.active !== false;
    if (member) ids.add(t.id);
  }
  return [...ids].map((id) => model.team(id));
}

// Game files and the draft name a Mii by its shirt ("Red Mii (F)"); the season
// file's "miiNames" ({ "Red Mii (F)": "May" }) says who wore it that season.
// Renaming the whole file covers games, the draft, moves and rosters alike.
function withMiiNames(file) {
  const names = file.miiNames || {};
  if (!Object.keys(names).length) return file;
  const rename = (v) =>
    typeof v === 'string' ? names[v] ?? v
      : Array.isArray(v) ? v.map(rename)
        : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rename(x)]))
          : v;
  const { miiNames, ...rest } = file;
  return { ...rename(rest), miiNames };
}

export function buildLeague({ league, teams = [], players = {}, articles = [], authors = [], posts = [], seasons = {} }) {
  // Each story carries its writer's picture, from data/authors.json.
  const writer = new Map(authors.map((a) => [slug(a.name), a]));
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  // "Name in an old file" -> "name the site uses", so one character is one player.
  const aliases = new Map(Object.entries(league.playerAliases || {}).map(([from, to]) => [slug(from), to]));
  const canon = (name) => aliases.get(slug(name)) || name;

  const model = {
    league,
    teams: teamMap,
    team: (id) => teamMap.get(id) || { id, name: id || 'Unknown team', abbr: '???', gm: '', colors: ['#4a5473', '#fffcf1'], missing: true },
    canon,
    articles: [...articles]
      .map((a) => ({ ...a, authorPicture: a.author ? writer.get(slug(a.author))?.picture || '' : '' }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    // Social posts, newest first (posts.json lists the newest first within a day).
    posts: posts.map((p, i) => ({ ...p, order: i })).sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.order - b.order),
    seasons: [],
    players: new Map(),
  };

  for (const meta of league.seasons || []) {
    const file = withMiiNames(seasons[meta.id] || {});
    const games = sortGames(file.games || []);
    // Slots for playoff games a series never needed ("notPlayed") are shown on
    // the Scores page so nobody can count games, but they count for nothing.
    const played = games.filter((g) => !g.notPlayed);
    const season = {
      ...meta,
      games,
      note: file.note || '',
      tracked: file.tracked || null,
      allStars: file.allStars || null,
      awards: file.awards || [],
      schedule: file.schedule || [],
      // The draft ({ round, pick, team, p }), in-season moves ({ deal, when, p,
      // from, to }, "" being free agency) and end-of-season rosters.
      draft: file.draft || [],
      draftOrder: file.draftOrder || [],
      draftRounds: file.draftRounds || 0,
      draftNote: file.draftNote || '',
      // The shirt color each Mii wore that season: { "Weird Al": "Pink" }, from
      // "miiColors" or read off the "miiNames" labels.
      miiColors: {
        ...Object.fromEntries(Object.entries(file.miiNames || {}).map(([label, name]) => [name, label.replace(/ Mii \([MF]\)$/, '')])),
        ...file.miiColors,
      },
      moves: file.moves || [],
      rosters: file.rosters || [],
      format: file.format || '',
      // Before a season starts: a note on where things stand, clubs not yet
      // announced ({ gm, label, note }), and whether it uses the league's groups.
      preseason: file.preseason || '',
      pending: file.pending || [],
      ungrouped: file.groups === false,
      reg: buildStats(played.filter((g) => g.type !== 'playoffs'), { totals: file.totals, tracked: file.tracked, canon }),
      post: buildStats(played.filter((g) => g.type === 'playoffs'), { canon }),
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
            honors: [],
            career: { reg: { ...blankLine(), parts: [] }, post: { ...blankLine(), parts: [] } },
            last: null,
          });
        }
        const P = model.players.get(rec.slug);
        let row = P.seasons.find((x) => x.season === season);
        if (!row) P.seasons.push((row = { season, reg: null, post: null }));
        row[part] = rec;
        row.teamId = rec.teamId; // the team they finished the season with

        const total = P.career[part];
        total.parts.push(rec);
        total.g += rec.g || 0;
        total.gp += rec.gp || 0;
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

    // A season with a draft lists everyone, played or not: drafted or signed
    // players with no stat line, and every other character in the game (named in
    // data/players.json), who spent the season as free agents.
    if (season.draft.length) {
      const names = new Map();
      const add = (name) => {
        const c = canon(name);
        if (!names.has(slug(c))) names.set(slug(c), c);
      };
      for (const d of season.draft) add(d.p);
      for (const m of season.moves) add(m.p);
      for (const r of season.rosters) [...r.lineup.map((l) => l.p), ...r.bench].forEach(add);
      for (const [s, i] of Object.entries(players)) if (i.name && !names.has(s)) names.set(s, i.name);
      const same = (a, s) => slug(canon(a)) === s;
      for (const [s, name] of names) {
        if (!model.players.has(s)) {
          model.players.set(s, {
            slug: s,
            name,
            info: players[s] || {},
            seasons: [],
            stints: [],
            honors: [],
            career: { reg: { ...blankLine(), parts: [] }, post: { ...blankLine(), parts: [] } },
            last: null,
          });
        }
        const P = model.players.get(s);
        if (P.seasons.some((x) => x.season === season)) continue; // has stats already
        // Their teams that season: drafted by, then each move's new team.
        const pick = season.draft.find((d) => same(d.p, s));
        const moved = season.moves.filter((m) => same(m.p, s));
        const teams = [pick?.team, ...moved.map((m) => m.to)].filter(Boolean);
        for (const teamId of teams) {
          const lastStint = P.stints[P.stints.length - 1];
          if (lastStint?.teamId === teamId) {
            if (!lastStint.seasons.includes(season)) lastStint.seasons.push(season);
          } else {
            P.stints.push({ teamId, seasons: [season] });
          }
        }
        const roster = season.rosters.find((r) => [...r.lineup.map((l) => l.p), ...r.bench].some((p) => same(p, s)));
        // Their team: the lineup they're in, or else where the draft and moves left them.
        const teamId = roster ? roster.team : moved.length ? moved[moved.length - 1].to : pick?.team || '';
        P.seasons.push({ season, reg: null, post: null, teamId });
        P.last = { season, teamId };
      }
    }

    // Honors shown on player pages: season awards first, then All-Star selections.
    const honor = (name, title, detail = '') => model.players.get(slug(canon(name)))?.honors.push({ season, title, detail });
    for (const award of season.awards) {
      for (const winner of award.winners) if (winner.p) honor(winner.p, award.title);
    }
    for (const conf of season.allStars?.conferences || []) {
      // The league's current name for the group wins over the one written on the ballot.
      const name = (league.conferences || []).find((c) => c.id === conf.id)?.name || conf.name;
      for (const pick of conf.picks) {
        for (const v of allStarsAt(pick, season.allStars.seats)) honor(v.p, 'All-Star', `${name}, ${pick.pos}`);
      }
    }
  }

  // Career lines inherit the gaps of the seasons behind them: games are unknown
  // if any season did not count them, and a stat is only known if some season kept it.
  for (const P of model.players.values()) {
    for (const total of Object.values(P.career)) {
      if (total.parts.some((r) => r.g == null)) total.g = null;
      if (total.parts.some((r) => r.gp == null)) total.gp = null;
      if (total.parts.length && total.parts.every((r) => r.tracked)) {
        total.tracked = {
          bat: [...new Set(total.parts.flatMap((r) => r.tracked.bat || []))],
          pit: [...new Set(total.parts.flatMap((r) => r.tracked.pit || []))],
        };
      }
    }
  }
  return model;
}
