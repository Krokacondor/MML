import { html } from '../lib/html.js';
import { C, viewsFor } from '../lib/statdefs.js';
import { positions, pitched } from '../lib/aggregate.js';
import { mug, portrait, pennant, teamVars, teamCell, tabbedStats, tiles, gameWhen, notFound, lastSeasonWith } from './ui.js';
import { spoil, eye } from './spoilers.js';

export function playersView(ctx) {
  const { model } = ctx;
  const all = [...model.players.values()].sort((a, b) => a.name.localeCompare(b.name));
  const card = (P) => {
    const team = model.team(P.last.teamId);
    return html`<a class="pcard" href="#/player/${P.slug}" style="${teamVars(team)}" data-name="${P.name.toLowerCase()} ${team.name.toLowerCase()} ${String(team.abbr || '').toLowerCase()}">
      ${mug(P.name, { size: 48, plate: true })}
      <span class="pcard__name">${P.name}</span>
      <span class="pcard__team">${pennant(team)}${positions(P.career.reg).slice(0, 2).join(' / ')}</span>
    </a>`;
  };
  return {
    title: 'Players',
    html: html`
      <header class="pagehead pagehead--row">
        <div><p class="script">Every one of them</p><h1>Players</h1></div>
        <input class="search" type="search" placeholder="Find a player or team" aria-label="Find a player or team" data-find>
      </header>
      ${all.length
        ? html`<div class="pgrid">${all.map(card)}</div><p class="empty" data-none hidden>No players match that search.</p>`
        : html`<p class="empty">Players appear here after the first game is uploaded.</p>`}`,
    mount(root) {
      const find = root.querySelector('[data-find]');
      find.oninput = () => {
        const want = find.value.trim().toLowerCase();
        let shown = 0;
        for (const el of root.querySelectorAll('.pcard')) {
          el.hidden = !el.dataset.name.includes(want);
          if (!el.hidden) shown++;
        }
        const none = root.querySelector('[data-none]');
        if (none) none.hidden = shown > 0;
      };
    },
  };
}

