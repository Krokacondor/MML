// Building blocks shared by the pages: mugshots, team ribbons, the scoreboard,
// standings and the sortable stat tables.

import { html, slug, raw, esc } from '../lib/html.js';
import { COLSETS, RATES, fmtAvg, colsFor, viewsFor } from '../lib/statdefs.js';
import { teamsIn, scheduleProgress } from '../lib/aggregate.js';
import { excerpt } from '../lib/markdown.js';
import { spoil, eye } from './spoilers.js';

export const fmtDate = (iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', opts) : iso || '';
};

// When a game was played: its date, or its week and place in the series for
// games recorded without one.
export const gameWhen = (game, opts, short = false) => {
  if (game.date) return fmtDate(game.date, opts);
  const parts = [short ? '' : game.round || '', game.week ? (short ? `Wk ${game.week}` : `Week ${game.week}`) : '', game.n ? (short ? `G${game.n}` : `Game ${game.n}`) : ''];
  return parts.filter(Boolean).join(short ? ' ' : ', ');
};

// ---- Team colors ----------------------------------------------------------

const hex = (c, fallback) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : fallback);

// Dark ink on light team colors, chalk on dark ones.
function inkOn(color) {
  const n = parseInt(color.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#16213f' : '#fffcf1';
}

export function teamVars(team) {
  const main = hex(team?.colors?.[0], '#4a5473');
  const trim = hex(team?.colors?.[1], '#fffcf1');
  return `--c:${main};--c2:${trim};--on:${inkOn(main)};--on2:${inkOn(trim)}`;
}

export const pennant = (team) =>
  html`<span class="pennant" style="${teamVars(team)}" title="${team.name}">${team.abbr || team.name.slice(0, 3).toUpperCase()}</span>`;

// ---- Mugshots -------------------------------------------------------------
// A mugshot is assets/mugshots/<player-slug>.png. Game characters use the
// left-facing side-view sprite from the character select screen; Miis use a
// picture the league supplies. Anyone with no picture yet gets the stand-in
// _mii.png, and their initials if even that is missing. This table covers the
// other names the league and the game use for the same character.

const MUG_ALIAS = {
  'baby-dk': 'baby-donkey-kong',
  'gray-dry-bones': 'dry-bones', 'grey-dry-bones': 'dry-bones', 'red-dry-bones': 'dark-bones',
  'green-koopa': 'green-koopa-troopa', 'koopa-troopa': 'green-koopa-troopa', 'koopa': 'green-koopa-troopa', 'red-koopa': 'red-koopa-troopa',
  'red-paratroopa': 'red-koopa-paratroopa', 'paratroopa': 'red-koopa-paratroopa', 'green-paratroopa': 'green-koopa-paratroopa',
  'kritter': 'green-kritter', 'magikoopa': 'blue-magikoopa', 'shy-guy': 'red-shy-guy', 'black-shy-guy': 'gray-shy-guy', 'grey-shy-guy': 'gray-shy-guy',
  'pianta': 'blue-pianta', 'noki': 'blue-noki', 'toad': 'red-toad', 'green-yoshi': 'yoshi',
  'princess-peach': 'peach', 'princess-daisy': 'daisy', 'k-rool': 'king-k-rool',
};

// Every spot uses the xBR-enlarged icon (or the Mii's picture); anyone with no
// picture ends on the stand-in.
export function mug(name, { size = 40, plate = false } = {}) {
  const s = slug(name);
  const file = MUG_ALIAS[s] || s;
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const tries = [`assets/mugshots/${file}.png`, 'assets/mugshots/_mii.png'];
  return html`<span class="mug ${plate ? 'mug--plate' : 'mug--chip'}" style="--s:${size}px"><i>${initials}</i><img
    src="${tries[0]}" data-next="${tries.slice(1).join('|')}" alt=""
    onload="this.parentNode.classList.add('is-loaded');if(this.naturalWidth>64)this.classList.add('is-photo')"
    onerror="const n=this.dataset.next.split('|').filter(Boolean);if(n.length){this.dataset.next=n.slice(1).join('|');this.src=n[0]}else{this.remove()}"></span>`;
}

// The big picture of a player, for the spots where a 48-pixel sprite would have
// to be stretched: a full-body image from assets/fullbody/<player-slug>.png when
// the league has supplied one, otherwise the usual mugshot on its plate.
export function portrait(name, size = 96) {
  const s = slug(name);
  return html`<span class="portrait" style="--s:${size}px"><img class="portrait__full" src="assets/fullbody/${MUG_ALIAS[s] || s}.png" alt=""
    onload="this.parentNode.classList.add('has-full')" onerror="this.remove()">${mug(name, { size, plate: true })}</span>`;
}

export const playerCell = (name, extra = '') =>
  html`<a class="pcell" href="#/player/${slug(name)}">${mug(name, { size: 30 })}<span>${name}</span>${extra}</a>`;

export const teamCell = (team) => html`<a class="tcell" href="#/team/${team.id}">${pennant(team)}<span>${team.name}</span></a>`;

// ---- Scoreboard -----------------------------------------------------------

// A side's runs, or X for a playoff slot the series never needed.
export const runs = (side) => side.score ?? 'X';

// "Final" while a game is hidden. An unneeded slot says "Not played" only once
// uncovered, so a hidden slot looks exactly like a real game.
export const finalWord = (game) =>
  game.notPlayed ? html`<i class="only-hidden">Final</i><i class="only-shown">Not played</i>` : 'Final';

export function lineScore(game, model) {
  const innings = Math.max(game.away.line?.length || 0, game.home.line?.length || 0);
  // Hits come from the box score. A game recorded as a result only shows the
  // total written down with it ("h" on that side), or nothing.
  const hits = (t) => {
    const rows = (game.batting || []).filter((r) => r.t === t);
    return rows.length ? rows.reduce((n, r) => n + (r.h || 0), 0) : (t === 'a' ? game.away : game.home).h ?? '';
  };
  // No H column at all when neither team's hits are known.
  const showHits = hits('a') !== '' || hits('h') !== '';
  // An inning the league has no record of is kept as null and shown as "?".
  const inning = (line = [], i) => (i < line.length && line[i] == null ? '?' : line[i] ?? '');
  const row = (side, other, t) => {
    const team = model.team(side.team);
    return html`<tr class="${side.score > other.score ? 'is-win' : ''}">
      <td class="t"><a href="#/team/${team.id}">${team.name}</a></td>
      ${Array.from({ length: innings }, (_, i) => html`<td class="n inn">${inning(side.line, i)}</td>`)}
      <td class="n tot">${runs(side)}</td>${showHits ? html`<td class="n tot">${hits(t)}</td>` : ''}
    </tr>`;
  };
  return html`<div class="board"><div class="board__scroll"><table class="ls">
    <thead><tr><th></th>${Array.from({ length: innings }, (_, i) => html`<th class="inn">${i + 1}</th>`)}<th>R</th>${showHits ? html`<th>H</th>` : ''}</tr></thead>
    <tbody>${row(game.away, game.home, 'a')}${row(game.home, game.away, 'h')}</tbody>
  </table></div></div>`;
}

export function scoreCard(game, model) {
  const row = (side, other) => {
    const team = model.team(side.team);
    return html`<span class="score__row ${side.score > other.score ? 'is-win' : side.score < other.score ? 'is-loss' : ''}">${pennant(team)}<span class="score__name">${team.name}</span><b class="sp">${runs(side)}</b></span>`;
  };
  // The scores stay hidden until the card's eye is clicked (see spoilers.js).
  return html`<div class="score ${spoil(game.id)}" data-spoil="${game.id}"><a class="score__link" href="#/game/${game.id}">
    <span class="score__meta">${gameWhen({ ...game, round: null }, { weekday: 'short', month: 'short', day: 'numeric' })}${game.type === 'playoffs' ? html` <i>Playoffs</i>` : ''}<em>${finalWord(game)}</em></span>
    ${row(game.away, game.home)}${row(game.home, game.away)}
  </a>${eye(game.id)}</div>`;
}

// ---- Standings ------------------------------------------------------------

export function streakOf(results) {
  if (!results.length) return '-';
  const last = results[results.length - 1].res;
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i].res === last; i--) n++;
  return last + n;
}

