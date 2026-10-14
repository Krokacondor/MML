// Every stat the league tracks: its column name in the game file, the short
// key it is stored under, and how the site labels and formats it.

export const normHeader = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// ---- Game file columns -> stored keys -------------------------------------

const BAT_FILE = [
  ['At-Bats', 'ab'], ['Plate Appearances', 'pa'], ['Runs', 'r'], ['Hits', 'h'], ['RBI', 'rbi'],
  ['Strikeouts', 'so'], ['Walks', 'bb'], ['Hit By Pitch', 'hbp'], ['Singles', 'b1'], ['Doubles', 'b2'],
  ['Triples', 'b3'], ['Home Runs', 'hr'], ['1HR', 'hr1'], ['2HR', 'hr2'], ['3HR', 'hr3'],
  ['Grand Slams', 'gs'], ['ITP Home Runs', 'itphr'], ['Total Bases', 'tb'], ['Sac Flys', 'sf'],
  ['Double Plays Hit Into', 'gidp'], ['Triple Plays Hit Into', 'gitp'], ['Buddy Jumps Hit Into', 'bjhi'],
  ['Star Swings', 'ssw'], ['Star Hits', 'sh'], ['Stars Used', 'su'], ['Stolen Bases', 'sb'],
  ['Caught Stealing', 'cs'], ['Steal Attempts', 'sba'], ['Putouts', 'po'], ['Assists', 'a'],
  ['Buddy Jump Putouts', 'bjpo'], ['Buddy Jump Attempts', 'bja'], ['Double Plays', 'dp'],
  ['Triple Plays', 'tp'], ['Bobbles', 'bob'], ['Star Bases Helper', 'sbh'],
];

const PIT_FILE = [
  ['Batters Faced', 'bf'], ['Pitches', 'np'], ['Strikes', 'str'], ['Balls', 'ball'], ['Strikeouts', 'k'],
  ['Walks', 'bb'], ['Bean Balls', 'hb'], ['Hits Allowed', 'h'], ['Runs Allowed', 'r'],
  ['Singles Allowed', 'b1'], ['Doubles Allowed', 'b2'], ['Triples Allowed', 'b3'], ['HR Allowed', 'hr'],
  ['Earned Runs', 'er'], ['Inherited Runs', 'ir'], ['Star Pitches', 'sp'], ['Stars Used', 'su'],
  ['Pickoffs', 'pk'], ['Pickoff Attempts', 'pka'], ['At-Bats Against Helper', 'aba'],
  ['Total Bases Allowed Helper', 'tba'],
];

export const BAT_KEYS = BAT_FILE.map((x) => x[1]);
// Innings pitched is stored as outs so thirds of an inning add up exactly.
export const PIT_KEYS = ['outs', ...PIT_FILE.map((x) => x[1])];

export const BAT_BY_HEADER = new Map([...BAT_FILE, ['Sac Flies', 'sf']].map(([h, k]) => [normHeader(h), k]));
export const PIT_BY_HEADER = new Map(PIT_FILE.map(([h, k]) => [normHeader(h), k]));

// Columns the site works out itself, so the file's copy is not stored.
export const BAT_IGNORED = new Set(
  ['Team', 'Player', 'Position', 'Batting Average', 'On Base %', 'Slug %', 'On Base + Slug', 'Star Slug %'].map(normHeader),
);
export const PIT_IGNORED = new Set(
  ['Team', 'Player', 'Innings Pitched', 'ERA-7', 'ERA-9', 'WHIP', 'BA Against', 'OB% Against', 'SLG Against', 'OPS Against'].map(normHeader),
);

// ---- Formulas (same ones the game file uses) ------------------------------

const z = (v) => v || 0;
const div = (a, b) => (b ? a / b : null);
const perOuts = (n, s) => (z(s.outs) ? n / s.outs : n > 0 ? Infinity : null);
const sum2 = (a, b) => (a == null && b == null ? null : z(a) + z(b));

