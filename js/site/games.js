import { html, slug } from '../lib/html.js';
import { COLSETS, BAT_KEYS } from '../lib/statdefs.js';
import { teamVars, pennant, playerCell, lineScore, scoreCard, tabbedStats, renderTable, fmtDate, notFound } from './ui.js';

export function gamesView(ctx) {
  const { model, season } = ctx;
  const byDate = new Map();
  for (const g of [...season.games].reverse()) {
    if (!byDate.has(g.date)) byDate.set(g.date, []);
    byDate.get(g.date).push(g);
  }
  return {
    title: 'Scores',
    html: html`
      <header class="pagehead"><p class="script">${season.name}</p><h1>Scores</h1></header>
      ${byDate.size
        ? [...byDate].map(
            ([date, games]) => html`<section class="day">
              <h2 class="day__date">${fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h2>
              <div class="scores scores--grid">${games.map((g) => scoreCard(g, model))}</div>
            </section>`,
          )
        : html`<p class="empty">No games have been played in ${season.name} yet.</p>`}`,
  };
}

const total = (rows, keys) => {
  const sum = {};
  for (const row of rows) for (const k of keys) if (row[k]) sum[k] = (sum[k] || 0) + row[k];
  return sum;
};

export function gameView(ctx, id) {
  const { model } = ctx;
  const game = model.seasons.flatMap((s) => s.games).find((g) => g.id === id);
  if (!game) return notFound('That game');
  const season = model.seasons.find((s) => s.games.includes(game));
  const sides = [['a', game.away, game.home], ['h', game.home, game.away]];
  const teamOf = { a: model.team(game.away.team), h: model.team(game.home.team) };
  const head = (side, other) => {
    const team = model.team(side.team);
    return html`<a class="matchup__team ${side.score > other.score ? 'is-win' : ''}" href="#/team/${team.id}" style="${teamVars(team)}">
      <span class="matchup__abbr">${team.abbr}</span><span class="matchup__name">${team.name}</span><b>${side.score}</b>
    </a>`;
  };
  const settings = Object.entries(game.settings || {});

  return {
    title: `${teamOf.a.name} at ${teamOf.h.name}`,
    html: html`
      <header class="matchup">
        ${head(game.away, game.home)}
        <span class="matchup__at">at</span>
        ${head(game.home, game.away)}
      </header>
      <p class="gamemeta">
        <b>Final</b> ${fmtDate(game.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        <span>${season.name}${game.type === 'playoffs' ? ', Playoffs' : ''}</span>
        ${game.stadium ? html`<span>${game.stadium}</span>` : ''}
        ${settings.map(([k, v]) => html`<span>${k}: ${v}</span>`)}
      </p>
      ${lineScore(game, model)}
      ${sides.map(
        ([t]) => html`<section class="panel">
          <h2 class="panel__tab" style="${teamVars(teamOf[t])}"><span>${teamOf[t].name}</span></h2>
          <div data-box="${t}"></div>
        </section>`,
      )}
      <section class="panel"><h2 class="panel__tab"><span>Pitching</span></h2><div data-pitching></div></section>`,
    mount(root) {
      for (const [t] of sides) {
        const rows = (game.batting || []).filter((r) => r.t === t).map((r) => ({ name: r.p, slug: slug(r.p), pos: r.pos || '', bat: r }));
        tabbedStats(root.querySelector(`[data-box="${t}"]`), {
          views: ['batting', 'sluggers', 'fielding'],
          hideGames: true,
          rows: () => rows,
          lead: () => [
            { id: 'name', label: 'Player', cell: (r) => playerCell(r.name) },
            { id: 'pos', label: 'Pos', cell: (r) => r.pos },
          ],
          foot: () => ({ label: 'Team totals', row: { bat: total(rows.map((r) => r.bat), BAT_KEYS) } }),
        });
      }
      const pitchers = (game.pitching || []).map((r) => ({ name: r.p, team: teamOf[r.t], pit: r }));
      renderTable(root.querySelector('[data-pitching]'), {
        lead: [
          { id: 'name', label: 'Pitcher', cell: (r) => playerCell(r.name) },
          { id: 'team', label: 'Team', cell: (r) => pennant(r.team) },
        ],
        cols: COLSETS.pitching.cols.filter((c) => c.id !== 'gp'),
        rows: pitchers,
        empty: 'No pitching stats were recorded for this game.',
      });
    },
  };
}
