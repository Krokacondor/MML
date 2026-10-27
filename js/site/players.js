import { html } from '../lib/html.js';
import { C, viewsFor } from '../lib/statdefs.js';
import { positions, pitched } from '../lib/aggregate.js';
import { mug, portrait, pennant, teamVars, teamCell, tabbedStats, tiles, gameWhen, notFound, pname } from './ui.js';
import { spoil, eye } from './spoilers.js';
import { pickOf, finishOf, playerStory, seasonShort, ordinal, freeAgentAtEnd, FREE_AGENT, ringsFor } from './transactions.js';

// Card colors for a season the player has no team in yet.
const NO_TEAM = { id: '', name: 'N/A', abbr: '', colors: ['#7b838a', '#d3d7da'] };

const ordinalOf = (pick) => ordinal(pick.overall);

export function playersView(ctx) {
  const { model, season } = ctx;
  // Only the players who took part in the chosen season.
  const all = [...model.players.values()].filter((P) => P.seasons.some((x) => x.season === season)).sort((a, b) => a.name.localeCompare(b.name));
  const card = (P) => {
    // Released and unsigned at the end of this season: gray, no team.
    const teamId = P.seasons.find((x) => x.season === season).teamId;
    const team = !teamId || freeAgentAtEnd(model, season, P.name) ? FREE_AGENT : model.team(teamId);
    return html`<a class="pcard" href="#/player/${P.slug}" style="${teamVars(team)}" data-name="${P.name.toLowerCase()} ${team.name.toLowerCase()} ${String(team.abbr || '').toLowerCase()}">
      ${mug(P.name, { size: 48, plate: true })}
      <span class="pcard__name">${pname(P.name)}</span>
      <span class="pcard__team">${pennant(team)}${positions(P.career.reg).slice(0, 2).join(' / ')}</span>
    </a>`;
  };
  return {
    title: 'Players',
    html: html`
      <header class="pagehead pagehead--row">
        <div><p class="script">${season.name}</p><h1>Players</h1></div>
        <input class="search" type="search" placeholder="Find a player or team" aria-label="Find a player or team" data-find>
      </header>
      ${all.length
        ? html`<div class="pgrid">${all.map(card)}</div><p class="empty" data-none hidden>No players match that search.</p>`
        : html`<p class="empty">No players yet. Come back later!</p>`}`,
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
  const shown = season;
  const now = P.seasons.find((x) => x.season === shown);
  // The team this season: none yet when the player has no part in it.
  const finish = now ? finishOf(model, season, P.name) : null;
  const freeAgent = Boolean(now) && freeAgentAtEnd(model, season, P.name);
  const teamId = now ? now.reg?.teamId || finish?.team || now.teamId || '' : '';
  const team = freeAgent ? FREE_AGENT : teamId ? model.team(teamId) : NO_TEAM;
  // The player's other seasons, each a link that switches the site to it.
  const others = P.seasons.filter((x) => x.season !== season);
  const rings = ringsFor(model, P);
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

  // This season's positions from its games, or else its lineup spot.
  const posList = cur && positions(cur).length ? positions(cur) : finish?.pos ? [finish.pos] : [];
  // This season's draft spot: N/A until the season has a draft.
  const pick = pickOf(model, season, P.name);
  const draftLine = !season.draft.length
    ? 'N/A'
    : pick
      ? html`Round ${pick.round}, Pick ${pick.pick} <small>(${ordinalOf(pick)} overall)</small>`
      : 'Undrafted';
  const storyLines = now ? playerStory(model, season, P.name) : [];
  const story = storyLines.length ? [{ season, lines: storyLines }] : [];
  const facts = [
    ['Team', freeAgent ? 'Free agent' : teamId ? teamCell(team) : 'N/A'],
    posList.length && ['Position', posList.slice(0, 3).join(', ')],
    [`${seasonShort(season)} draft`, draftLine],
    others.length && ['Other seasons', html`${others.map((x, i) => html`${i ? ', ' : ''}<a href="#/player/${P.slug}?season=${x.season.id}">${x.season.name}</a>`)}`],
    info.bats && ['Bats', info.bats],
    info.throws && ['Throws', info.throws],
    info.type && ['Type', info.type],
    ['Seasons', P.seasons.length],
    career.g != null && career.parts.length > 0 && ['Career games', career.g + (P.career.post.g || 0)],
  ].filter(Boolean);

  return {
    title: P.name,
    html: html`
      <div class="playertop">
        <div class="bcard" style="${teamVars(team)}">
          <div class="bcard__art">${portrait(P.name, 96)}${posList[0] ? html`<span class="bcard__pos">${posList[0]}</span>` : ''}</div>
          <h1 class="bcard__name">${pname(P.name)}</h1>
          ${rings.length
            ? html`<p class="rings">${rings.map((r) => {
                const label = `${r.season.name} World Series ${r.won ? 'champion' : 'runner-up'}`;
                return html`<span class="ring ring--${r.won ? 'gold' : 'silver'}" title="${label}" aria-label="${label}">${seasonShort(r.season).replace(/^S/, '')}</span>`;
              })}</p>`
            : ''}
          ${P.honors.length ? html`<ul class="honors">${P.honors.map((h) => html`<li><a href="#/awards"><b>${seasonShort(h.season)} ${h.title}</b>${h.detail ? html`<span>${h.detail}</span>` : ''}</a></li>`)}</ul>` : ''}
          <dl class="bcard__facts">${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
        </div>
        <div class="playertop__side">
          <section class="panel">
            <h2 class="panel__tab"><span>${shown.name}</span></h2>
            ${headline ? tiles(headline) : html`<p class="empty">${shown.reg.hasResults ? 'Did not play this season.' : 'No stats yet. Come back later!'}</p>`}
          </section>
          ${info.bio ? html`<section class="panel"><h2 class="panel__tab"><span>Scouting Report</span></h2><p class="bio">${info.bio}</p></section>` : ''}
          ${story.length
            ? html`<section class="panel">
                <h2 class="panel__tab"><span>Draft & Moves</span></h2>
                ${story.map((x) => html`<h3 class="story-season">${x.season.name}</h3><ul class="story-lines">${x.lines.map((l) => html`<li>${l}</li>`)}</ul>`)}
              </section>`
            : ''}
          ${P.stints.length
            ? html`<section class="panel">
                <h2 class="panel__tab"><span>Teams</span></h2>
                <ol class="stints">${P.stints.map((s) => html`<li>${teamCell(model.team(s.teamId))}<span>${s.seasons.map((x) => x.name).join(', ')}</span></li>`)}</ol>
              </section>`
            : ''}
        </div>
      </div>
      ${P.career.reg.parts.length ? html`<section class="panel"><h2 class="panel__tab"><span>Season by Season</span></h2><div data-seasons></div></section>` : ''}
      ${hasPost ? html`<section class="panel"><h2 class="panel__tab"><span>Playoffs</span></h2><div data-post></div></section>` : ''}
      ${log.length
        ? html`<section class="panel"><h2 class="panel__tab"><span>${shown.name} Game Log</span></h2><div data-log></div></section>`
        : ''}`,
    mount(root) {
      if (root.querySelector('[data-seasons]')) tabbedStats(root.querySelector('[data-seasons]'), {
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