export const RATES = {
  avg: (s) => div(z(s.h), z(s.ab)),
  obp: (s) => div(z(s.h) + z(s.bb) + z(s.hbp), z(s.pa)),
  slg: (s) => div(z(s.tb), z(s.ab)),
  ops: (s) => sum2(RATES.obp(s), RATES.slg(s)),
  starSlg: (s) => div(z(s.sbh), z(s.su)),
  era7: (s) => perOuts(z(s.er) * 21, s),
  era9: (s) => perOuts(z(s.er) * 27, s),
  whip: (s) => perOuts((z(s.bb) + z(s.h)) * 3, s),
  baa: (s) => div(z(s.h), z(s.aba)),
  obpa: (s) => div(z(s.h) + z(s.bb) + z(s.hb), z(s.bf)),
  slga: (s) => div(z(s.tba), z(s.aba)),
  opsa: (s) => sum2(RATES.obpa(s), RATES.slga(s)),
};

// ---- Formatting -----------------------------------------------------------

export const fmtInt = (v) => (v == null ? '-' : String(v));
export const fmtAvg = (v) => (v == null ? '-' : !isFinite(v) ? 'INF' : v.toFixed(3).replace(/^0\./, '.'));
export const fmt2 = (v) => (v == null ? '-' : !isFinite(v) ? 'INF' : v.toFixed(2));
export const fmtIP = (outs) => `${Math.floor(z(outs) / 3)}.${z(outs) % 3}`;

// ---- Display columns ------------------------------------------------------
// A column reads from a record shaped { g, gp, bat: {...}, pit: {...} }.
//
// A record from a season that only kept some stats also carries
// tracked = { bat: [keys], pit: [keys] }. Anything not on that list shows as
// "-" (unknown) instead of a 0 that was never actually counted.

const kept = (r, src, keys) => !r.tracked || keys.every((k) => r.tracked[src]?.includes(k));

// What each rate stat needs to have been recorded before it means anything.
const NEEDS = {
  avg: ['h', 'ab'], obp: ['h', 'bb', 'pa'], slg: ['tb', 'ab'], ops: ['h', 'bb', 'pa', 'tb', 'ab'], starSlg: ['sbh', 'su'],
  p_era7: ['er', 'outs'], p_era9: ['er', 'outs'], p_whip: ['bb', 'h', 'outs'], p_baa: ['h', 'aba'],
  p_obpa: ['h', 'bb', 'bf'], p_slga: ['tba', 'aba'], p_opsa: ['h', 'bb', 'bf', 'tba', 'aba'],
};

const count = (src, id, label, title, key = id) => ({
  id, label, title, src, needs: [key], val: (r) => (kept(r, src, [key]) ? z(r[src]?.[key]) : null), fmt: fmtInt,
});
const rate = (src, id, label, title, fn, o = {}) => ({
  id, label, title, src, needs: NEEDS[id], val: (r) => (kept(r, src, NEEDS[id]) ? fn(r[src] || {}) : null), fmt: fmtAvg, rate: src, ...o,
});
const b = (id, label, title) => count('bat', id, label, title);
const p = (key, label, title) => count('pit', 'p_' + key, label, title, key);