// A season's teams with their records, best first.
export function standingsRows(ctx, teams = teamsIn(ctx.model, ctx.season)) {
  const S = ctx.season.reg;
  const rows = teams.map((team) => {
    const t = S.teams.get(team.id) || { w: 0, l: 0, t: 0, rs: 0, ra: 0, results: [] };
    const g = t.w + t.l + t.t;
    return { ...t, g, team, pct: g ? (t.w + t.t / 2) / g : null, diff: t.rs - t.ra, streak: streakOf(t.results) };
  });
  rows.sort((a, b) => b.w - b.l - (a.w - a.l) || (b.pct ?? 0) - (a.pct ?? 0) || b.diff - a.diff || a.team.name.localeCompare(b.team.name));
  const top = rows[0];
  for (const r of rows) r.gb = top ? (top.w - r.w + (r.l - top.l)) / 2 : 0;
  return rows;
}

// A season's teams split by conference: [{ conf, teams }]. Leagues without
// conferences, and teams without one, land in a single unnamed group.
export function byConference(ctx, teams = teamsIn(ctx.model, ctx.season)) {
  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name));
  // A season whose groups aren't set yet lists every team together.
  if (ctx.season.ungrouped) return sorted.length ? [{ conf: null, teams: sorted }] : [];
  const groups = (ctx.league.conferences || []).map((conf) => ({ conf, teams: sorted.filter((t) => t.conference === conf.id) }));
  const rest = sorted.filter((t) => !groups.some((g) => g.teams.includes(t)));
  return [...groups.filter((g) => g.teams.length), ...(rest.length ? [{ conf: null, teams: rest }] : [])];
}

