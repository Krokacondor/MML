import { html, slug } from '../lib/html.js';
import { allStarsAt } from '../lib/aggregate.js';
import { mug, pennant, teamVars, teamLogo } from './ui.js';
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
      ${mug(name, { size: 48, plate: true })}<span class="award__name">${w.p}</span><span class="award__team">${pennant(team)}${team.name}</span>
    </a>`;
  };
  return html`<div class="awards">${season.awards.map(
    (a) => html`<div class="award ${a.winners.length > 2 ? 'award--wide' : ''}"><h3 class="award__title">${a.title}</h3><div class="award__winners">${a.winners.map(winner)}</div></div>`,
  )}</div>`;
}

// Where each position stands on the All-Star diamond: [left %, top] in the
// field drawing's units (100 wide, FIELD_H tall), home plate at 50, 88.
const FIELD_H = 118;
const SPOTS = { CF: [50, 17], LF: [17, 29], RF: [83, 29], SS: [35, 45], '2B': [65, 45], '3B': [17, 64], '1B': [83, 64], P: [50, 66], C: [50, 95] };

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
  const fieldSpot = (pick) => {
    const at = SPOTS[pick.pos];
    if (!at) return '';
    return html`<div class="field__spot" style="left:${at[0]}%;top:${(at[1] / FIELD_H) * 100}%">${allStarsAt(pick, vote.seats).map((v) => {
      const team = model.team(v.team);
      return html`<a class="field__star" href="#/player/${slug(model.canon(v.p))}" style="${teamVars(team)}">
        ${mug(model.canon(v.p), { size: 40, plate: true })}
        <span class="field__pos">${pick.pos}</span>
        <span class="field__name">${v.p}</span>
        <span class="field__team">${team.abbr}</span>
      </a>`;
    })}</div>`;
  };
  const diamond = (picks) => html`<div class="field" style="aspect-ratio:100/${FIELD_H}">
    <svg class="field__art" viewBox="0 0 100 ${FIELD_H}" aria-hidden="true">
      <rect class="field__stands" width="100" height="${FIELD_H}"/>
      <path class="field__grass" d="M50 88 L-3.7 34.3 A76 76 0 0 1 103.7 34.3 Z"/>
      <path class="field__wall" d="M-3.7 34.3 A76 76 0 0 1 103.7 34.3"/>
      <path class="field__dirt" d="M50 88 L14.6 52.6 A50 50 0 0 1 85.4 52.6 Z"/>
      <path class="field__infield" d="M50 82 L68 64 L50 46 L32 64 Z"/>
      <path class="field__line" d="M50 88 L-3.7 34.3 M50 88 L103.7 34.3"/>
      <circle class="field__dirt" cx="50" cy="88" r="7"/>
      <circle class="field__dirt" cx="50" cy="66" r="4.5"/>
      <rect class="field__base" x="72.4" y="62.4" width="3.2" height="3.2" transform="rotate(45 74 64)"/>
      <rect class="field__base" x="48.4" y="38.4" width="3.2" height="3.2" transform="rotate(45 50 40)"/>
      <rect class="field__base" x="24.4" y="62.4" width="3.2" height="3.2" transform="rotate(45 26 64)"/>
      <path class="field__base" d="M48.2 87 h3.6 v1.6 l-1.8 1.6 l-1.8 -1.6 Z"/>
    </svg>
    ${picks.map(fieldSpot)}
  </div>`;

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
