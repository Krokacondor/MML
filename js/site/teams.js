import { html } from '../lib/html.js';
import { C } from '../lib/statdefs.js';
import { positions, pitched, teamsIn } from '../lib/aggregate.js';
import { seriesGames, seriesLength } from './games.js';
import { spoil, eye } from './spoilers.js';
import { teamVars, playerCell, teamCell, teamLogo, teamCard, standings, progressNote, byConference, confHead, streakOf, tabbedStats, tiles, gameWhen, notFound, lastSeasonWith } from './ui.js';

export function teamsView(ctx) {
  const { model, season } = ctx;
  // A season whose teams are not set yet shows the last season's clubs instead.
  const shown = lastSeasonWith(model, season, (s) => teamsIn(model, s).length > 0);
  const sctx = { ...ctx, season: shown };
  const groups = byConference(sctx);
  return {
    title: 'Teams',
    html: html`
      <header class="pagehead"><p class="script">${shown.name}</p><h1>Teams</h1></header>
      ${shown !== season ? html`<p class="banner"><b>${season.name} teams are not set yet.</b> These are the ${shown.name} clubs.</p>` : ''}
      ${groups.length
        ? groups.map(({ conf, teams }) => html`${confHead(conf)}<div class="teamgrid">${teams.map((t) => teamCard(sctx, t))}</div>`)
        : html`<p class="empty">No teams yet. They appear here after the first game is uploaded.</p>`}
      ${shown.reg.hasResults ? html`<section class="panel"><h2 class="panel__tab"><span>Standings</span></h2>${standings(sctx)}</section>` : ''}`,
  };
}

export function teamView(ctx, id) {
  const { model, season, league } = ctx;
  const team = model.teams.get(id);
  if (!team) return notFound('That team');
  // A team that has not played in the chosen season shows its most recent one.
  const shown = lastSeasonWith(model, season, (s) => s.reg.teams.has(id) || s.post.teams.has(id));
  const S = shown.reg;
  const T = S.teams.get(id) || { g: 0, gp: 0, w: 0, l: 0, t: 0, rs: 0, ra: 0, bat: {}, pit: {}, results: [] };
  const played = S.teams.has(id) || shown.post.teams.has(id);
  const roster = [...S.players.values()]
    .filter((p) => p.byTeam.has(id))
    .map((p) => ({ ...p.byTeam.get(id), name: p.name, slug: p.slug, moved: p.teamId !== id }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
  const conf = (league.conferences || []).find((c) => c.id === team.conference);
  const era = league.eraInnings === 7 ? C.p_era7 : C.p_era9;
  // Only the numbers this season actually recorded get a tile.
  const stat = (label, col) => ({ label, value: col.val(T) == null ? null : col.fmt(col.val(T)) });
  const numbers = [
    ...(results.length
      ? [{ label: 'Record', value: `${T.w}-${T.l}${T.t ? '-' + T.t : ''}` }, { label: 'Streak', value: streakOf(T.results) }, { label: 'Runs scored', value: T.rs }, { label: 'Runs allowed', value: T.ra }]
      : []),
    stat('Team AVG', C.avg),
    stat('Team OPS', C.ops),
    stat('Home runs', C.hr),
    stat('RBI', C.rbi),
    stat('Team ERA', era),
  ].filter((t) => t.value != null);

  return {
    title: team.name,
    html: html`
      <header class="teamhead" style="${teamVars(team)}">
        ${teamLogo(team)}
        <div>
          <p class="teamhead__season">${shown.name}${conf ? html` / ${conf.name}` : ''}</p>
          <h1>${team.name}</h1>
          ${team.gm ? html`<p class="teamhead__gm">General Manager <b>${team.gm}</b></p>` : ''}
          ${shown.awards
            .filter((a) => a.winners.some((w) => w.gm && w.team === id))
            .map((a) => html`<p class="teamhead__honor"><a href="#/awards">${shown.name} ${a.title}</a></p>`)}
          ${team.blurb ? html`<p class="teamhead__blurb">${team.blurb}</p>` : ''}
        </div>
      </header>
      ${shown !== season ? html`<p class="banner"><b>${team.name} has no ${season.name} games yet.</b> Showing ${shown.name}.</p>` : ''}
      ${played ? tiles(numbers) : ''}
      ${results.length ? progressNote(shown) : ''}
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
                <td class="lead">${teamCell(opp)}</td>
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
            ${shown.format ? html`<p class="note">${shown.format}</p>` : ''}
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
        : ''}`,
    mount(root) {
      tabbedStats(root.querySelector('[data-roster]'), {
        tracked: shown.tracked,
        hideGames: !S.countsGames,
        rows: (view) => (view === 'pitching' ? roster.filter(pitched) : roster),
        lead: () => [
          { id: 'name', label: 'Player', sort: (r) => r.name, cell: (r) => playerCell(r.name, r.moved ? html`<i class="tag">Moved on</i>` : '') },
          // Positions come from game files, so seasons recorded as totals have none to show.
          ...(shown.tracked ? [] : [{ id: 'pos', label: 'Pos', sort: (r) => positions(r).join(), cell: (r) => positions(r).slice(0, 2).join(', ') }]),
        ],
        sortBy: { batting: 'avg', pitching: 'p_k' },
        foot: () => ({ label: 'Team totals', row: T }),
        empty: `No stats for ${team.name} in ${shown.name} yet.`,
      });
    },
  };
}