export const C = {
  // Games are null (shown as "-") for seasons recorded as totals, where nobody counted them.
  g: { id: 'g', label: 'G', title: 'Games played', val: (r) => r.g ?? null, fmt: fmtInt },
  gp: { id: 'gp', label: 'G', title: 'Games pitched', val: (r) => r.gp ?? null, fmt: fmtInt },

  pa: b('pa', 'PA', 'Plate appearances'),
  ab: b('ab', 'AB', 'At-bats'),
  r: b('r', 'R', 'Runs scored'),
  h: b('h', 'H', 'Hits'),
  b1: b('b1', '1B', 'Singles'),
  b2: b('b2', '2B', 'Doubles'),
  b3: b('b3', '3B', 'Triples'),
  hr: b('hr', 'HR', 'Home runs'),
  rbi: b('rbi', 'RBI', 'Runs batted in'),
  bb: b('bb', 'BB', 'Walks'),
  so: b('so', 'SO', 'Strikeouts'),
  hbp: b('hbp', 'HBP', 'Hit by pitch'),
  sf: b('sf', 'SF', 'Sacrifice flies'),
  tb: b('tb', 'TB', 'Total bases'),
  sb: b('sb', 'SB', 'Stolen bases'),
  cs: b('cs', 'CS', 'Caught stealing'),
  sba: b('sba', 'SBA', 'Steal attempts'),
  avg: rate('bat', 'avg', 'AVG', 'Batting average: hits / at-bats', RATES.avg),
  obp: rate('bat', 'obp', 'OBP', 'On-base percentage: (hits + walks + hit by pitch) / plate appearances', RATES.obp),
  slg: rate('bat', 'slg', 'SLG', 'Slugging percentage: total bases / at-bats', RATES.slg),
  ops: rate('bat', 'ops', 'OPS', 'On-base plus slugging', RATES.ops),

  hr1: b('hr1', '1HR', 'Solo home runs'),
  hr2: b('hr2', '2HR', 'Two-run home runs'),
  hr3: b('hr3', '3HR', 'Three-run home runs'),
  gs: b('gs', 'GS', 'Grand slams'),
  itphr: b('itphr', 'ITP', 'Inside-the-park home runs'),
  gidp: b('gidp', 'GIDP', 'Double plays hit into'),
  gitp: b('gitp', 'GITP', 'Triple plays hit into'),
  bjhi: b('bjhi', 'BJHI', 'Buddy jumps hit into'),
  ssw: b('ssw', 'SSW', 'Star swings'),
  sh: b('sh', 'SH', 'Star hits'),
  su: b('su', 'SU', 'Stars used at the plate'),
  sbh: b('sbh', 'STB', 'Total bases on star hits'),
  starSlg: rate('bat', 'starSlg', 'SSLG', 'Star slugging: bases on star hits / stars used', RATES.starSlg),

  po: b('po', 'PO', 'Putouts'),
  a: b('a', 'A', 'Assists'),
  dp: b('dp', 'DP', 'Double plays turned'),
  tp: b('tp', 'TP', 'Triple plays turned'),
  bjpo: b('bjpo', 'BJPO', 'Buddy jump putouts'),
  bja: b('bja', 'BJA', 'Buddy jump attempts'),
  bob: b('bob', 'BOB', 'Bobbles'),

  p_ip: { ...count('pit', 'p_ip', 'IP', 'Innings pitched', 'outs'), fmt: (v) => (v == null ? '-' : fmtIP(v)) },
  p_bf: p('bf', 'BF', 'Batters faced'),
  p_np: p('np', 'NP', 'Pitches thrown'),
  p_str: p('str', 'STR', 'Strikes'),
  p_ball: p('ball', 'BALL', 'Balls'),
  p_k: p('k', 'K', 'Strikeouts'),
  p_bb: p('bb', 'BB', 'Walks allowed'),
  p_hb: p('hb', 'HB', 'Bean balls (batters hit)'),
  p_h: p('h', 'H', 'Hits allowed'),
  p_r: p('r', 'R', 'Runs allowed'),
  p_er: p('er', 'ER', 'Earned runs'),
  p_ir: p('ir', 'IR', 'Inherited runs'),
  p_b1: p('b1', '1B', 'Singles allowed'),
  p_b2: p('b2', '2B', 'Doubles allowed'),
  p_b3: p('b3', '3B', 'Triples allowed'),
  p_hr: p('hr', 'HR', 'Home runs allowed'),
  p_sp: p('sp', 'SP', 'Star pitches thrown'),
  p_su: p('su', 'SU', 'Stars used on the mound'),
  p_pk: p('pk', 'PK', 'Pickoffs'),
  p_pka: p('pka', 'PKA', 'Pickoff attempts'),
  p_era7: rate('pit', 'p_era7', 'ERA7', 'Earned run average per 7 innings', RATES.era7, { fmt: fmt2, asc: true }),
  p_era9: rate('pit', 'p_era9', 'ERA9', 'Earned run average per 9 innings', RATES.era9, { fmt: fmt2, asc: true }),
  p_whip: rate('pit', 'p_whip', 'WHIP', 'Walks plus hits per inning pitched', RATES.whip, { fmt: fmt2, asc: true }),
  p_baa: rate('pit', 'p_baa', 'BAA', 'Batting average against', RATES.baa, { asc: true }),
  p_obpa: rate('pit', 'p_obpa', 'OBPA', 'On-base percentage against', RATES.obpa, { asc: true }),
  p_slga: rate('pit', 'p_slga', 'SLGA', 'Slugging percentage against', RATES.slga, { asc: true }),
  p_opsa: rate('pit', 'p_opsa', 'OPSA', 'On-base plus slugging against', RATES.opsa, { asc: true }),
};

