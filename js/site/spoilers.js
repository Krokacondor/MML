// Spoiler guard: every score starts blurred until the viewer clicks that game's
// eye. Which games a viewer has uncovered is remembered in their own browser, so
// a game opened once stays open on every page.

import { html } from '../lib/html.js';

const KEY = 'mml.revealed';
let open = new Set();
try {
  open = new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
} catch {}

const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...open]));
  } catch {}
};

export const isOpen = (id) => open.has(id);

// Class for anything that shows a game's result: "spoil" plus "is-hidden" until uncovered.
export const spoil = (id) => `spoil${open.has(id) ? '' : ' is-hidden'}`;

// The eye button. One id for a single game, several for a week or a series.
export const eye = (ids, label = 'score') => {
  const list = [].concat(ids);
  const shown = list.every(isOpen);
  return html`<button type="button" class="eye ${shown ? 'is-on' : ''}" data-eye="${list.join(' ')}"
    title="${shown ? `Hide the ${label}` : `Show the ${label}`}" aria-label="${shown ? `Hide the ${label}` : `Show the ${label}`}" aria-pressed="${shown}"><i class="eye__glyph" aria-hidden="true"></i></button>`;
};

// Uncover (or cover again) games everywhere on the page, ticker included.
export function setOpen(ids, on) {
  for (const id of ids) on ? open.add(id) : open.delete(id);
  save();
  for (const el of document.querySelectorAll('[data-spoil]')) el.classList.toggle('is-hidden', !open.has(el.dataset.spoil));
  for (const btn of document.querySelectorAll('[data-eye]')) {
    const shown = btn.dataset.eye.split(' ').every(isOpen);
    btn.classList.toggle('is-on', shown);
    btn.setAttribute('aria-pressed', shown);
    const label = btn.title.replace(/^(Show|Hide) the /, '');
    btn.title = `${shown ? 'Hide' : 'Show'} the ${label}`;
    btn.setAttribute('aria-label', btn.title);
  }
}

// One listener for the whole page: an eye flips its games, and clicking a
// blurred score that has no eye of its own uncovers it.
export function watchSpoilers() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-eye]');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const ids = btn.dataset.eye.split(' ').filter(Boolean);
      setOpen(ids, !ids.every(isOpen));
      return;
    }
    const hidden = e.target.closest('[data-spoil].is-hidden[data-tap]');
    if (hidden) {
      e.preventDefault();
      setOpen([hidden.dataset.spoil], true);
    }
  }, true);
}
