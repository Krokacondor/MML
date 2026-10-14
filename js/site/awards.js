import { html, slug } from '../lib/html.js';
import { allStarsAt } from '../lib/aggregate.js';
import { mug, pennant, teamVars, teamLogo, lastSeasonWith } from './ui.js';
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

// Season awards, then the All-Star vote position by position.
export function awardsView(ctx) {
  const { model, season, league } = ctx;
  const shown = lastSeasonWith(model, season, (s) => s.awards.length || s.allStars);
  const vote = shown.allStars;
  const sctx = { ...ctx, season: shown };
  if (!shown.awards.length && !vote) {
    return {
      title: 'Awards',
      html: html`<header class="pagehead"><p class="script">${season.name}</p><h1>Awards</h1></header>
        <p class="empty">No awards or All-Star vote on record yet.</p>`,
    };
  }

  const who = (v) => html`<a href="#/player/${slug(model.canon(v.p))}">${v.p}</a>`;
  const pickCard = (pick) => {
    const stars = allStarsAt(pick, vote.seats);
    const others = pick.votes.filter((v) => !stars.includes(v));
    return html`<div class="pick">
      <span class="pick__pos">${pick.pos}</span>
      ${stars.map((v) => {
        const team = model.team(v.team);
        return html`<a class="pick__star" href="#/player/${slug(model.canon(v.p))}" style="${teamVars(team)}">
          ${mug(model.canon(v.p), { size: 36, plate: true })}
          <span class="pick__who"><span class="pick__name">${v.p}</span>${pennant(team)}</span>
          <b class="pick__n">${v.n}</b>
        </a>`;
      })}
      ${stars.length > (vote.seats || 1) ? html`<p class="pick__tie">Tied for the last spot</p>` : ''}
      ${pick.picked && others.some((v) => stars.some((s) => s.n === v.n)) ? html`<p class="pick__tie">Chosen from a tie</p>` : ''}
      ${others.length ? html`<p class="pick__rest">Also: ${others.map((v, i) => html`${i ? ', ' : ''}${who(v)} ${v.n}`)}</p>` : ''}
    </div>`;
  };

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
      ${asg.note ? html`<p class="note">${asg.note}</p>` : ''}
    </section>`;
  };

  return {
    title: `${shown.name} Awards`,
    html: html`
      <header class="pagehead"><p class="script">${shown.name}</p><h1>Awards</h1></header>
      ${shown.awards.length ? html`<section class="panel"><h2 class="panel__tab"><span>Season Awards</span></h2>${awardCards(sctx)}</section>` : ''}
      ${vote
        ? html`<header class="pagehead" id="allstars"><p class="script">${shown.name}</p><h1>All-Stars</h1></header>
            <p class="note">${vote.seats > 1 ? `The top ${vote.seats} vote-getters at each position` : 'The top vote-getter at each position'} in each conference, from ${vote.ballots} ballots. The number beside each name is votes received.</p>
            ${asg ? asgBoard() : ''}
            ${vote.conferences.map(({ id, name, picks }) => {
              const conf = (league.conferences || []).find((c) => c.id === id) || { name };
              return html`<section class="panel"><h2 class="panel__tab"><span>${conf.name}</span></h2>${conf.logo ? html`<img class="conflogo" src="${conf.logo}" alt="">` : ''}<div class="picks">${picks.map(pickCard)}</div></section>`;
            })}`
        : ''}`,
  };
}
