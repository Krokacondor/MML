import { html, slug } from '../lib/html.js';
import { BAT_KEYS, viewsFor, colsFor } from '../lib/statdefs.js';
import { scheduleProgress } from '../lib/aggregate.js';
import { teamVars, pennant, playerCell, teamCell, lineScore, scoreCard, tabbedStats, renderTable, fmtDate, notFound, runs, finalWord, confBadge } from './ui.js';
import { spoil, eye } from './spoilers.js';

// The games played between two teams in one scheduled week.
export const seriesGames = (season, week, teams) =>
  season.games.filter((g) => g.week === week && [g.away.team, g.home.team].sort().join() === [...teams].sort().join());

// "3-game series", or nothing for a single game.
export const seriesLength = (s) => (s.games > 1 ? `${s.games}-game series` : '');

export function gamesView(ctx) {
  const { model, season } = ctx;
  const listed = new Set();

  // Each heading gets an eye that uncovers every game under it at once.
  const head = (title, games) =>
    html`<h2 class="day__date">${title}${games.length ? eye(games.map((g) => g.id), `${title} scores`) : ''}</h2>`;

  // The schedule, week by week, with each series' results under it once they are in.
  const weeks = season.schedule.map((wk) => {
    const inWeek = wk.series.map((s) => seriesGames(season, wk.week, s.teams));
    for (const g of inWeek.flat()) listed.add(g);
    return html`<section class="day">
      ${head(`Week ${wk.week}`, inWeek.flat())}
      <div class="serieses">${wk.series.map((s, i) => html`<div class="series">${confBadge(ctx, s.teams[0], s.teams[1])}
        <div class="series__teams">${teamCell(model.team(s.teams[0]))}<span class="vs">${s.home ? '@' : 'vs'}</span>${teamCell(model.team(s.teams[1]))}</div>
        <p class="series__where">${[s.stadium, seriesLength(s)].filter(Boolean).join(' / ')}</p>
        ${inWeek[i].length ? html`<div class="scores">${inWeek[i].map((g) => scoreCard(g, model))}</div>` : ''}
      </div>`)}</div>
    </section>`;
  });

  // Everything not tied to the schedule: newest first, by week when games carry
  // one, otherwise by date. Playoff rounds come after the schedule, in game order.
  const rest = season.games.filter((x) => !listed.has(x));
  const isRound = (g) => g.type === 'playoffs' && !g.date;
  const group = (games, keyOf) => {
    const groups = new Map();
    for (const g of games) {
      const key = keyOf(g);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(g);
    }
    return [...groups].map(([heading, list]) => html`<section class="day">
      ${head(heading, list)}
      <div class="scores scores--grid">${list.map((g) => scoreCard(g, model))}</div>
    </section>`);
  };
  const loose = group(rest.filter((g) => !isRound(g)).reverse(), (g) =>
    g.week ? `Week ${g.week}` : fmtDate(g.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) || 'Other games');
  const rounds = group(rest.filter(isRound).sort((a, b) => (a.n || 0) - (b.n || 0)), (g) => `Playoffs${g.round ? `: ${g.round}` : ''}`);

  const { played, scheduled, partial } = scheduleProgress(season);
  const soFar = partial ? (season.tracked ? `Results are still being entered: ${played} of ${scheduled} games so far.` : `${played} of ${scheduled} scheduled games have been played.`) : '';
  const about = season.games.length || weeks.length ? [season.format, soFar].filter(Boolean).join(' ') : 'Come back later!';
  return {
    title: weeks.length ? 'Schedule' : 'Scores',
    html: html`
      <header class="pagehead"><p class="script">${season.name}</p><h1>${weeks.length ? 'Schedule & Scores' : 'Scores'}</h1></header>
      ${about ? html`<p class="banner"><b>${season.games.length || weeks.length ? `About ${season.name}.` : `${season.name} has no games yet.`}</b> ${about}</p>` : ''}
      ${season.games.length
        ? html`<p class="spoilnote">Scores are hidden. ${eye(season.games.map((g) => g.id), 'every score')} <span>Every score</span></p>`
        : ''}
      ${loose}${weeks}${rounds}`,
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
      <span class="matchup__abbr">${team.abbr}</span><span class="matchup__name">${team.name}</span><b class="sp">${runs(side)}</b>
    </a>`;
  };
  const settings = Object.entries(game.settings || {});
  // A season recorded as totals only shows the stats it kept, and has no positions.
  const tracked = season.tracked;
  const hasBox = (game.batting || []).length > 0;
  const unknownInning = [game.away, game.home].some((s) => (s.line || []).some((v) => v == null));

  return {
    title: `${teamOf.a.name} at ${teamOf.h.name}`,
    // Everything that gives the result away sits inside one spoiler block.
    html: html`<div class="${spoil(game.id)}" data-spoil="${game.id}">
      <header class="matchup">
        ${head(game.away, game.home)}
        <span class="matchup__at">at</span>
        ${head(game.home, game.away)}
      </header>
      <p class="gamemeta">
        ${eye(game.id)}<b>${finalWord(game)}</b> ${fmtDate(game.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        <span>${season.name}${game.type === 'playoffs' ? `, Playoffs${game.round ? `, ${game.round}` : ''}` : ''}${game.week ? `, Week ${game.week}` : ''}${game.n ? `, Game ${game.n}` : ''}</span>
        ${game.stadium ? html`<span class="${game.type === 'playoffs' ? 'only-shown' : ''}">${game.stadium}</span>` : ''}
        ${settings.map(([k, v]) => html`<span>${k}: ${v}</span>`)}
      </p>
      ${lineScore(game, model)}
      ${unknownInning ? html`<p class="note">An inning marked ? is one the league has no record of.</p>` : ''}
      ${hasBox
        ? html`${sides.map(
            ([t]) => html`<section class="panel">
              <h2 class="panel__tab" style="${teamVars(teamOf[t])}"><span>${teamOf[t].name}</span></h2>
              <div class="sp-box" data-box="${t}"></div>
            </section>`,
          )}
          <section class="panel"><h2 class="panel__tab"><span>Pitching</span></h2><div class="sp-box" data-pitching></div></section>`
        : html`<div class="sp-box"><p class="empty">${game.notPlayed
            ? 'This game was not needed.'
            : 'No box score for this game.'}</p></div>`}
    </div>`,
    mount(root) {
      if (!hasBox) return;
      for (const [t] of sides) {
        const rows = (game.batting || []).filter((r) => r.t === t).map((r) => ({ name: r.p, slug: slug(r.p), pos: r.pos || '', bat: r, tracked }));
        tabbedStats(root.querySelector(`[data-box="${t}"]`), {
          tracked,
          views: viewsFor(tracked).filter((v) => v !== 'pitching'),
          hideGames: true,
          rows: () => rows,
          lead: () => [
            { id: 'name', label: 'Player', cell: (r) => playerCell(r.name) },
            ...(tracked ? [] : [{ id: 'pos', label: 'Pos', cell: (r) => r.pos }]),
          ],
          foot: () => ({ label: 'Team totals', row: { bat: total(rows.map((r) => r.bat), BAT_KEYS), tracked } }),
        });
      }
      const pitchers = (game.pitching || []).map((r) => ({ name: r.p, team: teamOf[r.t], pit: r, tracked }));
      renderTable(root.querySelector('[data-pitching]'), {
        lead: [
          { id: 'name', label: 'Pitcher', cell: (r) => playerCell(r.name) },
          { id: 'team', label: 'Team', cell: (r) => pennant(r.team) },
        ],
        cols: colsFor('pitching', tracked, true),
        rows: pitchers,
        empty: 'No pitching stats for this game.',
      });
    },
  };
}
