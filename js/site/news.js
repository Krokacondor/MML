import { html } from '../lib/html.js';
import { markdown } from '../lib/markdown.js';
import { clip, byline, fmtDate, notFound } from './ui.js';

export function newsView(ctx) {
  const stories = ctx.model.articles;
  return {
    title: 'News',
    html: html`
      <header class="pagehead"><p class="script">From the</p><h1>Press Box</h1></header>
      ${stories.length
        ? html`<div class="clips clips--all">${stories.map(clip)}</div>`
        : html`<p class="empty">No stories yet. Come back later!</p>`}`,
  };
}

export function articleView(ctx, id) {
  const a = ctx.model.articles.find((x) => x.id === id);
  if (!a) return notFound('That story');
  return {
    title: a.title,
    html: html`
      <article class="story">
        <h1>${a.title}</h1>
        ${a.summary ? html`<p class="story__lede">${a.summary}</p>` : ''}
        <p class="dateline byline byline--story">${byline(a, 54)}<span>${a.author ? html`<b>By ${a.author}</b>` : ''}${fmtDate(a.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span></p>
        ${a.image
          ? html`<figure class="story__pic"><img src="${a.image}" alt="${a.caption || ''}">${a.caption ? html`<figcaption>${a.caption}</figcaption>` : ''}</figure>`
          : ''}
        <div class="story__body">${markdown(a.body)}</div>
        <p class="more"><a href="#/news">All stories</a></p>
      </article>`,
  };
}
