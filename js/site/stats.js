import { html } from '../lib/html.js';
import { COLSETS, viewsFor, colsFor } from '../lib/statdefs.js';
import { isQualified, pitched, positions } from '../lib/aggregate.js';
import { playerCell, teamCell, pennant, renderTable } from './ui.js';

export function statsView(ctx) {
  const { model, season, league, q } = ctx;
  const hasPost = season.post.games.length > 0;
  // A season recorded as totals only offers the views it has numbers for.
  const views = viewsFor(season.tracked);
  const st = {
    view: views.includes(q.view) ? q.view : views[0],
    scope: q.scope === 'teams' ? 'teams' : 'players',
    part: q.part === 'post' && hasPost ? 'post' : 'reg',
    team: model.teams.has(q.team) ? q.team : '',
    qual: q.qual === '1',
    find: '',
  };
  const teamsInSeason = [...new Set([...season.reg.teams.keys(), ...season.post.teams.keys()])]
    .map((id) => model.team(id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const seg = (name, options) =>
    html`<div class="seg" data-seg="${name}">${options.map(([value, label]) => html`<button type="button" data-value="${value}">${label}</button>`)}</div>`;

  if (!season.reg.players.size && !season.post.players.size) {
    return {
      title: 'Stats',
      html: html`
        <header class="pagehead"><p class="script">${season.name}</p><h1>Stats</h1></header>
        <p class="banner"><b>${season.name} has no stats yet.</b> They appear after the first game is uploaded. Earlier seasons are in the season menu at the top of the page.</p>`,
    };
  }

  return {
    title: 'Stats',
    html: html`
      <header class="pagehead"><p class="script">${season.name}</p><h1>Stats</h1></header>
      <div class="toolbar">
        ${seg('view', views.map((id) => [id, COLSETS[id].label]))}
        ${seg('scope', [['players', 'Players'], ['teams', 'Teams']])}
        ${hasPost ? seg('part', [['reg', 'Regular season'], ['post', 'Playoffs']]) : ''}
        <select data-team aria-label="Team">
          <option value="">All teams</option>
          ${teamsInSeason.map((t) => html`<option value="${t.id}">${t.name}</option>`)}
        </select>
        <label class="check"><input type="checkbox" data-qual> Qualified only</label>
        <input class="search" type="search" placeholder="Find a player" aria-label="Find a player" data-find>
      </div>
      <p class="note" data-note></p>
      <div data-table></div>
      ${season.note ? html`<p class="note">${season.note}</p>` : ''}
      <details class="gloss"><summary>What do these columns mean?</summary><dl data-gloss></dl></details>`,
    mount(root) {
      const $ = (sel) => root.querySelector(sel);

      const rowsFor = () => {
        const S = season[st.part];
        const pit = st.view === 'pitching';
        if (st.scope === 'teams') return [...S.teams.values()].map((t) => ({ ...t, team: model.team(t.id), name: model.team(t.id).name }));
        let rows = [...S.players.values()];
        if (st.qual) rows = rows.filter((p) => isQualified(p, S, league, pit ? 'pit' : 'bat'));
        // Filtering by team shows what each player did for that team only.
        rows = st.team
          ? rows.filter((p) => p.byTeam.has(st.team)).map((p) => ({ ...p.byTeam.get(st.team), name: p.name, slug: p.slug, teams: [st.team] }))
          : rows;
        if (pit) rows = rows.filter(pitched);
        if (st.find) rows = rows.filter((r) => r.name.toLowerCase().includes(st.find));
        return rows.sort((a, b) => a.name.localeCompare(b.name));
      };

      const leadFor = () => {
        if (st.scope === 'teams') return [{ id: 'name', label: 'Team', sort: (r) => r.name, cell: (r) => teamCell(r.team) }];
        const lead = [
          { id: 'name', label: 'Player', sort: (r) => r.name, cell: (r) => playerCell(r.name) },
          {
            id: 'team',
            label: 'Team',
            sort: (r) => model.team(r.teamId).name,
            cell: (r) => html`<a href="#/team/${r.teamId}">${pennant(model.team(r.teamId))}</a>${r.teams.length > 1 ? html`<i class="tag">+${r.teams.length - 1}</i>` : ''}`,
          },
        ];
        if (st.view === 'fielding') lead.push({ id: 'pos', label: 'Pos', sort: (r) => positions(r).join(), cell: (r) => positions(r).slice(0, 3).join(', ') });
        return lead;
      };

      const draw = () => {
        for (const group of root.querySelectorAll('[data-seg]')) {
          for (const btn of group.children) btn.classList.toggle('is-on', btn.dataset.value === st[group.dataset.seg]);
        }
        const players = st.scope === 'players';
        $('[data-team]').hidden = !players;
        $('[data-find]').hidden = !players;
        $('.check').hidden = !players;
        const set = COLSETS[st.view];
        const cols = colsFor(st.view, season.tracked, !season[st.part].countsGames);
        const quals = league.qualifiers || {};
        const rule = !season[st.part].countsGames
          ? 'at least half as many plate appearances as the league leader'
          : st.view === 'pitching'
            ? `at least ${quals.ipPerTeamGame ?? 1} inning(s) pitched per team game`
            : `at least ${quals.paPerTeamGame ?? 1} plate appearance(s) per team game`;
        $('[data-note]').textContent = players && st.qual ? `Qualified: ${rule}.` : 'Click any column heading to sort by it.';
        renderTable($('[data-table]'), {
          lead: leadFor(),
          cols,
          rows: rowsFor(),
          // Sort by the view's usual column, or its first stat if this season did not keep that one.
          sort: cols.some((c) => c.id === set.sort) ? set.sort : cols[0]?.id,
          rank: true,
          empty: st.part === 'post' ? 'No playoff stats yet.' : `No ${set.label.toLowerCase()} stats match.`,
        });
        $('[data-gloss]').innerHTML = html`${cols.map((c) => html`<div><dt>${c.label}</dt><dd>${c.title}</dd></div>`)}`;

        // Keep the address bar in step so a view can be bookmarked or shared.
        const params = new URLSearchParams();
        if (st.view !== views[0]) params.set('view', st.view);
        if (st.scope !== 'players') params.set('scope', st.scope);
        if (st.part !== 'reg') params.set('part', st.part);
        if (st.team) params.set('team', st.team);
        if (st.qual) params.set('qual', '1');
        const query = params.toString();
        history.replaceState(null, '', '#/stats' + (query ? '?' + query : ''));
      };

      $('[data-team]').value = st.team;
      $('[data-qual]').checked = st.qual;
      $('.toolbar').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-seg] button');
        if (!btn) return;
        st[btn.parentNode.dataset.seg] = btn.dataset.value;
        draw();
      });
      $('[data-team]').onchange = (e) => { st.team = e.target.value; draw(); };
      $('[data-qual]').onchange = (e) => { st.qual = e.target.checked; draw(); };
      $('[data-find]').oninput = (e) => { st.find = e.target.value.trim().toLowerCase(); draw(); };
      draw();
    },
  };
}
