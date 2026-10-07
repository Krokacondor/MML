// A small reader for .xlsx and .csv files. It only pulls cell values out of
// each sheet, which is all the game importer needs, so the site carries no
// third-party code. Every sheet comes back as { name, rows } where
// rows[rowIndex][colIndex] is a string, a number, or undefined.

const td = new TextDecoder();

async function inflateWithStream(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Reads the zip's central directory: name -> where its data sits.
function zipIndex(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let end = u8.length - 22;
  while (end >= 0 && dv.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('This file is not an .xlsx workbook.');
  const total = dv.getUint16(end + 10, true);
  let at = dv.getUint32(end + 16, true);
  const files = new Map();
  for (let i = 0; i < total && dv.getUint32(at, true) === 0x02014b50; i++) {
    const nameLen = dv.getUint16(at + 28, true);
    const name = td.decode(u8.subarray(at + 46, at + 46 + nameLen));
    files.set(name, {
      method: dv.getUint16(at + 10, true),
      size: dv.getUint32(at + 20, true),
      header: dv.getUint32(at + 42, true),
    });
    at += 46 + nameLen + dv.getUint16(at + 30, true) + dv.getUint16(at + 32, true);
  }
  return {
    has: (name) => files.has(name),
    async text(name, inflate) {
      const f = files.get(name);
      if (!f) return null;
      const start = f.header + 30 + dv.getUint16(f.header + 26, true) + dv.getUint16(f.header + 28, true);
      const data = u8.subarray(start, start + f.size);
      if (f.method === 0) return td.decode(data);
      if (f.method !== 8) throw new Error(`Unsupported compression in ${name}.`);
      return td.decode(await inflate(data));
    },
  };
}

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, e) => {
    if (e[0] !== '#') return ENTITY[e] ?? whole;
    return String.fromCodePoint(/^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });

const attr = (tag, name) => (new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag) || [])[1];

// All the <t> text runs inside a string item, joined.
function textOf(xml) {
  const clean = xml.replace(/<rPh[\s\S]*?<\/rPh>/g, '').replace(/<t(?:\s[^>]*)?\/>/g, '');
  let out = '';
  for (const m of clean.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return unxml(out);
}

const colIndex = (letters) => {
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

function parseSheet(xml, shared) {
  const rows = [];
  for (const m of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = /(?:^|\s)r="([A-Z]+)(\d+)"/.exec(m[1]);
    if (!ref || m[2] == null) continue;
    const type = attr(m[1], 't') || 'n';
    let value;
    if (type === 'inlineStr') {
      value = textOf(m[2]);
    } else {
      const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(m[2]);
      if (!v) continue; // a formula nobody has calculated yet
      const text = unxml(v[1]);
      if (type === 's') value = shared[Number(text)];
      else if (type === 'str' || type === 'e') value = text;
      else value = Number(text);
    }
    if (typeof value === 'string') value = value.trim();
    if (value === '' || value == null || Number.isNaN(value)) continue;
    const r = Number(ref[2]) - 1;
    (rows[r] ||= [])[colIndex(ref[1])] = value;
  }
  return Array.from(rows, (r) => r || []);
}

export async function readXlsx(data, inflate = inflateWithStream) {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  const zip = zipIndex(u8);
  const workbook = await zip.text('xl/workbook.xml', inflate);
  if (!workbook) throw new Error('This file is not an .xlsx workbook.');

  const targets = new Map();
  const rels = (await zip.text('xl/_rels/workbook.xml.rels', inflate)) || '';
  for (const m of rels.matchAll(/<Relationship\s[^>]*>/g)) targets.set(attr(m[0], 'Id'), attr(m[0], 'Target'));

  const sst = await zip.text('xl/sharedStrings.xml', inflate);
  const shared = sst ? [...sst.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g)].map((m) => textOf(m[1] || '')) : [];

  const sheets = [];
  for (const m of workbook.matchAll(/<sheet\s[^>]*>/g)) {
    const target = targets.get(attr(m[0], 'r:id'));
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
    const xml = await zip.text(path, inflate);
    if (xml) sheets.push({ name: unxml(attr(m[0], 'name') || ''), rows: parseSheet(xml, shared) });
  }
  return sheets;
}

export function readCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (src[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) =>
    r.map((v) => {
      const t = v.trim();
      if (t === '') return undefined;
      return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
    }),
  );
}
