// A season's draft, in-season moves (trades and free agency) and end-of-season
// rosters, as read from the season file's "draft", "moves" and "rosters".

import { html, slug } from '../lib/html.js';
import { teamsIn } from '../lib/aggregate.js';
import { diamond, fieldStar } from './field.js';
import { mug, pennant, teamVars } from './ui.js';

export const ordinal = (n) => {
  const tens = n % 100;
  const end = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${n}${end}`;
};

export const seasonShort = (season) => {
  const n = season.name.match(/\d+/);
  return n ? `S${n[0]}` : season.name;
};

// Picks with their overall number (rounds are as long as round 1).
export function draftOf(season) {
  const perRound = season.draft.filter((d) => d.round === 1).length || 1;
  return season.draft.map((d) => ({ ...d, overall: (d.round - 1) * perRound + d.pick }));
}

const same = (model, a, b) => slug(model.canon(a)) === slug(model.canon(b));

// A player's name, linked when the player has a page.
export function who(model, name) {
  const s = slug(model.canon(name));
  return model.players.has(s) ? html`<a href="#/player/${s}">${model.canon(name)}</a>` : html`${name}`;
}
const list = (model, names) => html`${names.map((n, i) => html`${i ? (i === names.length - 1 ? ' and ' : ', ') : ''}${who(model, n)}`)}`;
const chip = (model, id) => {
  const team = model.team(id);
  return html`<a class="tcell" href="#/team/${team.id}">${pennant(team)}<span>${team.name}</span></a>`;
};

export const pickOf = (model, season, name) => draftOf(season).find((d) => same(model, d.p, name));

// Where a player finished the season: { team, order (1-9) or 0 for the bench, pos, captain }.
export function finishOf(model, season, name) {
  for (const r of season.rosters) {
    const at = r.lineup.findIndex((l) => same(model, l.p, name));
    const benched = r.bench.some((p) => same(model, p, name));
    if (at >= 0 || benched) return { team: r.team, order: at + 1, pos: at >= 0 ? r.lineup[at].pos : '', captain: same(model, r.captain, name) };
  }
  return null;
}

// The World Series result from its games: { winner, runnerUp } team ids, or null.
export function worldSeries(season) {
  const games = season.games.filter((g) => g.type === 'playoffs' && /world series/i.test(g.round || '') && !g.notPlayed);
  if (!games.length) return null;
  const wins = new Map();
  for (const g of games) {
    if (g.away.score === g.home.score) continue;
    const won = g.away.score > g.home.score ? g.away.team : g.home.team;
    wins.set(won, (wins.get(won) || 0) + 1);
  }
  const teams = [...new Set(games.flatMap((g) => [g.away.team, g.home.team]))];
  if (teams.length !== 2) return null;
  const [a, b] = teams;
  const wa = wins.get(a) || 0;
  const wb = wins.get(b) || 0;
  if (wa === wb) return null;
  return wa > wb ? { winner: a, runnerUp: b } : { winner: b, runnerUp: a };
}

// World Series rings for a player: everyone on the finalists' end-of-season
// rosters, bench included. [{ season, won }]
export function ringsFor(model, P) {
  const rings = [];
  for (const season of model.seasons) {
    const ws = worldSeries(season);
    if (!ws) continue;
    const entry = P.seasons.find((x) => x.season === season);
    if (!entry) continue;
    const team = season.rosters.length ? finishOf(model, season, P.name)?.team : entry.reg?.teamId;
    if (team === ws.winner) rings.push({ season, won: true });
    else if (team === ws.runnerUp) rings.push({ season, won: false });
  }
  return rings;
}

// A team's accolades in every season: GM awards and World Series finishes.
export function teamHonors(model, id) {
  const out = [];
  for (const season of model.seasons) {
    for (const a of season.awards) {
      if (a.winners.some((w) => w.gm && w.team === id)) out.push({ label: `${season.name} ${a.title}`, href: `#/awards?season=${season.id}` });
    }
    const ws = worldSeries(season);
    if (ws?.winner === id) out.push({ label: `${season.name} World Series Champions`, href: `#/games?season=${season.id}` });
    if (ws?.runnerUp === id) out.push({ label: `${season.name} World Series Runners-Up`, href: `#/games?season=${season.id}` });
  }
  return out;
}

// Every GM the site knows: team GMs and GMs of clubs still to be announced. slug -> name
export function gmNames(model) {
  const names = new Map();
  for (const t of model.teams.values()) if (t.gm) names.set(slug(t.gm), t.gm);
  for (const s of model.seasons) for (const p of s.pending) if (p.gm && !names.has(slug(p.gm))) names.set(slug(p.gm), p.gm);
  return names;
}

// The teams a GM has run: [{ team, seasons }], oldest first.
export function gmTeams(model, gm) {
  return [...model.teams.values()]
    .filter((t) => t.gm && slug(t.gm) === slug(gm))
    .map((team) => ({ team, seasons: model.seasons.filter((s) => teamsIn(model, s).some((x) => x.id === team.id)) }))
    .filter((x) => x.seasons.length)
    .sort((a, b) => model.seasons.indexOf(a.seasons[0]) - model.seasons.indexOf(b.seasons[0]));
}