export function playerView(ctx, id) {
  const { model, season, league } = ctx;
  const P = model.players.get(id);
  if (!P) return notFound('That player');
  const team = model.team(P.last.teamId);
  // A player who has not played in the chosen season shows their most recent one.
  const shown = lastSeasonWith(model, season, (s) => P.seasons.some((x) => x.season === s && x.reg));
  const now = P.seasons.find((x) => x.season === shown);
  const cur = now?.reg;
  const career = P.career.reg;
  const hasPost = P.seasons.some((x) => x.post);
  const era = league.eraInnings === 7 ? C.p_era7 : C.p_era9;
  // Career tables only offer the views, and columns, that at least one of the player's seasons recorded.
  const kept = career.tracked || null;
  const views = viewsFor(kept).filter((v) => v !== 'pitching' || pitched(career) || pitched(P.career.post));
  const info = P.info || {};
  // Only games with the player's own stat line (Season 2: Week 1).
  const log = [...(cur?.log || []), ...(now?.post?.log || [])];

  // One row per season and team, plus a season total when a player changed teams.
  const seasonRows = (part) => (view) => {
    const rows = [];
    for (const entry of P.seasons) {
      const rec = entry[part];
      if (!rec) continue;
      for (const split of rec.byTeam.values()) rows.push({ ...split, season: entry.season });
      if (rec.byTeam.size > 1) rows.push({ ...rec, teamId: null, season: entry.season, rowClass: 'is-total' });
    }
    return view === 'pitching' ? rows.filter(pitched) : rows;
  };
  const seasonLead = () => [
    { id: 'season', label: 'Season', cell: (r) => r.season.name },
    { id: 'team', label: 'Team', cell: (r) => (r.teamId ? teamCell(model.team(r.teamId)) : html`<b>Season total</b>`) },
  ];

  const logRows = (view) =>
    log
      .filter((e) => (view === 'pitching' ? e.pit : e.bat))
      .map((e) => {
        const home = e.game.home.team === e.teamId;
        return {
          game: e.game, home, opp: model.team(home ? e.game.away.team : e.game.home.team),
          mine: home ? e.game.home : e.game.away, theirs: home ? e.game.away : e.game.home,
          bat: e.bat || {}, pit: e.pit || {}, tracked: shown.tracked,
          // The player's line for a game is hidden along with its score.
          spoilId: e.game.id, rowClass: spoil(e.game.id),
        };
      });
  // The result sits behind the game's eye like every other score on the site.
  const result = (r) => {
    const won = r.mine.score > r.theirs.score;
    return html`<span class="${spoil(r.game.id)}" data-spoil="${r.game.id}">${eye(r.game.id)} <span class="sp sp--wide">${r.game.notPlayed
      ? 'Not played'
      : html`<b class="res res--${won ? 'W' : 'L'}">${won ? 'W' : 'L'}</b> ${r.mine.score}-${r.theirs.score}`}</span></span>`;
  };

  // Headline numbers, skipping anything that season did not record.
  const headline = cur
    ? [[C.g, 'Games'], [C.avg], [C.hr], [C.rbi], [C.ops], [C.sb], ...(pitched(cur) ? [[C.p_ip], [era, 'ERA'], [C.p_k]] : [])]
        .map(([col, label]) => ({ label: label || col.label, value: col.val(cur) == null ? null : col.fmt(col.val(cur)) }))
        .filter((t) => t.value != null)
    : null;

  const facts = [
    ['Team', teamCell(team)],
    positions(career).length && ['Position', positions(career).slice(0, 3).join(', ')],
    info.bats && ['Bats', info.bats],
    info.throws && ['Throws', info.throws],
    info.type && ['Type', info.type],
    ['Seasons', P.seasons.length],
    career.g != null && ['Career games', career.g + (P.career.post.g || 0)],
  ].filter(Boolean);

  return {
    title: P.name,
    html: html`
      <div class="playertop">
        <div class="bcard" style="${teamVars(team)}">
          <div class="bcard__art">${portrait(P.name, 96)}${positions(career)[0] ? html`<span class="bcard__pos">${positions(career)[0]}</span>` : ''}</div>
          <h1 class="bcard__name">${P.name}</h1>
          ${P.honors.length ? html`<ul class="honors">${P.honors.map((h) => html`<li><a href="#/awards"><b>${h.season.name} ${h.title}</b>${h.detail ? html`<span>${h.detail}</span>` : ''}</a></li>`)}</ul>` : ''}
          <dl class="bcard__facts">${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
        </div>
        <div class="playertop__side">
          <section class="panel">
            <h2 class="panel__tab"><span>${shown.name}</span></h2>
            ${headline ? tiles(headline) : html`<p class="empty">${P.name} has no stats yet.</p>`}
            ${shown !== season ? html`<p class="note">${P.name} has not played in ${season.name} yet.</p>` : ''}
          </section>
          ${info.bio ? html`<section class="panel"><h2 class="panel__tab"><span>Scouting Report</span></h2><p class="bio">${info.bio}</p></section>` : ''}
          <section class="panel">
            <h2 class="panel__tab"><span>Teams</span></h2>
            <ol class="stints">${P.stints.map((s) => html`<li>${teamCell(model.team(s.teamId))}<span>${s.seasons.map((x) => x.name).join(', ')}</span></li>`)}</ol>
          </section>
        </div>
      </div>
      <section class="panel"><h2 class="panel__tab"><span>Season by Season</span></h2><div data-seasons></div></section>
      ${hasPost ? html`<section class="panel"><h2 class="panel__tab"><span>Playoffs</span></h2><div data-post></div></section>` : ''}
      ${log.length
        ? html`<section class="panel"><h2 class="panel__tab"><span>${shown.name} Game Log</span></h2><div data-log></div></section>`
        : ''}`,
    mount(root) {
      tabbedStats(root.querySelector('[data-seasons]'), {
        tracked: kept,
        views,
        // No games column until at least one of the player's seasons counted games.
        hideGames: P.seasons.every((x) => !x.season.reg.countsGames),
        rows: seasonRows('reg'),
        lead: seasonLead,
        foot: () => ({ label: 'Career', row: career }),
        empty: 'No regular season stats yet.',
      });
      if (hasPost) {
        tabbedStats(root.querySelector('[data-post]'), {
          views,
          rows: seasonRows('post'),
          lead: seasonLead,
          foot: () => ({ label: 'Playoff career', row: P.career.post }),
        });
      }
      if (log.length) {
        tabbedStats(root.querySelector('[data-log]'), {
          tracked: shown.tracked,
          views: views.filter((v) => logRows(v).length),
          hideGames: true,
          rows: logRows,
          lead: () => [
            { id: 'date', label: 'Game', cell: (r) => html`<a href="#/game/${r.game.id}">${gameWhen(r.game, { month: 'short', day: 'numeric' }, !r.game.round)}</a>` },
            { id: 'opp', label: 'Opp', cell: (r) => html`<span class="vs">${r.home ? 'vs' : 'at'}</span> ${pennant(r.opp)}` },
            { id: 'res', label: 'Result', cell: result },
          ],
        });
      }
    },
  };
}
