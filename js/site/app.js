// The public site: loads the league data once, then swaps pages in and out
// as the address after the # changes (#/teams, #/player/luigi, ...).

import { html } from '../lib/html.js';
import { loadLeague } from '../lib/load.js';
import { pennant, notFound } from './ui.js';
import { home } from './home.js';
import { teamsView, teamView } from './teams.js';
import { playersView, playerView } from './players.js';
import { statsView } from './stats.js';
import { gamesView, gameView } from './games.js';
import { newsView, articleView } from './news.js';
import { awardsView } from './awards.js';
import { spoil, watchSpoilers } from './spoilers.js';

const ROUTES = [
  [/^\/$/, home, 'home'],
  [/^\/teams$/, teamsView, 'teams'],
  [/^\/team\/([^/]+)$/, teamView, 'teams'],
  [/^\/players$/, playersView, 'players'],
  [/^\/player\/([^/]+)$/, playerView, 'players'],
  [/^\/stats$/, statsView, 'stats'],
  [/^\/games$/, gamesView, 'games'],
  [/^\/game\/([^/]+)$/, gameView, 'games'],
  [/^\/(?:awards|allstars)$/, awardsView, 'awards'],
  [/^\/news$/, newsView, 'news'],
  [/^\/news\/([^/]+)$/, articleView, 'news'],
];

const view = document.getElementById('view');
const state = { model: null, seasonId: null };
const $ = (sel) => document.querySelector(sel);

const currentSeason = () => state.model.seasons.find((s) => s.id === state.seasonId) || state.model.seasons[state.model.seasons.length - 1];

// The masthead logo follows the chosen season. A season without its own logo
// borrows the most recent one before it.
function drawLogo() {
  const { seasons } = state.model;
  const upTo = seasons.slice(0, seasons.indexOf(currentSeason()) + 1);
  const logo = [...upTo].reverse().find((s) => s.logo)?.logo || seasons.find((s) => s.logo)?.logo;
  const img = $('[data-league-logo]');
  img.hidden = !logo;
  if (logo) img.src = logo;
}

function drawTicker() {
  const { model } = state;
  const games = [...currentSeason().games].reverse().slice(0, 10);
  const el = $('[data-ticker]');
  el.hidden = !games.length;
  const side = (s, other) => html`<span class="${s.score > other.score ? 'is-win' : ''}">${pennant(model.team(s.team))}<i class="sp">${s.score ?? 'X'}</i></span>`;
  el.innerHTML = html`<div class="ticker__in"><b>Final</b>${games.map((g) => html`<a class="${spoil(g.id)}" data-spoil="${g.id}" href="#/game/${g.id}">${side(g.away, g.home)}${side(g.home, g.away)}</a>`)}</div>`;
}

function route() {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const ctx = { model: state.model, league: state.model.league, season: currentSeason(), q: Object.fromEntries(new URLSearchParams(query)) };
  let page = notFound();
  let nav = '';
  for (const [pattern, make, key] of ROUTES) {
    const m = pattern.exec(path || '/');
    if (!m) continue;
    page = make(ctx, ...m.slice(1).map(decodeURIComponent));
    nav = key;
    break;
  }
  document.title = (page.title ? page.title + ' | ' : '') + state.model.league.name;
  view.innerHTML = page.html;
  page.mount?.(view);
  for (const a of document.querySelectorAll('[data-nav]')) a.classList.toggle('is-on', a.dataset.nav === nav);
  window.scrollTo(0, 0);
}

async function boot() {
  try {
    state.model = await loadLeague();
  } catch (err) {
    view.innerHTML = html`<section class="lost"><h1>Rain delay</h1><p>The league data could not be loaded. ${err.message}</p></section>`;
    return;
  }
  const { league, seasons } = state.model;
  if (!seasons.length) {
    view.innerHTML = html`<section class="lost"><h1>No seasons yet</h1><p>Add a season in the Dugout to get started.</p></section>`;
    return;
  }
  const saved = sessionStorage.getItem('sl.season');
  state.seasonId = seasons.some((s) => s.id === saved) ? saved : seasons.some((s) => s.id === league.currentSeason) ? league.currentSeason : seasons[seasons.length - 1].id;

  for (const el of document.querySelectorAll('[data-league-name]')) el.textContent = league.name;
  $('[data-league-tag]').textContent = league.tagline || '';
  const pick = $('[data-season]');
  pick.innerHTML = html`${[...seasons].reverse().map((s) => html`<option value="${s.id}">${s.name}</option>`)}`;
  pick.value = state.seasonId;
  pick.closest('label').hidden = seasons.length < 2;
  pick.onchange = () => {
    state.seasonId = pick.value;
    sessionStorage.setItem('sl.season', pick.value);
    drawLogo();
    drawTicker();
    route();
  };
  $('[data-nav="awards"]').hidden = !seasons.some((s) => s.allStars || s.awards.length);

  drawLogo();
  drawTicker();
  watchSpoilers();
  window.addEventListener('hashchange', route);
  route();
}

boot();
