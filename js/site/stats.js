import { html } from '../lib/html.js';
import { COLSETS } from '../lib/statdefs.js';
import { isQualified, positions } from '../lib/aggregate.js';
import { playerCell, teamCell, pennant, renderTable } from './ui.js';

export function statsView(ctx) {
  const { model, season, league, q } = ctx;
  const hasPost = season.post.games.length > 0;
  const st = {
    view: COLSETS[q.view] ? q.view : 'batting',
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

  return {
    title: 'Stats',
    html: html`
      <header class="pagehead"><p class="script">${season.name}</p><h1>Stats</h1></header>
      <div class="toolbar">
        ${seg('view', Object.entries(COLSETS).map(([id, set]) => [id, set.label]))}
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
        if (pit) rows = rows.filter((r) => r.gp > 0);
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
        const q = league.qualifiers || {};
        $('[data-note]').textContent =
          players && st.qual
            ? st.view === 'pitching'
              ? `Qualified: at least ${q.ipPerTeamGame ?? 1} inning(s) pitched per team game.`
              : `Qualified: at least ${q.paPerTeamGame ?? 1} plate appearance(s) per team game.`
            : 'Click any column heading to sort by it.';
        renderTable($('[data-table]'), {
          lead: leadFor(),
          cols: set.cols,
          rows: rowsFor(),
          sort: set.sort,
          rank: true,
          empty: st.part === 'post' ? 'No playoff stats yet.' : `No ${set.label.toLowerCase()} stats match.`,
        });
        $('[data-gloss]').innerHTML = html`${set.cols.map((c) => html`<div><dt>${c.label}</dt><dd>${c.title}</dd></div>`)}`;

        // Keep the address bar in step so a view can be bookmarked or shared.
        const params = new URLSearchParams();
        if (st.view !== 'batting') params.set('view', st.view);
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