export const confHead = (conf) =>
  conf ? html`<h3 class="confhead">${conf.logo ? html`<img src="${conf.logo}" alt="">` : ''}<span>${conf.name}</span></h3>` : '';

export function standings(ctx) {
  const groups = byConference(ctx);
  if (!groups.length) return html`<p class="empty">No teams yet. Come back later!</p>`;
  return html`${progressNote(ctx.season)}${groups.map(({ conf, teams }) => html`${confHead(conf)}<div class="board"><div class="board__scroll"><table class="stand">
    <thead><tr><th></th><th class="l">Team</th><th>W</th><th>L</th><th>PCT</th><th>GB</th><th>RS</th><th>RA</th><th>DIFF</th><th>STRK</th></tr></thead>
    <tbody>${standingsRows(ctx, teams).map((r, i) => html`<tr>
      <td class="pos">${i + 1}</td>
      <td class="l">${teamCell(r.team)}</td>
      <td class="n">${r.w}</td><td class="n">${r.l}</td>
      <td>${fmtAvg(r.pct)}</td><td>${r.gb ? r.gb : '-'}</td>
      <td>${r.rs}</td><td>${r.ra}</td><td>${r.diff > 0 ? '+' + r.diff : r.diff}</td><td>${r.streak}</td>
    </tr>`)}</tbody>
  </table></div></div>`)}`;
}

// Says how far the results go when a season's schedule is not all in yet. A
// totals season is over, so there the gap is games still to be entered.
export function progressNote(season) {
  const { played, scheduled, partial } = scheduleProgress(season);
  if (!partial) return '';
  return html`<p class="note">${season.tracked
    ? `Results are still being entered: ${played} of ${scheduled} games so far. Records and runs cover those games only.`
    : `Through ${played} of ${scheduled} scheduled games.`}</p>`;
}

// A team's logo, or its short name on a base-shaped plate when it has none.
export const teamLogo = (team) =>
  team.logo
    ? html`<span class="tlogo"><img src="${team.logo}" alt="${team.name} logo"></span>`
    : html`<span class="tlogo tlogo--none" style="${teamVars(team)}"><b>${team.abbr}</b></span>`;

// A club not announced yet: the GM is known, the team isn't (or has no name yet).
export const pendingCard = (p) =>
  html`<div class="teamcard teamcard--tba" style="--c:#4b6278;--on:#fff8e2">
    <span class="tlogo tlogo--none"><b>?</b></span>
    <span class="teamcard__name">${p.label || 'To be announced'}</span>
    <span class="teamcard__gm">GM <b>${p.gm}</b></span>
    ${p.note ? html`<span class="teamcard__note">${p.note}</span>` : ''}
  </div>`;

