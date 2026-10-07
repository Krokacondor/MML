// Building blocks shared by the pages: mugshots, team ribbons, the scoreboard,
// standings and the sortable stat tables.

import { html, slug } from '../lib/html.js';
import { COLSETS, RATES, fmtAvg } from '../lib/statdefs.js';
import { excerpt } from '../lib/markdown.js';

export const fmtDate = (iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', opts) : iso || '';
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
// A mugshot is assets/mugshots/<player-slug>.png. Characters whose default
// color is spelled out in the game file share the plain-named picture.

const MUG_ALIAS = {
  'blue-noki': 'noki', 'blue-pianta': 'pianta', 'green-koopa-troopa': 'koopa-troopa', 'red-paratroopa': 'paratroopa',
  'blue-magikoopa': 'magikoopa', 'red-shy-guy': 'shy-guy', 'red-toad': 'toad', 'green-yoshi': 'yoshi',
  'gray-dry-bones': 'dry-bones', 'grey-dry-bones': 'dry-bones', 'pink-birdo': 'birdo',
};

export function mug(name, { size = 40, plate = false } = {}) {
  const s = slug(name);
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return html`<span class="mug ${plate ? 'mug--plate' : 'mug--chip'}" style="--s:${size}px"><i>${initials}</i><img
    src="assets/mugshots/${MUG_ALIAS[s] || s}.png" alt="" width="${size}" height="${size}"
    onload="this.parentNode.classList.add('is-loaded')" onerror="this.remove()"></span>`;
}

export const playerCell = (name, extra = '') =>
  html`<a class="pcell" href="#/player/${slug(name)}">${mug(name, { size: 30 })}<span>${name}</span>${extra}</a>`;

export const teamCell = (team) => html`<a class="tcell" href="#/team/${team.id}">${pennant(team)}<span>${team.name}</span></a>`;

// ---- Scoreboard -----------------------------------------------------------

export function lineScore(game, model) {
  const innings = Math.max(game.away.line?.length || 0, game.home.line?.length || 0);
  const hits = (t) => (game.batting || []).filter((r) => r.t === t).reduce((n, r) => n + (r.h || 0), 0);
  const row = (side, other, t) => {
    const team = model.team(side.team);
    return html`<tr class="${side.score > other.score ? 'is-win' : ''}">
      <td class="t"><a href="#/team/${team.id}">${team.name}</a></td>
      ${Array.from({ length: innings }, (_, i) => html`<td class="n">${side.line?.[i] ?? ''}</td>`)}
      <td class="n tot">${side.score}</td><td class="n tot">${hits(t)}</td>
    </tr>`;
  };
  return html`<div class="board"><div class="board__scroll"><table class="ls">
    <thead><tr><th></th>${Array.from({ length: innings }, (_, i) => html`<th>${i + 1}</th>`)}<th>R</th><th>H</th></tr></thead>
    <tbody>${row(game.away, game.home, 'a')}${row(game.home, game.away, 'h')}</tbody>
  </table></div></div>`;
}

export function scoreCard(game, model) {
  const row = (side, other) => {
    const team = model.team(side.team);
    return html`<span class="score__row ${side.score > other.score ? 'is-win' : ''}">${pennant(team)}<span class="score__name">${team.name}</span><b>${side.score}</b></span>`;
  };
  return html`<a class="score" href="#/game/${game.id}">
    <span class="score__meta">${fmtDate(game.date, { weekday: 'short', month: 'short', day: 'numeric' })}${game.type === 'playoffs' ? html` <i>Playoffs</i>` : ''}<em>Final</em></span>
    ${row(game.away, game.home)}${row(game.home, game.away)}
  </a>`;
}

// ---- Standings ------------------------------------------------------------

export function streakOf(results) {
  if (!results.length) return '-';
  const last = results[results.length - 1].res;
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i].res === last; i--) n++;
  return last + n;
}

