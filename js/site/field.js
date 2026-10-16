// A drawn baseball diamond with players standing at their positions: the
// All-Star rosters (awards.js) and each team's end-of-season lineup (teams.js).

import { html, slug } from '../lib/html.js';
import { mug, teamVars } from './ui.js';

// Where each position stands: [left %, top] in the drawing's units
// (100 wide, FIELD_H tall), home plate at 50, 88.
const FIELD_H = 118;
const SPOTS = { CF: [50, 17], LF: [17, 29], RF: [83, 29], SS: [35, 45], '2B': [65, 45], '3B': [17, 64], '1B': [83, 64], P: [50, 66], C: [50, 95] };

// One player on the field: picture, position tag, name, and the team's short
// name when the field mixes teams.
export function fieldStar(model, name, pos, team, { abbr = true } = {}) {
  return html`<a class="field__star" href="#/player/${slug(model.canon(name))}" style="${teamVars(team)}">
    ${mug(model.canon(name), { size: 40, plate: true })}
    <span class="field__pos">${pos}</span>
    <span class="field__name">${name}</span>
    ${abbr ? html`<span class="field__team">${team.abbr}</span>` : ''}
  </a>`;
}

// spots: [{ pos, stars: [html] }]; a position the drawing doesn't know is left off.
export function diamond(spots) {
  const spot = ({ pos, stars }) => {
    const at = SPOTS[pos];
    return at ? html`<div class="field__spot" style="left:${at[0]}%;top:${(at[1] / FIELD_H) * 100}%">${stars}</div>` : '';
  };
  return html`<div class="field" style="aspect-ratio:100/${FIELD_H}">
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
    ${spots.map(spot)}
  </div>`;
}