// A season's clubs: the announced teams (by group when the season has groups)
// followed by the clubs still to be announced. A club not announced yet whose
// conference is known ({ conference } in pending) waits in that conference.
export function seasonClubs(ctx, teams = teamsIn(ctx.model, ctx.season)) {
  const confs = ctx.league.conferences || [];
  const pending = ctx.season.pending || [];
  const placed = ctx.season.ungrouped ? [] : pending.filter((p) => confs.some((c) => c.id === p.conference));
  const groups = byConference(ctx, teams);
  for (const conf of confs) {
    if (placed.some((p) => p.conference === conf.id) && !groups.some((g) => g.conf === conf)) groups.push({ conf, teams: [] });
  }
  const order = (g) => (g.conf ? confs.indexOf(g.conf) : confs.length);
  groups.sort((a, b) => order(a) - order(b));
  const open = pending.filter((p) => !placed.includes(p));
  return html`${groups.map(({ conf, teams: list }) => html`${confHead(conf)}<div class="teamgrid">${list.map((t) => teamCard(ctx, t))}${placed.filter((p) => conf && p.conference === conf.id).map(pendingCard)}</div>`)}
    ${open.length
      ? html`${groups.length ? html`<h3 class="confhead"><span>Still to be announced</span></h3>` : ''}<div class="teamgrid">${open.map(pendingCard)}</div>`
      : ''}`;
}

// The card used wherever teams are listed.
export function teamCard(ctx, team) {
  const rec = ctx.season.reg.teams.get(team.id);
  return html`<a class="teamcard" href="#/team/${team.id}" style="${teamVars(team)}">
    ${teamLogo(team)}
    <span class="teamcard__name">${team.name}</span>
    ${team.gm ? html`<span class="teamcard__gm">GM <b>${team.gm}</b></span>` : ''}
    ${ctx.season.reg.hasResults && rec ? html`<span class="teamcard__rec">${rec.w}-${rec.l}</span>` : ''}
  </a>`;
}

// ---- Press clippings ------------------------------------------------------

// A writer's square picture beside their name.
export const byline = (a, size = 30) =>
  a.authorPicture ? html`<img class="byline__pic" src="${a.authorPicture}" alt="" style="--b:${size}px">` : '';

export const clip = (a, i = 0) =>
  html`<a class="clip" href="#/news/${a.id}" style="--tilt:${[-0.8, 0.6, -0.4][i % 3]}deg"><span class="clip__paper">
    ${a.image ? html`<img class="clip__pic" src="${a.image}" alt="" loading="lazy">` : ''}
    <span class="dateline byline">${byline(a)}<span>${fmtDate(a.date)}${a.author ? ` / ${a.author}` : ''}</span></span>
    <h3>${a.title}</h3>
    <p>${a.summary || excerpt(a.body)}</p>
    <span class="clip__more">Read the story</span>
  </span></a>`;

// ---- Stat tables ----------------------------------------------------------
// spec: { lead: [{id,label,cell(row),sort(row)}], cols: [stat columns], rows,
//         sort, dir, foot: {label,row}, rank, empty }

const defaultDir = (c) => (!c || c.asc || c.sort ? 'asc' : 'desc');

