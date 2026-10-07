import { html } from '../lib/html.js';
import { RATES, fmtAvg, fmt2, fmtIP } from '../lib/statdefs.js';
import { positions } from '../lib/aggregate.js';
import { mug, pennant, teamVars, teamCell, tabbedStats, tiles, fmtDate, notFound } from './ui.js';

export function playersView(ctx) {
  const { model } = ctx;
  const all = [...model.players.values()].sort((a, b) => a.name.localeCompare(b.name));
  const card = (P) => {
    const team = model.team(P.last.teamId);
    return html`<a class="pcard" href="#/player/${P.slug}" style="${teamVars(team)}" data-name="${P.name.toLowerCase()} ${team.name.toLowerCase()}">
      ${mug(P.name, { size: 50, plate: true })}
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
  const now = P.seasons.find((x) => x.season === season);
  const cur = now?.reg;
  const career = P.career.reg;
  const pitched = career.gp + P.career.post.gp > 0;
  const hasPost = P.seasons.some((x) => x.post);
  const era = (pit) => (league.eraInnings === 7 ? RATES.era7(pit) : RATES.era9(pit));
  const views = ['batting', 'sluggers', 'fielding', ...(pitched ? ['pitching'] : [])];
  const info = P.info || {};

  // One row per season and team, plus a season total when a player changed teams.
  const seasonRows = (part) => (view) => {
    const rows = [];
    for (const entry of P.seasons) {
      const rec = entry[part];
      if (!rec) continue;
      for (const split of rec.byTeam.values()) rows.push({ ...split, season: entry.season });
      if (rec.byTeam.size > 1) rows.push({ ...rec, teamId: null, season: entry.season, rowClass: 'is-total' });
    }
    return view === 'pitching' ? rows.filter((r) => r.gp > 0) : rows;
  };
  const seasonLead = () => [
    { id: 'season', label: 'Season', cell: (r) => r.season.name },
    { id: 'team', label: 'Team', cell: (r) => (r.teamId ? teamCell(model.team(r.teamId)) : html`<b>Season total</b>`) },
  ];

  const logRows = (view) =>
    [...(cur?.log || []), ...(now?.post?.log || [])]
      .filter((e) => (view === 'pitching' ? e.pit : e.bat))
      .map((e) => {
        const home = e.game.home.team === e.teamId;
        return { game: e.game, home, opp: model.team(home ? e.game.away.team : e.game.home.team), bat: e.bat || {}, pit: e.pit || {} };
      });

  const headline = cur
    ? [
        { label: 'Games', value: cur.g },
        { label: 'AVG', value: fmtAvg(RATES.avg(cur.bat)) },
        { label: 'HR', value: cur.bat.hr || 0 },
        { label: 'RBI', value: cur.bat.rbi || 0 },
        { label: 'OPS', value: fmtAvg(RATES.ops(cur.bat)) },
        { label: 'SB', value: cur.bat.sb || 0 },
        ...(cur.gp ? [{ label: 'IP', value: fmtIP(cur.pit.outs) }, { label: 'ERA', value: fmt2(era(cur.pit)) }, { label: 'K', value: cur.pit.k || 0 }] : []),
      ]
    : null;

  const facts = [
    ['Team', teamCell(team)],
    ['Position', positions(career).slice(0, 3).join(', ') || '-'],
    info.bats && ['Bats', info.bats],
    info.throws && ['Throws', info.throws],
    info.type && ['Type', info.type],
    ['Seasons', P.seasons.length],
    ['Career games', career.g + P.career.post.g],
  ].filter(Boolean);

  return {
    title: P.name,
    html: html`
      <div class="playertop">
        <div class="bcard" style="${teamVars(team)}">
          <div class="bcard__art">${mug(P.name, { size: 100, plate: true })}<span class="bcard__pos">${positions(career)[0] || ''}</span></div>
          <h1 class="bcard__name">${P.name}</h1>
          <dl class="bcard__facts">${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
        </div>
        <div class="playertop__side">
          <section class="panel">
            <h2 class="panel__tab"><span>${season.name}</span></h2>
            ${headline ? tiles(headline) : html`<p class="empty">${P.name} did not play in ${season.name}.</p>`}
          </section>
          ${info.bio ? html`<section class="panel"><h2 class="panel__tab"><span>Scouting Report</span></h2><p class="bio">${info.bio}</p></section>` : ''}
          <section class="panel">
            <h2 class="panel__tab"><span>Teams</span></h2>
            <ol class="stints">${P.stints.map((s, i) => {
              const t = model.team(s.teamId);
              return html`<li class="${i === P.stints.length - 1 ? 'is-now' : ''}">${teamCell(t)}<span>${s.seasons.map((x) => x.name).join(', ')}</span></li>`;
            })}</ol>
          </section>
        </div>
      </div>
      <section class="panel"><h2 class="panel__tab"><span>Season by Season</span></h2><div data-seasons></div></section>
      ${hasPost ? html`<section class="panel"><h2 class="panel__tab"><span>Playoffs</span></h2><div data-post></div></section>` : ''}
      <section class="panel"><h2 class="panel__tab"><span>${season.name} Game Log</span></h2><div data-log></div></section>`,
    mount(root) {
      tabbedStats(root.querySelector('[data-seasons]'), {
        views,
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
      tabbedStats(root.querySelector('[data-log]'), {
        views,
        hideGames: true,
        rows: logRows,
        lead: () => [
          { id: 'date', label: 'Date', cell: (r) => html`<a href="#/game/${r.game.id}">${fmtDate(r.game.date, { month: 'short', day: 'numeric' })}</a>` },
          { id: 'opp', label: 'Opp', cell: (r) => html`<span class="vs">${r.home ? 'vs' : 'at'}</span> ${pennant(r.opp)}` },
        ],
        empty: `No games for ${P.name} in ${season.name}.`,
      });
    },
  };
}
