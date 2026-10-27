import { html } from '../lib/html.js';
import { C } from '../lib/statdefs.js';
import { positions, pitched, teamsIn, blankLine } from '../lib/aggregate.js';
import { seriesGames, seriesLength } from './games.js';
import { spoil, eye } from './spoilers.js';
import { draftOf, teamMoves, lineupCard, who, ordinal, freeAgentAtEnd, teamHonors } from './transactions.js';
import { gmLink } from './gms.js';
import { teamVars, pennant, playerCell, teamCell, teamLogo, standings, progressNote, seasonClubs, streakOf, tabbedStats, tiles, gameWhen, notFound, keepWords, confBadge } from './ui.js';

export function teamsView(ctx) {
  const { model, season } = ctx;
  // A season whose teams are not set yet shows the last season's clubs instead.
  const shown = season;
  const sctx = { ...ctx, season: shown };
  const any = teamsIn(model, shown).length || shown.pending.length;
  return {
    title: 'Teams',
    html: html`
      <header class="pagehead"><p class="script">${shown.name}</p><h1>Teams</h1></header>
      ${any ? seasonClubs(sctx) : html`<p class="empty">No teams yet. Come back later!</p>`}
      ${shown.reg.hasResults ? html`<section class="panel"><h2 class="panel__tab"><span>Standings</span></h2>${standings(sctx)}</section>` : ''}`,
  };
}

