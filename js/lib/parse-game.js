// Turns the sheets of one game file into a game record.
//
// Expected sheets (matched by their contents, not their names or order):
//   Game Info  a laid-out summary: "Team VS Team", score, stadium, lineups, scorecard
//   Stats      one row per batter, with a header row starting Team / Player / Position
//   Pitching   one row per pitcher, with a header row starting Player / Team
// Only the Stats sheet is required. Team total rows are skipped: the site does
// its own adding up.

import { BAT_BY_HEADER, BAT_IGNORED, PIT_BY_HEADER, PIT_IGNORED, normHeader } from './statdefs.js';

const str = (v) => (v == null ? '' : String(v).trim());
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const is = (re) => (cell) => re.test(str(cell.v));

function findTable(sheets, needed) {
  for (const sheet of sheets) {
    const at = sheet.rows.findIndex((r) => {
      if (!r) return false;
      const heads = new Set(r.map(normHeader));
      return needed.every((n) => heads.has(n));
    });
    if (at >= 0) return { sheet, at };
  }
  return null;
}

function parseBatting({ sheet, at }, unknown) {
  const head = sheet.rows[at].map(str);
  const where = (name) => head.findIndex((h) => normHeader(h) === name);
  const iTeam = where('team');
  const iPlayer = where('player');
  const iPos = where('position') >= 0 ? where('position') : where('pos');
  const blocks = [];
  let cur = null;
  for (const row of sheet.rows.slice(at + 1)) {
    if (!row) continue;
    const label = iTeam >= 0 ? str(row[iTeam]) : '';
    if (label && (!cur || cur.label !== label)) blocks.push((cur = { label, rows: [] }));
    const player = str(row[iPlayer]);
    if (!player) continue;
    if (!cur) blocks.push((cur = { label: '', rows: [] }));
    const pos = iPos >= 0 ? str(row[iPos]) : '';
    if (/^n\/?a$/i.test(pos) || /\btotals?$/i.test(player) || (!pos && player === cur.label)) continue;
    const line = { p: player.replace(/\s+/g, ' ') };
    if (pos) line.pos = pos;
    head.forEach((h, i) => {
      const key = normHeader(h);
      if (!key || i === iTeam || i === iPlayer || i === iPos || BAT_IGNORED.has(key)) return;
      const known = BAT_BY_HEADER.get(key);
      if (!known) unknown.add(h);
      const v = num(row[i]);
      if (!v) return;
      if (known) line[known] = v;
      else (line.x ||= {})[h] = v;
    });
    cur.rows.push(line);
  }
  return blocks;
}

function parsePitching({ sheet, at }, unknown) {
  const head = sheet.rows[at].map(str);
  const where = (name) => head.findIndex((h) => normHeader(h) === name);
  const iTeam = where('team');
  const iPlayer = where('player');
  const iIP = where('inningspitched');
  const out = [];
  for (const row of sheet.rows.slice(at + 1)) {
    if (!row) continue;
    const player = str(row[iPlayer]);
    if (!player || /\btotals?$/i.test(player)) continue;
    const line = { p: player.replace(/\s+/g, ' '), label: iTeam >= 0 ? str(row[iTeam]) : '' };
    const outs = iIP >= 0 ? Math.round(num(row[iIP]) * 3) : 0;
    if (outs) line.outs = outs;
    head.forEach((h, i) => {
      const key = normHeader(h);
      if (!key || i === iTeam || i === iPlayer || PIT_IGNORED.has(key)) return;
      const known = PIT_BY_HEADER.get(key);
      if (!known) unknown.add(h);
      const v = num(row[i]);
      if (!v) return;
      if (known) line[known] = v;
      else (line.x ||= {})[h] = v;
    });
    out.push(line);
  }
  return out;
}

