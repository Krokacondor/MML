import { html } from '../lib/html.js';
import { RATES, fmtAvg, fmt2 } from '../lib/statdefs.js';
import { positions } from '../lib/aggregate.js';
import { teamVars, playerCell, teamCell, standings, standingsRows, streakOf, tabbedStats, tiles, fmtDate, notFound } from './ui.js';

export function teamsView(ctx) {
  const rows = standingsRows(ctx);
  return {
    title: 'Teams',
    html: html`
      <header class="pagehead"><p class="script">${ctx.season.name}</p><h1>Teams</h1></header>
      ${rows.length
        ? html`<div class="teamgrid">${rows.map(
            (r) => html`<a class="teamcard" href="#/team/${r.team.id}" style="${teamVars(r.team)}">
              <span class="teamcard__abbr">${r.team.abbr}</span>
              <span class="teamcard__name">${r.team.name}</span>
              <span class="teamcard__gm">GM: ${r.team.gm || 'Open seat'}</span>
              <span class="teamcard__rec">${r.w}-${r.l}</span>
            </a>`,
          )}</div>`
        : ''}
      <section class="panel"><h2 class="panel__tab"><span>Standings</span></h2>${standings(ctx)}</section>`,
  };
}

export function teamView(ctx, id) {
  const { model, season } = ctx;
  const team = model.teams.get(id);
  if (!team) return notFound('That team');
  const S = season.reg;
  const T = S.teams.get(id) || { g: 0, gp: 0, w: 0, l: 0, t: 0, rs: 0, ra: 0, bat: {}, pit: {}, results: [] };
  const roster = [...S.players.values()]
    .filter((p) => p.byTeam.has(id))
    .map((p) => ({ ...p.byTeam.get(id), name: p.name, slug: p.slug, moved: p.teamId !== id }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const results = [...T.results, ...(season.post.teams.get(id)?.results || [])];
  const era = model.league.eraInnings === 7 ? RATES.era7(T.pit) : RATES.era9(T.pit);

  return {
    title: team.name,
    html: html`
      <header class="teamhead" style="${teamVars(team)}">
        <span class="teamhead__abbr">${team.abbr}</span>
        <div>
          <p class="teamhead__season">${season.name}</p>
          <h1>${team.name}</h1>
          <p class="teamhead__gm">General Manager <b>${team.gm || 'Open seat'}</b></p>
          ${team.blurb ? html`<p class="teamhead__blurb">${team.blurb}</p>` : ''}
        </div>
      </header>
      ${tiles([
        { label: 'Record', value: `${T.w}-${T.l}${T.t ? '-' + T.t : ''}` },
        { label: 'Streak', value: streakOf(T.results) },
        { label: 'Runs scored', value: T.rs },
        { label: 'Runs allowed', value: T.ra },
        { label: 'Team AVG', value: fmtAvg(RATES.avg(T.bat)) },
        { label: 'Team OPS', value: fmtAvg(RATES.ops(T.bat)) },
        { label: 'Team ERA', value: fmt2(era) },
      ])}
      <section class="panel">
        <h2 class="panel__tab"><span>Roster & Stats</span></h2>
        <div data-roster></div>
      </section>
      <section class="panel">
        <h2 class="panel__tab"><span>Game Log</span></h2>
        ${results.length
          ? html`<div class="tbl"><table class="st st--log">
              <thead><tr><th class="lead">Date</th><th class="lead">Opponent</th><th class="lead">Result</th><th></th></tr></thead>
              <tbody>${results.map((r) => html`<tr>
                <td class="lead">${fmtDate(r.game.date)}</td>
                <td class="lead"><span class="vs">${r.home ? 'vs' : 'at'}</span> ${teamCell(model.team(r.opp))}</td>
                <td class="lead"><b class="res res--${r.res}">${r.res}</b> ${r.rf}-${r.ra}${r.game.type === 'playoffs' ? html` <i class="tag">Playoffs</i>` : ''}</td>
                <td><a href="#/game/${r.game.id}">Box score</a></td>
              </tr>`)}</tbody>
            </table></div>`
          : html`<p class="empty">${team.name} has not played in ${season.name} yet.</p>`}
      </section>`,
    mount(root) {
      tabbedStats(root.querySelector('[data-roster]'), {
        rows: (view) => (view === 'pitching' ? roster.filter((r) => r.gp > 0) : roster),
        lead: () => [
          { id: 'name', label: 'Player', sort: (r) => r.name, cell: (r) => playerCell(r.name, r.moved ? html`<i class="tag">Moved on</i>` : '') },
          { id: 'pos', label: 'Pos', sort: (r) => positions(r).join(), cell: (r) => positions(r).slice(0, 2).join(', ') },
        ],
        foot: () => ({ label: 'Team totals', row: T }),
        empty: `No stats for ${team.name} in ${season.name} yet.`,
      });
    },
  };
}
