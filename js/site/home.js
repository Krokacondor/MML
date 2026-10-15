import { html } from '../lib/html.js';
import { leaderCats } from '../lib/statdefs.js';
import { isQualified, pitched, teamsIn } from '../lib/aggregate.js';
import { mug, portrait, pennant, teamVars, standings, scoreCard, clip, seasonClubs, lastSeasonWith } from './ui.js';
import { awardCards } from './awards.js';

// The top players in one category, best first.
function topPlayers(ctx, cat, count) {
  const S = ctx.season.reg;
  const pit = cat.col.id.startsWith('p_');
  const volume = (p) => (pit ? p.pit.outs || 0 : p.bat.pa || 0);
  let pool = [...S.players.values()].filter((p) => (pit ? pitched(p) : volume(p) > 0));
  if (cat.col.rate) {
    // Rate stats only count players with enough playing time, once anyone has it.
    const qualified = pool.filter((p) => isQualified(p, S, ctx.league, pit ? 'pit' : 'bat'));
    if (qualified.length) pool = qualified;
  } else {
    pool = pool.filter((p) => cat.col.val(p) > 0);
  }
  const sign = cat.col.asc ? 1 : -1;
  return pool
    .map((p) => ({ p, v: cat.col.val(p) }))
    .filter((x) => x.v != null)
    .sort((a, b) => sign * (a.v - b.v) || volume(b.p) - volume(a.p) || a.p.name.localeCompare(b.p.name))
    .slice(0, count);
}

function leaderBoard(ctx, cat) {
  const rows = topPlayers(ctx, cat, ctx.league.leadersCount || 5);
  if (!rows.length) return html`<p class="empty empty--hero">Nobody is on this board yet. Come back later!</p>`;
  const card = ({ p, v }, rank, top) => {
    const team = ctx.model.team(p.teamId);
    return html`<a class="leader ${top ? 'leader--top' : ''}" href="#/player/${p.slug}" style="${teamVars(team)}">
      <span class="plate"><b>${rank}</b></span>
      ${top ? portrait(p.name, 96) : mug(p.name, { size: 48, plate: true })}
      <span class="leader__who"><span class="leader__name">${p.name}</span><span class="leader__team">${pennant(team)}${team.name}</span></span>
      <span class="leader__val">${cat.col.fmt(v)}<small>${cat.col.label}</small></span>
    </a>`;
  };
  return html`<div class="leaders">${card(rows[0], 1, true)}<div class="leaders__rest">${rows.slice(1).map((r, i) => card(r, i + 2, false))}</div></div>`;
}

export function home(ctx) {
  const { model, season, league } = ctx;
  // Before a season's first game, the page shows how the last one ended.
  const shown = lastSeasonWith(model, season, (s) => s.reg.players.size > 0);
  const waiting = shown !== season;
  const sctx = { ...ctx, season: shown };
  const cats = leaderCats(league).filter((c) => topPlayers(sctx, c, 1).length);
  const latest = [...season.games].reverse().slice(0, 4);
  const stories = model.articles.slice(0, 3);
  // The clubs panel shows the coming season once any of its clubs are known.
  const clubSeason = teamsIn(model, season).length || season.pending.length ? season : shown;
  const cctx = { ...ctx, season: clubSeason };
  const hasClubs = teamsIn(model, clubSeason).length || clubSeason.pending.length;

  return {
    title: null,
    html: html`
      <section class="hero">
        <div class="hero__head">
          <div>
            <p class="script">${shown.name}${waiting ? ' final' : ''}</p>
            <h1>League Leaders</h1>
          </div>
          <div class="chips">${cats.map((c, i) => html`<button type="button" class="chip ${i ? '' : 'is-on'}" data-cat="${c.id}" title="${c.name}">${c.col.label}</button>`)}</div>
        </div>
        ${cats.length
          ? html`<h2 class="hero__stat" data-cat-name>${cats[0].name}</h2><div data-leaders>${leaderBoard(sctx, cats[0])}</div>`
          : html`<p class="empty empty--hero">No stats yet. Come back later!</p>`}
      </section>

      ${season.reg.hasResults || season.post.hasResults
        ? html`<div class="split">
            <section class="panel">
              <h2 class="panel__tab"><span>Standings</span></h2>
              ${standings(ctx)}
              <p class="more"><a href="#/teams">All teams</a></p>
            </section>
            <section class="panel">
              <h2 class="panel__tab"><span>Latest Scores</span></h2>
              <div class="scores">${latest.map((g) => scoreCard(g, model))}</div>
              <p class="more"><a href="#/games">Every game</a></p>
            </section>
          </div>`
        : html`
          ${hasClubs
            ? html`<section class="panel">
                <h2 class="panel__tab"><span>${clubSeason.name} Clubs</span></h2>
                ${seasonClubs(cctx)}
                <p class="more"><a href="#/teams">All teams</a></p>
              </section>`
            : ''}
          ${shown.awards.length
            ? html`<section class="panel">
                <h2 class="panel__tab"><span>${shown.name} Awards</span></h2>
                ${awardCards(sctx)}
                <p class="more"><a href="#/awards">${shown.allStars ? 'Awards and All-Stars' : 'All awards'}</a></p>
              </section>`
            : ''}`}

      <section class="press">
        <div class="press__head"><p class="script">From the</p><h2>Press Box</h2></div>
        ${stories.length
          ? html`<div class="clips">${stories.map(clip)}</div><p class="more"><a href="#/news">All stories</a></p>`
          : html`<p class="empty">The press box is quiet. Come back later!</p>`}
      </section>`,
    mount(root) {
      const chips = root.querySelector('.chips');
      if (!chips) return;
      chips.onclick = (e) => {
        const btn = e.target.closest('[data-cat]');
        if (!btn) return;
        const cat = cats.find((c) => c.id === btn.dataset.cat);
        for (const b of root.querySelectorAll('[data-cat]')) b.classList.toggle('is-on', b === btn);
        root.querySelector('[data-cat-name]').textContent = cat.name;
        root.querySelector('[data-leaders]').innerHTML = leaderBoard(sctx, cat);
      };
    },
  };
}
