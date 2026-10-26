// The Draft page: the selected season's draft as a board (one column per team in
// first-round order, one row per round) on wide screens and round by round on
// phones. Before the picks are in it shows the draft order.

import { html } from '../lib/html.js';
import { mug, pennant, teamLogo, teamVars, teamCell } from './ui.js';
import { draftOf, who, ordinal } from './transactions.js';

// The first-round order as a numbered list of teams and their GMs.
export function draftOrderList(model, ids) {
  return html`<ol class="draftorder">${ids.map((id, i) => {
    const team = model.team(id);
    return html`<li><b>${i + 1}</b>${teamCell(team)}${team.gm ? html`<span>${team.gm}</span>` : ''}</li>`;
  })}</ol>`;
}

export function draftView(ctx) {
  const { model, season } = ctx;
  const picks = draftOf(season);
  const head = html`<header class="pagehead"><p class="script">${season.name}</p><h1>Draft</h1></header>`;

  // Columns follow the first round; before the picks are in, the season's draft
  // order and round count ("draftRounds") lay out an empty board.
  const order = picks.length
    ? picks.filter((d) => d.round === 1).sort((a, b) => a.pick - b.pick).map((d) => d.team)
    : season.draftOrder;
  if (!order.length) return { title: 'Draft', html: html`${head}<p class="empty">No draft yet. Come back later!</p>` };
  const rounds = picks.length
    ? [...new Set(picks.map((d) => d.round))].sort((a, b) => a - b)
    : Array.from({ length: season.draftRounds || 0 }, (_, i) => i + 1);
  const last = rounds[rounds.length - 1];
  const at = (round, team) => picks.find((d) => d.round === round && d.team === team);

  // Snake draft: odd rounds run left to right, even rounds right to left. Each
  // pick points to the next one, and the round's last pick points down.
  const cell = (r, col) => {
    const team = model.team(order[col]);
    const forward = r % 2 === 1;
    const pickNo = forward ? col + 1 : order.length - col;
    const turn = pickNo === order.length;
    const arrow = turn ? (r === last ? '' : 'dpick--down') : forward ? 'dpick--right' : 'dpick--left';
    const d = at(r, order[col]);
    return html`<div class="dpick ${arrow} ${d ? '' : 'dpick--open'}" style="${teamVars(team)}">
      <span class="dpick__no">${(r - 1) * order.length + pickNo}</span>
      ${d ? html`${mug(model.canon(d.p), { size: 34, plate: true })}<span class="dpick__who">${who(model, d.p)}</span>` : ''}
    </div>`;
  };

  return {
    title: `${season.name} Draft`,
    html: html`${head}
      <section class="panel draft">
        <h2 class="panel__tab"><span>Draft Board</span></h2>
        ${season.draftNote ? html`<p class="draftnote">${season.draftNote}</p>` : ''}
        <div class="draftboard" style="--teams:${order.length}">
          <span class="draftboard__corner"></span>
          ${order.map((id) => {
            const team = model.team(id);
            return html`<a class="draftboard__team" href="#/team/${id}" style="${teamVars(team)}">${teamLogo(team)}<b class="draftboard__abbr">${team.abbr}</b></a>`;
          })}
          ${rounds.map((r) => html`<b class="draftboard__round">${r}</b>${order.map((_, col) => cell(r, col))}`)}
        </div>
        <div class="draftrounds">${picks.length
          ? rounds.map((r) => html`<h3 class="story-season">Round ${r}</h3>
            <ol class="draftrounds__list">${picks.filter((d) => d.round === r).sort((a, b) => a.pick - b.pick).map((d) => html`<li style="${teamVars(model.team(d.team))}">
              <span class="dpick__no">${ordinal(d.overall)}</span>${pennant(model.team(d.team))}${mug(model.canon(d.p), { size: 30, plate: true })}<span class="dpick__who">${who(model, d.p)}</span>
            </li>`)}</ol>`)
          : html`<h3 class="story-season">Draft Order</h3>${draftOrderList(model, order)}`}</div>
      </section>`,
  };
}