export function standingsRows(ctx) {
  const S = ctx.season.reg;
  const ids = new Set(S.teams.keys());
  // In the current season, teams that have not played yet still belong on the board.
  if (ctx.season.id === ctx.league.currentSeason) {
    for (const t of ctx.model.teams.values()) if (t.active !== false) ids.add(t.id);
  }
  const rows = [...ids].map((id) => {
    const t = S.teams.get(id) || { g: 0, w: 0, l: 0, t: 0, rs: 0, ra: 0, results: [] };
    return { ...t, team: ctx.model.team(id), pct: t.g ? (t.w + t.t / 2) / t.g : null, diff: t.rs - t.ra, streak: streakOf(t.results) };
  });
  rows.sort((a, b) => b.w - b.l - (a.w - a.l) || (b.pct ?? 0) - (a.pct ?? 0) || b.diff - a.diff || a.team.name.localeCompare(b.team.name));
  const top = rows[0];
  for (const r of rows) r.gb = top ? (top.w - r.w + (r.l - top.l)) / 2 : 0;
  return rows;
}

export function standings(ctx) {
  const rows = standingsRows(ctx);
  if (!rows.length) return html`<p class="empty">No teams yet. They appear here after the first game is uploaded.</p>`;
  return html`<div class="board"><div class="board__scroll"><table class="stand">
    <thead><tr><th></th><th class="l">Team</th><th>W</th><th>L</th><th>PCT</th><th>GB</th><th>RS</th><th>RA</th><th>DIFF</th><th>STRK</th></tr></thead>
    <tbody>${rows.map((r, i) => html`<tr>
      <td class="pos">${i + 1}</td>
      <td class="l">${teamCell(r.team)}</td>
      <td class="n">${r.w}</td><td class="n">${r.l}</td>
      <td>${fmtAvg(r.pct)}</td><td>${r.gb ? r.gb : '-'}</td>
      <td>${r.rs}</td><td>${r.ra}</td><td>${r.diff > 0 ? '+' + r.diff : r.diff}</td><td>${r.streak}</td>
    </tr>`)}</tbody>
  </table></div></div>`;
}

// ---- Press clippings ------------------------------------------------------

export const clip = (a, i = 0) =>
  html`<a class="clip" href="#/news/${a.id}" style="--tilt:${[-0.8, 0.6, -0.4][i % 3]}deg"><span class="clip__paper">
    <span class="dateline">${fmtDate(a.date)}${a.author ? ` / ${a.author}` : ''}</span>
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
      <tbody>${rows.map((r, n) => html`<tr class="${r.rowClass || ''}">
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
// rows, lead and foot are functions of the chosen view.
export function tabbedStats(el, { views = Object.keys(COLSETS), rows, lead, foot, hideGames = false, sortBy = {}, rank = false, empty }) {
  let view = views[0];
  el.innerHTML = html`<div class="tabs" ${views.length < 2 ? 'hidden' : ''}>${views.map(
    (v) => html`<button type="button" data-view="${v}">${COLSETS[v].label}</button>`,
  )}</div><div class="tabs__body"></div>`;
  const body = el.querySelector('.tabs__body');
  const draw = () => {
    for (const btn of el.querySelectorAll('[data-view]')) btn.classList.toggle('is-on', btn.dataset.view === view);
    const cols = COLSETS[view].cols.filter((c) => !hideGames || (c.id !== 'g' && c.id !== 'gp'));
    renderTable(body, { lead: lead(view), cols, rows: rows(view), foot: foot?.(view), sort: sortBy[view] ?? null, rank, empty });
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
  html`<div class="tiles">${items.map((t) => html`<div class="tile"><b>${t.value}</b><span>${t.label}</span></div>`)}</div>`;

export const notFound = (what = 'That page') => ({
  title: 'Not found',
  html: html`<section class="lost"><h1>Foul ball</h1><p>${what} is not in the league's books.</p><p><a class="btn" href="#/">Back to home plate</a></p></section>`,
});

export { RATES };