// The Game Info sheet is a picture more than a table, so it is read by
// landmarks: the "VS" cell, the Name/Pos lineup header and the "Scorecard" label.
function parseInfo(sheet) {
  const info = { names: [], scores: [], users: [], stadium: '', settings: {}, lineups: [[], []], lines: [], lineNames: [], finals: [] };
  if (!sheet) return info;
  // Array.from fills the gaps left by blank spreadsheet rows.
  const rows = Array.from(sheet.rows, (r) => (r ? r.map((v, c) => ({ v, c })).filter((x) => x.v !== undefined) : []));
  const isVs = is(/^vs\.?$/i);
  const vsRow = rows.findIndex((r) => r.some(isVs));
  if (vsRow < 0) return info;

  const vs = rows[vsRow].find(isVs);
  const texts = rows[vsRow].filter((x) => typeof x.v === 'string' && x !== vs);
  info.names = [str(texts.filter((x) => x.c < vs.c).pop()?.v), str(texts.find((x) => x.c > vs.c)?.v)];

  const lineupRow = rows.findIndex((r, n) => n > vsRow && r.some(is(/^name$/i)) && r.some(is(/^pos/i)));
  const cardRow = rows.findIndex((r, n) => n > vsRow && r.some(is(/^scorecard$/i)));
  const headerEnd = [lineupRow, cardRow, rows.length].filter((n) => n >= 0).sort((a, b) => a - b)[0];

  for (const r of rows.slice(vsRow + 1, headerEnd)) {
    const nums = r.filter((x) => typeof x.v === 'number');
    const strs = r.filter((x) => typeof x.v === 'string');
    if (nums.length === 2 && !strs.length && !info.scores.length) info.scores = nums.map((x) => x.v);
    else if (strs.length === 2 && !nums.length && !info.users.length) info.users = strs.map((x) => str(x.v));
    else if (strs.length === 1 && !nums.length) {
      const text = str(strs[0].v);
      const setting = /^(innings|mercy|stars?|items?)\s*-\s*(.+)$/i.exec(text) || (info.stadium && /^(.+?)\s+-\s+(.+)$/.exec(text));
      if (setting) info.settings[setting[1]] = setting[2];
      else if (!info.stadium) info.stadium = text;
    }
  }

  if (lineupRow >= 0) {
    const nameCols = rows[lineupRow].filter(is(/^name$/i)).map((x) => x.c);
    const posCols = rows[lineupRow].filter(is(/^pos/i)).map((x) => x.c);
    const stop = cardRow > lineupRow ? cardRow : rows.length;
    for (let n = lineupRow + 1; n < stop; n++) {
      const r = sheet.rows[n] || [];
      nameCols.slice(0, 2).forEach((c, side) => {
        if (str(r[c])) info.lineups[side].push({ p: str(r[c]), pos: str(r[posCols[side]]) });
      });
    }
  }

  if (cardRow >= 0) {
    const headAt = rows.findIndex((r, n) => n > cardRow && r.some(is(/^final$/i)));
    if (headAt >= 0) {
      const finalCol = rows[headAt].find(is(/^final$/i)).c;
      const inningCols = rows[headAt].filter((x) => x.c < finalCol && typeof x.v === 'number').map((x) => x.c);
      rows
        .slice(headAt + 1)
        .filter((r) => r.length)
        .slice(0, 2)
        .forEach((r) => {
          const cells = sheet.rows[rows.indexOf(r)];
          info.lineNames.push(str(r.find((x) => typeof x.v === 'string' && x.c < inningCols[0])?.v));
          info.lines.push(inningCols.map((c) => (typeof cells[c] === 'number' ? cells[c] : cells[c] == null ? null : str(cells[c]))));
          info.finals.push(typeof cells[finalCol] === 'number' ? cells[finalCol] : null);
        });
    }
  }
  return info;
}

