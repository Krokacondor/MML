// The league's social feed: made-up social media posts (pictures) by players,
// GMs and anyone else, filterable by team, player and kind of poster.

import { html, slug } from '../lib/html.js';
import { mug, pennant, teamVars, fmtDate } from './ui.js';
import { spoil, eye } from './spoilers.js';
import { gmLabel } from '../lib/league-ops.js';

export const feedName = (league) => league.feedName || 'League Banter';

const KINDS = [['', 'Everyone'], ['player', 'Players'], ['gm', 'GMs'], ['other', 'Others']];

// Who a post is by, as a small header above the picture.
function poster(model, post) {
  const team = post.team ? model.team(post.team) : null;
  const by = post.by || {};
  if (by.kind === 'player') {
    const name = model.canon(by.name);
    return html`<a class="post__who" href="#/player/${slug(name)}" style="${team ? teamVars(team) : ''}">
      ${mug(name, { size: 26, plate: true })}<span><b>${name}</b>${team ? html`<small>${pennant(team)}</small>` : ''}</span></a>`;
  }
  if (by.kind === 'gm' && team) {
    return html`<a class="post__who" href="#/team/${team.id}" style="${teamVars(team)}">
      <span class="post__gm">GM</span><span><b>${by.name || gmLabel(team)}</b><small>${pennant(team)}</small></span></a>`;
  }
  return html`<span class="post__who"><span class="post__gm post__gm--other">${(by.name || '?').slice(0, 1)}</span><span><b>${by.name || 'Unknown'}</b>${team ? html`<small>${pennant(team)}</small>` : ''}</span></span>`;
}

export function feedView(ctx) {
  const { model, league } = ctx;
  const posts = model.posts;
  const name = feedName(league);
  const teams = [...new Set(posts.map((p) => p.team).filter(Boolean))].map((id) => model.team(id)).sort((a, b) => a.name.localeCompare(b.name));
  const players = [...new Set(posts.filter((p) => p.by?.kind === 'player').map((p) => model.canon(p.by.name)))].sort();

  const card = (post) => {
    const id = `post-${post.id}`;
    const who = post.by?.kind === 'player' ? slug(model.canon(post.by.name)) : '';
    const pic = html`<a class="post__pic" href="${post.image}" target="_blank" rel="noopener">
      <img src="${post.image}" alt="${post.text || `Post by ${post.by?.name || 'someone'}`}" loading="lazy" ${post.width ? html`width="${post.width}" height="${post.height}"` : ''}></a>`;
    return html`<figure class="post" data-kind="${post.by?.kind || 'other'}" data-team="${post.team || ''}" data-player="${who}">
      <figcaption class="post__head">${poster(model, post)}<span class="post__date">${fmtDate(post.date)}</span>${post.spoiler ? eye(id, 'post') : ''}</figcaption>
      ${post.spoiler
        ? html`<div class="post__guard ${spoil(id)}" data-spoil="${id}" data-tap>${pic}<span class="post__cover only-hidden">Spoiler. Tap to show.</span></div>`
        : pic}
    </figure>`;
  };

  return {
    title: name,
    html: html`
      <header class="pagehead"><p class="script">Around the league</p><h1>${name}</h1></header>
      ${posts.length
        ? html`<div class="toolbar">
            <div class="seg" data-seg="kind">${KINDS.map(([v, label]) => html`<button type="button" data-value="${v}">${label}</button>`)}</div>
            ${teams.length ? html`<select data-team aria-label="Team"><option value="">All teams</option>${teams.map((t) => html`<option value="${t.id}">${t.name}</option>`)}</select>` : ''}
            ${players.length ? html`<select data-player aria-label="Player"><option value="">All players</option>${players.map((p) => html`<option value="${slug(p)}">${p}</option>`)}</select>` : ''}
          </div>
          <div class="posts">${posts.map(card)}</div>
          <p class="empty" data-none hidden>No posts match. Try another filter.</p>`
        : html`<p class="empty">No banter yet! Check back in later!</p>`}`,
    mount(root) {
      if (!posts.length) return;
      // Filters start from the link (#/feed?team=... or ?player=...), if any.
      const pick = { kind: ctx.q.kind || '', team: ctx.q.team || '', player: ctx.q.player || '' };
      const team = root.querySelector('[data-team]');
      const player = root.querySelector('[data-player]');
      const apply = () => {
        let shown = 0;
        for (const el of root.querySelectorAll('.post')) {
          const ok = (!pick.kind || el.dataset.kind === pick.kind) && (!pick.team || el.dataset.team === pick.team) && (!pick.player || el.dataset.player === pick.player);
          el.hidden = !ok;
          if (ok) shown++;
        }
        for (const b of root.querySelectorAll('[data-seg="kind"] button')) b.classList.toggle('is-on', b.dataset.value === pick.kind);
        root.querySelector('[data-none]').hidden = shown > 0;
      };
      root.querySelector('[data-seg="kind"]').onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        pick.kind = b.dataset.value;
        apply();
      };
      if (team) {
        team.value = pick.team;
        team.onchange = () => { pick.team = team.value; apply(); };
      }
      if (player) {
        player.value = pick.player;
        player.onchange = () => { pick.player = player.value; apply(); };
      }
      apply();
    },
  };
}
