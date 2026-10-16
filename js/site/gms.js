// General manager pages: the teams a GM has run season by season, their
// accolades, a picture and a short write-up (data/gms.json, by GM slug).

import { html, slug } from '../lib/html.js';
import { markdown } from '../lib/markdown.js';
import { teamVars, teamCell, notFound } from './ui.js';
import { gmTeams, gmHonors, gmNames } from './transactions.js';

export function gmView(ctx, id) {
  const { model, season } = ctx;
  const name = gmNames(model).get(id);
  if (!name) return notFound('That general manager');
  const info = model.gms?.[id] || {};
  const teams = gmTeams(model, name);
  const honors = gmHonors(model, name);
  // The team this GM runs in the chosen season, else their most recent one.
  const now = teams.find((t) => t.seasons.includes(season)) || teams[teams.length - 1];
  const team = now ? model.team(now.team.id) : null;
  const seasonsRun = new Set(teams.flatMap((t) => t.seasons)).size;
  const initials = name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const facts = [
    ['Team', now?.seasons.includes(season) ? teamCell(team) : 'N/A'],
    ['Seasons as GM', seasonsRun],
  ];

  return {
    title: name,
    html: html`
      <div class="playertop">
        <div class="bcard" style="${teamVars(team)}">
          <div class="bcard__art"><span class="gm__frame">${info.picture ? html`<img src="${info.picture}" alt="">` : html`<b>${initials}</b>`}</span></div>
          <h1 class="bcard__name gm__name">${name}</h1>
          <p class="gm__role">General Manager</p>
          ${honors.length
            ? html`<ul class="honors">${honors.map((h) => html`<li><a href="${h.href}"><b>${h.label}</b></a></li>`)}</ul>`
            : ''}
          <dl class="bcard__facts">${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
        </div>
        <div class="playertop__side">
          ${info.bio ? html`<section class="panel"><h2 class="panel__tab"><span>About</span></h2><div class="bio">${markdown(info.bio)}</div></section>` : ''}
          <section class="panel">
            <h2 class="panel__tab"><span>Teams</span></h2>
            ${teams.length
              ? html`<ol class="stints">${teams.map((t) => html`<li>${teamCell(model.team(t.team.id))}<span>${t.seasons.map((s) => s.name).join(', ')}</span></li>`)}</ol>`
              : html`<p class="empty">Team to be announced.</p>`}
          </section>
        </div>
      </div>`,
  };
}

export const gmLink = (name) => html`<a href="#/gm/${slug(name)}">${name}</a>`;
