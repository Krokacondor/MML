// A small, safe Markdown renderer for league articles. Everything is escaped
// first, so article text can never inject markup into the page.
//
// Supported: # headings, **bold**, *italic*, `code`, [links](url), ![images](url),
// - bullet lists, 1. numbered lists, > quotes, and blank-line paragraphs.

import { esc, raw } from './html.js';

const safeUrl = (url) => (/^(https?:\/\/|#|\.{0,2}\/|[\w-]+[/.])/i.test(url) && !/^\s*javascript:/i.test(url) ? url : '#');

function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => `<img src="${safeUrl(url)}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => `<a href="${safeUrl(url)}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}

export function markdown(source) {
  const blocks = String(source ?? '').replace(/\r\n?/g, '\n').trim().split(/\n{2,}/);
  const out = blocks.map((block) => {
    const lines = block.split('\n');
    const heading = /^(#{1,3})\s+(.*)$/.exec(block);
    if (heading && lines.length === 1) {
      const level = heading[1].length + 1; // the page already owns <h1>
      return `<h${level}>${inline(heading[2])}</h${level}>`;
    }
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
    }
    if (lines.every((l) => /^>\s?/.test(l))) {
      return `<blockquote>${lines.map((l) => inline(l.replace(/^>\s?/, ''))).join('<br>')}</blockquote>`;
    }
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  });
  return raw(out.join('\n'));
}

// First paragraph as plain text, for article previews.
export function excerpt(source, max = 180) {
  const first = String(source ?? '')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .find((b) => b && !/^(#|!\[|>|[-*]\s|\d+[.)]\s)/.test(b));
  const plain = (first || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '').replace(/\s+/g, ' ');
  return plain.length > max ? plain.slice(0, max).replace(/\s+\S*$/, '') + '...' : plain;
}