const pick = (ids) => ids.split(' ').map((id) => C[id]);

// "core" is the stat a season must have kept for the view to be worth showing.
export const COLSETS = {
  batting: {
    label: 'Batting',
    sort: 'h',
    core: ['bat', 'ab'],
    cols: pick('g pa ab r h b1 b2 b3 hr rbi bb so hbp sf tb sb cs sba avg obp slg ops'),
  },
  sluggers: {
    label: 'Star & Power',
    sort: 'hr',
    core: ['bat', 'ssw'],
    cols: pick('g hr hr1 hr2 hr3 gs itphr tb ssw sh su sbh starSlg gidp gitp bjhi'),
  },
  fielding: {
    label: 'Fielding',
    sort: 'po',
    core: ['bat', 'po'],
    cols: pick('g po a dp tp bjpo bja bob'),
  },
  pitching: {
    label: 'Pitching',
    sort: 'p_ip',
    core: ['pit', null],
    cols: pick(
      'gp p_ip p_bf p_np p_str p_ball p_k p_bb p_hb p_h p_r p_er p_ir p_b1 p_b2 p_b3 p_hr p_sp p_su p_pk p_pka p_era7 p_era9 p_whip p_baa p_obpa p_slga p_opsa',
    ),
  },
};

// The views a season can fill. tracked is null for seasons with full game files.
export function viewsFor(tracked) {
  return Object.keys(COLSETS).filter((view) => {
    if (!tracked) return true;
    const [src, key] = COLSETS[view].core;
    const list = tracked[src] || [];
    return key ? list.includes(key) : list.length > 0;
  });
}

// The columns of a view that the season actually kept. Pass tracked = null to keep them all.
export function colsFor(view, tracked, hideGames = false) {
  return COLSETS[view].cols.filter((c) => {
    if (c.id === 'g' || c.id === 'gp') return !hideGames;
    return !tracked || c.needs.every((k) => (tracked[c.src] || []).includes(k));
  });
}

// Categories offered on the home page leader board.
export function leaderCats(league) {
  const era = league?.eraInnings === 7 ? C.p_era7 : C.p_era9;
  return [
    { id: 'avg', name: 'Batting Average', col: C.avg },
    { id: 'hr', name: 'Home Runs', col: C.hr },
    { id: 'rbi', name: 'Runs Batted In', col: C.rbi },
    { id: 'h', name: 'Hits', col: C.h },
    { id: 'r', name: 'Runs', col: C.r },
    { id: 'ops', name: 'OPS', col: C.ops },
    { id: 'sb', name: 'Stolen Bases', col: C.sb },
    { id: 'era', name: 'Earned Run Average', col: { ...era, label: 'ERA' } },
    { id: 'k', name: 'Strikeouts', col: C.p_k },
    { id: 'whip', name: 'WHIP', col: C.p_whip },
  ];
}