// A GM's accolades: GM awards, and World Series finishes of the teams they ran.
export function gmHonors(model, gm) {
  const teams = gmTeams(model, gm);
  const out = [];
  for (const season of model.seasons) {
    for (const a of season.awards) {
      if (a.winners.some((w) => w.gm && slug(w.gm) === slug(gm))) out.push({ label: `${season.name} ${a.title}`, href: `#/awards?season=${season.id}` });
    }
    const ws = worldSeries(season);
    const mine = teams.find((t) => t.seasons.includes(season))?.team.id;
    if (ws && mine === ws.winner) out.push({ label: `${season.name} World Series Champion`, href: `#/games?season=${season.id}` });
    if (ws && mine === ws.runnerUp) out.push({ label: `${season.name} World Series Runner-Up`, href: `#/games?season=${season.id}` });
  }
  return out;
}

// Stands in for a team for players who ended a season unsigned: gray, "FA".
export const FREE_AGENT = { id: '', name: 'Free agent', abbr: 'FA', colors: ['#7b838a', '#d3d7da'] };

// True when a season has end-of-season rosters and the player is on none of
// them: released and never signed again, or never on a team at all.
export function freeAgentAtEnd(model, season, name) {
  const all = teamsIn(model, season).every((t) => season.rosters.some((r) => r.team === t.id));
  return season.rosters.length > 0 && all && !finishOf(model, season, name);
}

// One season of a player's story: drafted, traded or signed, and where they finished.
export function playerStory(model, season, name) {
  const lines = [];
  const pick = pickOf(model, season, name);
  if (!pick && freeAgentAtEnd(model, season, name) && !season.moves.some((m) => same(model, m.p, name))) {
    return season.draft.length ? [html`Free agent all season`] : [];
  }
  if (pick) lines.push(html`Drafted by ${chip(model, pick.team)} in round ${pick.round}, pick ${pick.pick} (${ordinal(pick.overall)} overall)`);
  for (const m of season.moves.filter((x) => same(model, x.p, name))) {
    const deal = season.moves.filter((x) => x.deal === m.deal && x !== m);
    const back = deal.filter((x) => x.from === m.to && x.to === m.from).map((x) => x.p);
    const what = m.from && m.to
      ? html`traded to ${chip(model, m.to)}${back.length ? html` for ${list(model, back)}` : ''}`
      : m.to
        ? html`signed by ${chip(model, m.to)} from free agency`
        : html`released to free agency`;
    lines.push(html`<b>${m.when}:</b> ${what}`);
  }
  if (!pick && lines.length && season.draft.length) lines.unshift(html`Undrafted`);
  return lines;
}

// One team's deals in a season, in order, told from that team's side.
export function teamMoves(model, season, id) {
  const deals = [...new Set(season.moves.filter((m) => m.from === id || m.to === id).map((m) => m.deal))];
  return deals.map((d) => {
    const deal = season.moves.filter((m) => m.deal === d);
    const gave = deal.filter((m) => m.from === id).map((m) => m.p);
    const got = deal.filter((m) => m.to === id).map((m) => m.p);
    const partner = deal.map((m) => (m.from === id ? m.to : m.from)).find((t) => t && t !== id);
    const text = partner
      ? html`Traded ${list(model, gave)} to ${chip(model, partner)}${got.length ? html` for ${list(model, got)}` : ''}`
      : html`${got.length ? html`Signed ${list(model, got)}` : ''}${got.length && gave.length ? ', released ' : gave.length ? 'Released ' : ''}${gave.length ? list(model, gave) : ''}`;
    return { when: deal[0].when, text };
  });
}

// The end-of-season lineup card: batting order, positions, captain and bench.
export function lineupCard(model, season, id) {
  const r = season.rosters.find((x) => x.team === id);
  if (!r) return '';
  const team = model.team(id);
  const row = (p, label, pos, sub = false) => html`<li class="lineup__row" style="${teamVars(team)}">
    <span class="lineup__n ${sub ? 'lineup__n--sub' : ''}">${label}</span>${mug(model.canon(p), { size: 26, plate: true })}
    <span class="lineup__who">${who(model, p)}${same(model, r.captain, p) ? html`<i class="tag">Captain</i>` : ''}</span>
    <b class="lineup__pos">${pos}</b></li>`;
  const board = html`<ol class="lineup"><li class="lineup__head"><span>${team.name}</span><b>Lineup</b></li>${r.lineup.map((l, i) => row(l.p, i + 1, l.pos))}${r.bench.map((p) => row(p, 'Sub', '', true))}</ol>`;
  const field = diamond(r.lineup.map((l) => ({ pos: l.pos, stars: [fieldStar(model, l.p, l.pos, team, { abbr: false })] })));
  return html`<div class="lineupwrap">${board}<div class="lineupwrap__field">${field}</div></div>`;
}