export function teamView(ctx, id) {
  const { model, season, league } = ctx;
  const team = model.teams.get(id);
  if (!team) return notFound('That team');
  // A team in the chosen season shows only that season. A club that is not in
  // it (one from an earlier season) shows its own last season instead.
  const member = teamsIn(model, season).some((t) => t.id === id);
  const own = [...model.seasons].reverse().find((s) => teamsIn(model, s).some((t) => t.id === id));
  const shown = member ? season : own || season;
  const S = shown.reg;
  const T = S.teams.get(id) || { g: 0, gp: 0, w: 0, l: 0, t: 0, rs: 0, ra: 0, bat: {}, pit: {}, results: [] };
  const played = S.teams.has(id) || shown.post.teams.has(id);
  const roster = [...S.players.values()]
    .filter((p) => p.byTeam.has(id))
    .map((p) => ({ ...p.byTeam.get(id), name: p.name, slug: p.slug, moved: p.teamId !== id, released: freeAgentAtEnd(model, shown, p.name) }));
  // Before the team's first game (straight after the draft), its players with an empty line each.
  if (!played) for (const P of model.players.values()) {
    const row = P.seasons.find((x) => x.season === shown);
    if (row && !row.reg && row.teamId === id) roster.push({ teamId: id, ...blankLine(), name: P.name, slug: P.slug, moved: false, released: false });
  }
  roster.sort((a, b) => a.name.localeCompare(b.name));
  // Unneeded playoff slots are listed too, so the log does not give away how long a series went.
  const unneeded = shown.games
    .filter((g) => g.notPlayed && (g.home.team === id || g.away.team === id))
    .map((game) => ({ game, home: game.home.team === id, opp: game.home.team === id ? game.away.team : game.home.team, res: 'X' }));
  const results = [...T.results, ...(shown.post.teams.get(id)?.results || []), ...unneeded].sort((a, b) => a.game.id.localeCompare(b.game.id));
  // This team's scheduled series, with the games played in each once they are in.
  const series = shown.schedule.flatMap((wk) =>
    wk.series
      .filter((s) => s.teams.includes(id))
      .map((s) => ({ week: wk.week, s, opp: model.team(s.teams.find((t) => t !== id)), games: seriesGames(shown, wk.week, s.teams) })),
  );
  const head = shown;
  // The team's draft picks and its trades and signings that season.
  const picks = draftOf(shown).filter((d) => d.team === id);
  const moves = teamMoves(model, shown, id);
  const conf = head.ungrouped ? null : (league.conferences || []).find((c) => c.id === team.conference);
  // The GM's club before this one (team "formerly"), and the one after.
  const before = team.formerly && model.teams.get(team.formerly);
  const after = [...model.teams.values()].find((t) => t.formerly === id);
  const era = league.eraInnings === 7 ? C.p_era7 : C.p_era9;
  // Where this team stands among the season's teams (lowest first when low is better).
  const everyone = [...S.teams.values()];
  const rankOf = (get, low = false) => {
    const v = get(T);
    if (v == null || !S.teams.has(id) || everyone.length < 2) return null;
    const vals = everyone.map(get).filter((x) => x != null);
    const ahead = vals.filter((x) => (low ? x < v : x > v)).length;
    return `${vals.filter((x) => x === v).length > 1 ? 'T-' : ''}${ordinal(ahead + 1)} of ${vals.length}`;
  };
  // Only the numbers this season actually recorded get a tile.
  const stat = (label, col, ranked = true) => ({ label, value: col.val(T) == null ? null : col.fmt(col.val(T)), rank: ranked ? rankOf((t) => col.val(t)) : null });
  const numbers = [
    ...(results.length
      ? [{ label: 'Record', value: `${T.w}-${T.l}${T.t ? '-' + T.t : ''}` }, { label: 'Streak', value: streakOf(T.results) }, { label: 'Runs scored', value: T.rs, rank: rankOf((t) => t.rs) }, { label: 'Runs allowed', value: T.ra, rank: rankOf((t) => t.ra, true) }]
      : []),
    stat('Team AVG', C.avg),
    stat('Team OPS', C.ops),
    stat('Home runs', C.hr),
    stat('RBI', C.rbi),
    stat('Team ERA', era, false),
  ].filter((t) => t.value != null);

  return {
    title: team.name,
    html: html`
      <header class="teamhead" style="${teamVars(team)}">
        ${teamLogo(team)}
        <div>
          <p class="teamhead__season">${head.name}${conf ? html` / ${conf.name}` : ''}</p>
          <h1>${keepWords(team.name, team.together)}</h1>
          ${team.gm ? html`<p class="teamhead__gm">General Manager <b class="teamhead__gmname">${gmLink(team.gm)}</b></p>` : ''}
          ${before ? html`<p class="teamhead__gm">Previously <a class="teamhead__chip" href="#/team/${before.id}">${pennant(before)}${before.name}</a></p>` : ''}
          ${after ? html`<p class="teamhead__gm">Now <a class="teamhead__chip" href="#/team/${after.id}">${pennant(after)}${after.name}</a></p>` : ''}
          ${teamHonors(model, id).map((h) => html`<p class="teamhead__honor"><a href="${h.href}">${h.label}</a></p>`)}
          ${team.blurb ? html`<p class="teamhead__blurb">${team.blurb}</p>` : ''}
        </div>
      </header>
      ${played ? tiles(numbers) : ''}
      ${results.length ? progressNote(shown) : ''}
      ${shown.rosters.some((r) => r.team === id)
        ? html`<section class="panel">
            <h2 class="panel__tab"><span>${shown.id === league.currentSeason ? 'Lineup' : 'End-of-Season Lineup'}</span></h2>
            ${lineupCard(model, shown, id)}
          </section>`
        : ''}
      <section class="panel">
        <h2 class="panel__tab"><span>Roster & Stats</span></h2>
        <div data-roster></div>
        ${shown.note ? html`<p class="note">${shown.note}</p>` : ''}
      </section>
      ${series.length
        ? html`<section class="panel">
            <h2 class="panel__tab"><span>Schedule</span></h2>
            <div class="tbl"><table class="st st--log">
              <thead><tr><th class="lead">Week</th><th class="lead">Opponent</th><th class="lead">Stadium</th><th class="lead">Games</th></tr></thead>
              <tbody>${series.map(({ week, s, opp, games }) => html`<tr>
                <td class="lead">Week ${week}</td>
                <td class="lead">${s.home ? html`<span class="vs vs--at">${s.home === id ? 'vs' : '@'}</span>` : ''}${teamCell(opp)}${confBadge({ ...ctx, season: shown }, id, opp.id)}</td>
                <td class="lead">${s.stadium || ''}</td>
                <td class="lead">${games.length
                  ? html`${games.map((g, i) => {
                      const mine = g.home.team === id ? g.home : g.away;
                      const theirs = g.home.team === id ? g.away : g.home;
                      return html`${i ? ', ' : ''}<a class="${spoil(g.id)}" data-spoil="${g.id}" href="#/game/${g.id}"><span class="sp sp--wide"><b class="res res--${mine.score > theirs.score ? 'W' : 'L'}">${mine.score > theirs.score ? 'W' : 'L'}</b> ${mine.score}-${theirs.score}</span></a>`;
                    })} ${eye(games.map((g) => g.id), `Week ${week} results`)}`
                  : seriesLength(s) || '1 game'}</td>
              </tr>`)}</tbody>
            </table></div>
          </section>`
        : ''}
      ${results.length
        ? html`<section class="panel">
            <h2 class="panel__tab"><span>Game Log</span></h2>
            <div class="tbl"><table class="st st--log">
              <thead><tr><th class="lead">Game</th><th class="lead">Opponent</th><th class="lead">Result</th><th></th></tr></thead>
              <tbody>${results.map((r) => html`<tr class="${spoil(r.game.id)}" data-spoil="${r.game.id}">
                <td class="lead">${gameWhen(r.game)}</td>
                <td class="lead"><span class="vs">${r.home ? 'vs' : 'at'}</span> ${teamCell(model.team(r.opp))}</td>
                <td class="lead">${eye(r.game.id)} <span class="sp sp--wide">${r.game.notPlayed ? 'Not played' : html`<b class="res res--${r.res}">${r.res}</b> ${r.rf}-${r.ra}`}</span>${r.game.type === 'playoffs' ? html` <i class="tag">Playoffs</i>` : ''}</td>
                <td><a href="#/game/${r.game.id}">Box score</a></td>
              </tr>`)}</tbody>
            </table></div>
          </section>`
        : ''}
      ${picks.length || moves.length
        ? html`<section class="panel">
            <h2 class="panel__tab"><span>Draft & Moves</span></h2>
            <div class="dm">
              ${picks.length
                ? html`<div><h3 class="story-season">Draft</h3><ol class="story-lines">${picks.map((d) => html`<li><b>Round ${d.round}, Pick ${d.pick}</b> (${ordinal(d.overall)} overall): ${who(model, d.p)}</li>`)}</ol></div>`
                : ''}
              ${moves.length
                ? html`<div><h3 class="story-season">Moves</h3><ul class="story-lines">${moves.map((m) => html`<li><b>${m.when}:</b> ${m.text}</li>`)}</ul></div>`
                : ''}
            </div>
            ${picks.length ? html`<p class="more"><a href="#/draft?season=${shown.id}">Full draft</a></p>` : ''}
          </section>`
        : ''}`,
    mount(root) {
      tabbedStats(root.querySelector('[data-roster]'), {
        tracked: shown.tracked,
        hideGames: !S.countsGames,
        rows: (view) => (view === 'pitching' ? roster.filter(pitched) : roster),
        lead: () => [
          { id: 'name', label: 'Player', sort: (r) => r.name, cell: (r) => playerCell(r.name, r.released ? html`<i class="tag tag--fa">Released</i>` : r.moved ? html`<i class="tag">Moved on</i>` : '') },
          // Positions come from game files, so seasons recorded as totals have none to show.
          ...(shown.tracked ? [] : [{ id: 'pos', label: 'Pos', sort: (r) => positions(r).join(), cell: (r) => positions(r).slice(0, 2).join(', ') }]),
        ],
        sortBy: { batting: 'avg', pitching: 'p_k' },
        foot: () => ({ label: 'Team totals', row: T }),
        empty: 'No stats yet. Come back later!',
      });
    },
  };
}