export function renderTable(el, spec) {
  const lead = spec.lead || [];
  const byId = new Map([...lead, ...spec.cols].map((c) => [c.id, c]));
  const state = { sort: byId.has(spec.sort) ? spec.sort : null, dir: spec.dir };
  if (state.sort && !state.dir) state.dir = defaultDir(byId.get(state.sort));

  const sorted = () => {
    const c = byId.get(state.sort);
    if (!c) return spec.rows;
    const get = c.sort || c.val;
    const sign = state.dir === 'asc' ? 1 : -1;
    return [...spec.rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x == null || y == null) return (x == null) - (y == null);
      if (typeof x === 'string') return sign * x.localeCompare(String(y));
      return x === y ? 0 : sign * (x < y ? -1 : 1);
    });
  };

  const draw = () => {
    const rows = sorted();
    if (!rows.length) {
      el.innerHTML = html`<p class="empty">${spec.empty || 'Nothing on the books yet.'}</p>`;
      return;
    }
    const on = (c) => (state.sort === c.id ? 'is-sorted' : '');
    // Only columns that know how to compare rows get a clickable header.
    const th = (c, cls) =>
      c.sort || c.val
        ? html`<th class="${cls} ${on(c)}" data-col="${c.id}" data-dir="${state.sort === c.id ? state.dir : ''}" title="${c.title || ''}">${c.label}</th>`
        : html`<th class="${cls}">${c.label}</th>`;
    el.innerHTML = html`<div class="tbl"><table class="st">
      <thead><tr>${spec.rank ? html`<th class="rk">#</th>` : ''}${lead.map((c, i) => th(c, i ? 'lead' : 'lead pin'))}${spec.cols.map((c) => th(c, ''))}</tr></thead>
      <tbody>${rows.map((r, n) => html`<tr class="${r.rowClass || ''}"${r.spoilId ? raw(` data-spoil="${esc(r.spoilId)}"`) : ''}>
        ${spec.rank ? html`<td class="rk">${n + 1}</td>` : ''}
        ${lead.map((c, i) => html`<td class="${i ? 'lead' : 'lead pin'} ${on(c)}">${c.cell(r)}</td>`)}
        ${spec.cols.map((c) => html`<td class="${on(c)}">${c.fmt(c.val(r))}</td>`)}
      </tr>`)}</tbody>
      ${spec.foot ? html`<tfoot><tr>
        ${spec.rank ? html`<td class="rk"></td>` : ''}
        <td class="lead pin" colspan="${lead.length}">${spec.foot.label}</td>
        ${spec.cols.map((c) => html`<td>${c.fmt(c.val(spec.foot.row))}</td>`)}
      </tr></tfoot>` : ''}
    </table></div>`;
  };

  el.onclick = (e) => {
    const th = e.target.closest('th[data-col]');
    if (!th) return;
    const id = th.dataset.col;
    if (state.sort === id) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    else Object.assign(state, { sort: id, dir: defaultDir(byId.get(id)) });
    draw();
  };
  draw();
}

// A stat table with Batting / Star & Power / Fielding / Pitching tabs.
// rows, lead and foot are functions of the chosen view. Pass a season's
// "tracked" list to drop the views and columns that season never recorded.
export function tabbedStats(el, { tracked = null, views = viewsFor(tracked), rows, lead, foot, hideGames = false, sortBy = {}, rank = false, empty }) {
  if (!views.length) {
    el.innerHTML = html`<p class="empty">${empty || 'Nothing on the books yet.'}</p>`;
    return;
  }
  let view = views[0];
  el.innerHTML = html`<div class="tabs" ${views.length < 2 ? 'hidden' : ''}>${views.map(
    (v) => html`<button type="button" data-view="${v}">${COLSETS[v].label}</button>`,
  )}</div><div class="tabs__body"></div>`;
  const body = el.querySelector('.tabs__body');
  const draw = () => {
    for (const btn of el.querySelectorAll('[data-view]')) btn.classList.toggle('is-on', btn.dataset.view === view);
    renderTable(body, { lead: lead(view), cols: colsFor(view, tracked, hideGames), rows: rows(view), foot: foot?.(view), sort: sortBy[view] ?? null, rank, empty });
  };
  el.querySelector('.tabs').onclick = (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    view = btn.dataset.view;
    draw();
  };
  draw();
}

// Big-number tiles: [{ label, value }]
export const tiles = (items) =>
  html`<div class="tiles">${items.map((t) => html`<div class="tile"><b>${t.value}</b><span>${t.label}</span>${t.rank ? html`<i class="tile__rank ${/^1st/.test(t.rank) ? 'is-top' : ''}">${t.rank}</i>` : ''}</div>`)}</div>`;

export const notFound = (what = 'That page') => ({
  title: 'Not found',
  html: html`<section class="lost"><h1>Foul ball</h1><p>${what} is not in the league's books.</p><p><a class="btn" href="#/">Back to home plate</a></p></section>`,
});

export { RATES };