// Short, stable id for "is this the same game?" checks.
function fingerprint(value) {
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify(value)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function parseGame(sheets) {
  const warnings = [];
  const unknown = new Set();

  const batTable = findTable(sheets, ['player', 'atbats']);
  if (!batTable) throw new Error('No batting stats found. The file needs a sheet with "Player" and "At-Bats" columns.');
  const pitTable = findTable(sheets, ['player', 'battersfaced']);
  const infoSheet = sheets.find(
    (s) => s !== batTable.sheet && s !== pitTable?.sheet && s.rows.some((r) => r && r.some((v) => /^vs\.?$/i.test(str(v)))),
  );

  const blocks = parseBatting(batTable, unknown);
  if (blocks.length !== 2) {
    throw new Error(`Expected two teams in the batting stats but found ${blocks.length}. Is this a single game?`);
  }
  const pitchers = pitTable ? parsePitching(pitTable, unknown) : [];
  const info = parseInfo(infoSheet);
  if (!pitTable) warnings.push('No pitching sheet was found, so this game has no pitching stats.');
  if (!infoSheet) warnings.push('No Game Info sheet was found. Team names and the score were taken from the batting stats.');

  // Which stat block is which side? Lineup names decide; file order is the fallback.
  const overlap = (blk, side) => blocks[blk].rows.filter((r) => info.lineups[side].some((l) => l.p === r.p)).length;
  const flipped = overlap(0, 1) + overlap(1, 0) > overlap(0, 0) + overlap(1, 1);
  const blockOf = flipped ? [1, 0] : [0, 1];
  // The scorecard lists the team that bats first (the away team) on top.
  const leftIsHome = info.names[0] !== info.names[1] && info.lineNames[0] && info.lineNames[0] === info.names[1];
  const sides = leftIsHome ? [1, 0] : [0, 1]; // [away, home] as indexes into the Game Info left/right

  const makeSide = (infoIdx) => {
    const block = blocks[blockOf[infoIdx]];
    const runs = block.rows.reduce((n, r) => n + (r.r || 0), 0);
    const lineIdx = info.lineNames.indexOf(info.names[infoIdx]);
    const score = info.scores[infoIdx] ?? (lineIdx >= 0 ? info.finals[lineIdx] : null) ?? runs;
    const name = info.names[infoIdx] || block.label || `Team ${infoIdx + 1}`;
    if (runs !== score) warnings.push(`${name}: the score is ${score} but the batters' runs add up to ${runs}.`);
    if (block.rows.length !== 9) warnings.push(`${name}: ${block.rows.length} batters listed (a lineup is usually 9).`);
    return { name, label: block.label, score, user: info.users[infoIdx] || '', line: lineIdx >= 0 ? info.lines[lineIdx] : [], block };
  };
  const away = makeSide(sides[0]);
  const home = makeSide(sides[1]);
  // A blank last inning for the home team is a bottom half never played
  // (the home team was already ahead), so show X rather than "unknown".
  const last = away.line.length - 1;
  if (last >= 0 && home.line.length === away.line.length && home.line[last] == null && away.line[last] != null) {
    home.line = [...home.line.slice(0, last), 'X'];
  }

  const batting = [];
  for (const [t, side] of [['a', away], ['h', home]]) {
    for (const row of side.block.rows) {
      const parts = (row.b1 || 0) + (row.b2 || 0) + (row.b3 || 0) + (row.hr || 0);
      if ((row.h || 0) !== parts) warnings.push(`${row.p}: ${row.h || 0} hits, but singles through home runs add up to ${parts}.`);
      batting.push({ t, ...row });
    }
  }

  const pitching = pitchers.map(({ label, ...row }) => {
    let t = label && label === away.label ? 'a' : label && label === home.label ? 'h' : null;
    if (!t) t = home.block.rows.some((r) => r.p === row.p) && !away.block.rows.some((r) => r.p === row.p) ? 'h' : 'a';
    return { t, ...row };
  });
  if (pitching.length) {
    for (const [t, side, opp] of [['a', away, home], ['h', home, away]]) {
      const allowed = pitching.filter((r) => r.t === t).reduce((n, r) => n + (r.r || 0), 0);
      if (allowed !== opp.score) warnings.push(`${side.name} pitchers allowed ${allowed} runs but ${opp.name} scored ${opp.score}.`);
    }
  }
  if (unknown.size) {
    warnings.push(`Columns the site does not know yet (saved, but not shown): ${[...unknown].join(', ')}.`);
  }

  const strip = ({ block, ...side }) => side;
  const game = {
    stadium: info.stadium,
    settings: info.settings,
    away: strip(away),
    home: strip(home),
    batting,
    pitching,
  };
  game.fp = fingerprint([game.away.name, game.home.name, game.away.score, game.home.score, batting, pitching]);
  return { game, warnings };
}
