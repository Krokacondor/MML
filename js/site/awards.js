import { html, slug } from '../lib/html.js';
import { allStarsAt } from '../lib/aggregate.js';
import { mug, pennant, teamVars, teamLogo, pname } from './ui.js';
import { diamond as field, fieldStar } from './field.js';
import { spoil, eye } from './spoilers.js';

// One card per award. A winner is a player ({ p }) or a general manager ({ gm, team }).
export function awardCards(ctx) {
  const { model, season } = ctx;
  const winner = (w) => {
    if (w.gm) {
      const team = model.team(w.team);
      return html`<a class="award__who" href="#/team/${team.id}" style="${teamVars(team)}">
        ${teamLogo(team)}<span class="award__name award__name--plain">${w.gm}</span><span class="award__team">${pennant(team)}${team.name}</span>
      </a>`;
    }
    const name = model.canon(w.p);
    const team = model.team(season.reg.players.get(slug(name))?.teamId);
    return html`<a class="award__who" href="#/player/${slug(name)}" style="${teamVars(team)}">
      ${mug(name, { size: 48, plate: true })}<span class="award__name">${pname(name)}</span><span class="award__team">${pennant(team)}${team.name}</span>
    </a>`;
  };
  return html`<div class="awards">${season.awards.map(
    (a) => html`<div class="award ${a.winners.length > 2 ? 'award--wide' : ''}"><h3 class="award__title">${a.title}</h3><div class="award__winners">${a.winners.map(winner)}</div></div>`,
  )}</div>`;
}

// Season awards, then each league's All-Stars on a diamond.
export function awardsView(ctx) {
  const { model, season, league } = ctx;
  const shown = season;
  const vote = shown.allStars;
  const sctx = { ...ctx, season: shown };
  if (!shown.awards.length && !vote) {
    return {
      title: 'Awards',
      html: html`<header class="pagehead"><p class="script">${season.name}</p><h1>Awards</h1></header>
        <p class="empty">No awards yet. Come back later!</p>`,
    };
  }

  // Each league's All-Stars stand at their positions on a diamond.
  const diamond = (picks) => field(picks.map((pick) => ({
    pos: pick.pos,
    stars: allStarsAt(pick, vote.seats).map((v) => fieldStar(model, v.p, pick.pos, model.team(v.team))),
  })));

  // The All-Star Game is between the two conferences, so it lives with the vote,
  // not among the season's games, and never touches anyone's record.
  const confOf = (id) => (league.conferences || []).find((c) => c.id === id) || { name: id };
  const asg = vote?.game;
  const asgBoard = () => {
    const sides = [asg.away, asg.home];
    const innings = Math.max(...sides.map((s) => s.line?.length || 0));
    const row = (side, other) => html`<tr class="${side.score > other.score ? 'is-win' : ''}">
      <td class="t">${confOf(side.conf).name}</td>
      ${Array.from({ length: innings }, (_, i) => html`<td class="n inn">${side.line?.[i] ?? ''}</td>`)}
      <td class="n tot">${side.score}</td>
    </tr>`;
    const winner = asg.away.score > asg.home.score ? asg.away : asg.home;
    const id = `${shown.id}-asg`;
    return html`<section class="panel ${spoil(id)}" data-spoil="${id}"><h2 class="panel__tab"><span>All-Star Game</span></h2>
      <p class="gamemeta">${eye(id)}<b>Final</b><span><i class="sp sp--text">${confOf(winner.conf).name} wins</i></span>${asg.stadium ? html`<span>${asg.stadium}</span>` : ''}</p>
      <div class="board"><div class="board__scroll"><table class="ls">
        <thead><tr><th></th>${Array.from({ length: innings }, (_, i) => html`<th class="inn">${i + 1}</th>`)}<th>R</th></tr></thead>
        <tbody>${row(asg.away, asg.home)}${row(asg.home, asg.away)}</tbody>
      </table></div></div>
      ${asg.note ? html`<p class="note only-shown">${asg.note}</p>` : ''}
    </section>`;
  };

  return {
    title: `${shown.name} Awards`,
    html: html`
      <header class="pagehead"><p class="script">${shown.name}</p><h1>Awards</h1></header>
      ${shown.awards.length ? html`<section class="panel"><h2 class="panel__tab"><span>Season Awards</span></h2>${awardCards(sctx)}</section>` : ''}
      ${vote
        ? html`<div class="allstars" id="allstars">${vote.conferences.map(({ id, name, picks }) => {
              const conf = (league.conferences || []).find((c) => c.id === id) || { name };
              return html`<section class="panel"><h2 class="panel__tab"><span>${conf.name} All-Stars</span></h2>${conf.logo ? html`<img class="conflogo" src="${conf.logo}" alt="">` : ''}${diamond(picks)}</section>`;
            })}</div>
            ${asg ? asgBoard() : ''}`
        : ''}`,
  };
}
