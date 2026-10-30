// The Dugout: the league's back office. Sign in, then upload game files,
// write articles, and edit teams, players, league settings and logins.
// Every save is a commit to the repository, so nothing here needs a server.

import { html, slug } from '../lib/html.js';
import { readXlsx, readCsv } from '../lib/xlsx-lite.js';
import { parseGame } from '../lib/parse-game.js';
import { markdown } from '../lib/markdown.js';
import { fmtIP } from '../lib/statdefs.js';
import { loadLeague } from '../lib/load.js';
import { GAME_TYPES, matchTeam, makeTeam, learnAliases, nextGameId, toStoredGame, serializeSeason, pretty, todayISO, isMii, STADIUMS, TIME_ICON, stadiumLabel, gmsOf, gmLabel } from '../lib/league-ops.js';
import { GitHubRepo, LocalRepo, updateJson } from './github.js';
import { seal, unseal } from './vault.js';

const app = document.getElementById('dugout');
const status = document.getElementById('say');
const S = { repo: null, who: '', tab: 'upload', league: null, teams: [] };
const $ = (sel, root = app) => root.querySelector(sel);
const fields = (form) => Object.fromEntries(new FormData(form));
const readJson = async (path, fallback) => {
  const file = await S.repo.read(path);
  return file ? JSON.parse(file.text) : fallback;
};

function say(text, kind = 'ok') {
  status.textContent = text;
  status.className = `say say--${kind}`;
  status.hidden = !text;
}

// Runs a task with its button disabled; errors are shown instead of thrown.
async function work(btn, task) {
  if (btn) btn.disabled = true;
  say('Working...', 'busy');
  try {
    say((await task()) ?? 'Saved.');
  } catch (err) {
    console.error(err);
    say(err.message, 'bad');
  } finally {
    if (btn) btn.disabled = false;
  }
}

const whenLive = () => (S.repo.live ? ' The public site updates in about a minute.' : ' Commit and push to publish it.');
const options = (pairs, chosen) => pairs.map(([value, label]) => html`<option value="${value}" ${value === chosen ? 'selected' : ''}>${label}</option>`);
const seasonOptions = (chosen) => options([...S.league.seasons].reverse().map((s) => [s.id, s.name]), chosen);

// ---- Signing in ------------------------------------------------------------

async function guessRepo() {
  const league = await fetch('data/league.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => null);
  if (league?.repo?.owner && league.repo.name) return { branch: 'main', ...league.repo };
  const host = /^([^.]+)\.github\.io$/.exec(location.hostname);
  if (host) {
    const first = location.pathname.split('/').filter(Boolean)[0] || '';
    return { owner: host[1], name: first && !first.includes('.') ? first : `${host[1]}.github.io`, branch: 'main' };
  }
  return JSON.parse(localStorage.getItem('sl.repo') || 'null') || { owner: '', name: '', branch: 'main' };
}

async function signInView() {
  const [local, guess] = await Promise.all([LocalRepo.available(), guessRepo()]);
  app.innerHTML = html`
    <form class="card signin" data-signin>
      <h1>The Dugout</h1>
      <p class="hint">League staff only. Sign in to upload games and edit the site.</p>
      <label>Username<input name="user" autocomplete="username"></label>
      <label>Password<input name="pass" type="password" autocomplete="current-password"></label>
      <button class="btn" name="how" value="login">Sign in</button>
      <details ${guess.owner ? '' : 'open'}>
        <summary>First time here, or no login yet?</summary>
        <p class="hint">Paste a GitHub key (a fine-grained personal access token with "Contents: Read and write" on this repository). Once inside, the Logins tab turns it into a username and password.</p>
        <label>GitHub key<input name="token" type="password" autocomplete="off"></label>
        <div class="grid">
          <label>Repository<input name="repo" value="${guess.owner ? `${guess.owner}/${guess.name}` : ''}" placeholder="owner/repository"></label>
          <label>Branch<input name="branch" value="${guess.branch || 'main'}"></label>
        </div>
        <button class="btn btn--plain" name="how" value="token">Sign in with the key</button>
      </details>
      ${local
        ? html`<div class="localbox"><b>Running on this computer.</b> Local mode saves straight into the project's data folder, with no GitHub key needed. Push the changes afterwards to publish them.
            <button type="button" class="btn btn--plain" data-local>Use local mode</button></div>`
        : ''}
    </form>`;

  $('[data-local]')?.addEventListener('click', () => work(null, () => enter(new LocalRepo(), 'Local mode', null)));
  $('[data-signin]').onsubmit = (e) => {
    e.preventDefault();
    const f = fields(e.target);
    work(e.submitter, async () => {
      const [owner, name] = f.repo.trim().replace(/^https:\/\/github\.com\//, '').split('/');
      if (!owner || !name) throw new Error('Fill in the repository as owner/name (under "First time here").');
      const where = { owner, name, branch: f.branch.trim() || 'main' };
      let token = f.token.trim();
      let who = 'Key holder';
      if (e.submitter.value === 'login') {
        const id = slug(f.user);
        if (!id || !f.pass) throw new Error('Enter your username and password.');
        const res = await fetch(`data/access/${id}.json`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`There is no login named "${f.user}".`);
        token = await unseal(await res.json(), f.pass);
        who = f.user.trim();
      } else if (!token) {
        throw new Error('Paste the GitHub key first.');
      }
      const repo = new GitHubRepo({ ...where, token });
      await repo.check();
      localStorage.setItem('sl.repo', JSON.stringify(where));
      await enter(repo, who, { ...where, token, who });
    });
  };
}

async function enter(repo, who, session) {
  S.repo = repo;
  S.who = who;
  S.league = await readJson('data/league.json');
  if (!S.league) throw new Error('data/league.json is missing from the repository.');
  S.teams = await readJson('data/teams.json', []);
  // Kept for this browser tab only, so a refresh does not sign you out.
  if (session) sessionStorage.setItem('sl.dugout', JSON.stringify(session));
  shell();
  return '';
}

function signOut() {
  sessionStorage.removeItem('sl.dugout');
  S.repo = null;
  say('');
  signInView();
}

// ---- Frame -----------------------------------------------------------------

const TABS = {
  upload: ['Upload game', tabUpload],
  games: ['Games', tabGames],
  articles: ['Articles', tabArticles],
  posts: ['Social posts', tabPosts],
  teams: ['Teams', tabTeams],
  lineups: ['Lineups', tabLineups],
  stadiums: ['Stadiums', tabStadiums],
  players: ['Players', tabPlayers],
  league: ['League', tabLeague],
  logins: ['Logins', tabLogins],
};

// Admins (league.json "admins", by login name, plus anyone signed in with the key
// itself or in local mode) see every tab. Other staff see only the everyday ones.
// This hides tabs; it is not a lock, since every login can reach the key.
const STAFF_TABS = ['upload', 'games', 'articles', 'posts', 'lineups', 'stadiums', 'players'];
const isAdmin = () => S.who === 'Key holder' || S.who === 'Local mode' || (S.league.admins || []).some((name) => slug(name) === slug(S.who));
const tabsFor = () => Object.entries(TABS).filter(([id]) => isAdmin() || STAFF_TABS.includes(id));

function shell() {
  app.innerHTML = html`
    <header class="dbar">
      <b>The Dugout</b>
      <span>${S.who} / saving to ${S.repo.label}</span>
      <a href="./">View the site</a>
      <button type="button" data-out>Sign out</button>
    </header>
    <nav class="dtabs">${tabsFor().map(([id, [label]]) => html`<button type="button" data-tab="${id}">${label}</button>`)}</nav>
    <div data-host></div>`;
  $('[data-out]').onclick = signOut;
  $('.dtabs').onclick = (e) => {
    const btn = e.target.closest('[data-tab]');
    if (btn) openTab(btn.dataset.tab);
  };
  openTab(S.tab);
}

function openTab(id) {
  if (!tabsFor().some(([tab]) => tab === id)) id = 'upload';
  S.tab = id;
  for (const btn of app.querySelectorAll('[data-tab]')) btn.classList.toggle('is-on', btn.dataset.tab === id);
  const el = document.createElement('section');
  el.className = 'dpage';
  $('[data-host]').replaceChildren(el);
  work(null, async () => {
    await TABS[id][1](el);
    return '';
  });
}

// ---- Upload a game ---------------------------------------------------------

async function readGameFiles(files) {
  const sheets = [];
  for (const file of files) {
    if (/\.xlsx$/i.test(file.name)) sheets.push(...(await readXlsx(await file.arrayBuffer())));
    else if (/\.csv$/i.test(file.name)) sheets.push({ name: file.name, rows: readCsv(await file.text()) });
    else throw new Error(`${file.name} is not an .xlsx or .csv file. Older .xls files need to be saved as .xlsx first.`);
  }
  return parseGame(sheets);
}

async function tabUpload(el) {
  // Everyone the league already knows, to point out names appearing for the first time.
  const known = await loadLeague().then((m) => ({ slugs: new Set(m.players.keys()), canon: m.canon }), () => null);
  el.innerHTML = html`
    <h2>Upload a game</h2>
    <label class="drop" data-drop>
      <input type="file" accept=".xlsx,.csv" multiple>
      <b>Drop the game file here, or click to choose it</b>
      <span>One .xlsx workbook, or the .csv files that make up one game.</span>
    </label>
    <div data-preview></div>`;
  const drop = $('[data-drop]', el);
  const input = $('input', drop);
  const take = (fileList) => {
    const files = [...fileList]; // copied, because clearing the input empties its list
    if (!files.length) return;
    work(null, async () => {
      showPreview($('[data-preview]', el), await readGameFiles(files), known);
      input.value = '';
      return `Read ${files.map((f) => f.name).join(', ')}. Check it over, then save it.`;
    });
  };
  input.onchange = () => take(input.files);
  drop.ondragover = (e) => {
    e.preventDefault();
    drop.classList.add('is-over');
  };
  drop.ondragleave = () => drop.classList.remove('is-over');
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    take(e.dataTransfer.files);
  };
}

function showPreview(el, { game, warnings }, known) {
  const names = [...new Set([...game.batting, ...game.pitching].map((r) => r.p))];
  const fresh = known?.slugs.size ? names.filter((name) => !known.slugs.has(slug(known.canon(name)))) : [];
  const teamPick = (key, label) => {
    const side = game[key];
    const hit = matchTeam(S.teams, side.name, side.label);
    return html`<label>${label} <small>file says "${side.name}"</small>
      <select name="${key}">
        ${options(S.teams.map((t) => [t.id, t.name]), hit?.id)}
        <option value="+new" ${hit ? '' : 'selected'}>New team: ${side.name}</option>
      </select></label>`;
  };
  const n = (v) => v || 0;
  const box = (t, side) => html`<table class="mini">
    <caption>${side.name}</caption>
    <thead><tr><th>Batter</th><th>Pos</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>BB</th><th>SO</th><th>HR</th></tr></thead>
    <tbody>${game.batting.filter((r) => r.t === t).map((r) => html`<tr><td>${r.p}</td><td>${r.pos}</td><td>${n(r.ab)}</td><td>${n(r.r)}</td><td>${n(r.h)}</td><td>${n(r.rbi)}</td><td>${n(r.bb)}</td><td>${n(r.so)}</td><td>${n(r.hr)}</td></tr>`)}</tbody>
  </table>`;
  const sideName = { a: game.away.name, h: game.home.name };

  el.innerHTML = html`
    <form class="card" data-game>
      <h3>${game.away.name} ${game.away.score}, ${game.home.name} ${game.home.score}</h3>
      <p class="hint">${[game.stadium, ...Object.entries(game.settings).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join(' / ')}</p>
      <div class="grid">
        ${teamPick('away', 'Away team')}
        ${teamPick('home', 'Home team')}
        <label>Season<select name="season">${seasonOptions(S.league.currentSeason)}</select></label>
        <label>Date played<input type="date" name="date" value="${todayISO()}" required></label>
        <label>Week <small>optional</small><input type="number" name="week" min="1" max="99" placeholder="for example 1"></label>
        <label>Game type<select name="type">${options(Object.entries(GAME_TYPES), 'regular')}</select></label>
      </div>
      ${warnings.length
        ? html`<div class="warn"><b>Worth a look before saving:</b><ul>${warnings.map((w) => html`<li>${w}</li>`)}</ul></div>`
        : html`<p class="good">The file adds up: hits, runs and the score all agree.</p>`}
      ${fresh.length
        ? html`<div class="warn"><b>New to the league (${fresh.length}):</b> ${fresh.join(', ')}.
            <br>If one of these is a returning player spelled differently, add the spelling under League, "Player names", before saving. Otherwise they start a fresh page.</div>`
        : ''}
      <div class="cols">${box('a', game.away)}${box('h', game.home)}</div>
      ${game.pitching.length
        ? html`<table class="mini">
            <caption>Pitching</caption>
            <thead><tr><th>Pitcher</th><th>Team</th><th>IP</th><th>H</th><th>R</th><th>ER</th><th>BB</th><th>K</th><th>Pitches</th></tr></thead>
            <tbody>${game.pitching.map((r) => html`<tr><td>${r.p}</td><td>${sideName[r.t]}</td><td>${fmtIP(r.outs)}</td><td>${n(r.h)}</td><td>${n(r.r)}</td><td>${n(r.er)}</td><td>${n(r.bb)}</td><td>${n(r.k)}</td><td>${n(r.np)}</td></tr>`)}</tbody>
          </table>`
        : ''}
      <p class="hint">Only the main columns are shown here. Every stat in the file is saved.</p>
      <div class="row">
        <button class="btn">Save this game</button>
        <button type="button" class="btn btn--plain" data-discard>Discard</button>
      </div>
    </form>`;
  $('[data-discard]', el).onclick = () => {
    el.innerHTML = '';
    say('');
  };
  $('form', el).onsubmit = (e) => {
    e.preventDefault();
    const f = fields(e.target);
    work(e.submitter, async () => {
      const message = await saveGame(game, f);
      el.innerHTML = '';
      return message;
    });
  };
}

async function saveGame(parsed, f) {
  if (f.away !== '+new' && f.away === f.home) throw new Error('Away and home are set to the same team.');
  const meta = S.league.seasons.find((s) => s.id === f.season);
  const path = `data/seasons/${f.season}.json`;
  const twin = (await readJson(path, { games: [] })).games?.find((g) => g.fp === parsed.fp);
  if (twin && !confirm(`This looks the same as game ${twin.id} (${twin.date}), which is already saved. Save it again anyway?`)) {
    throw new Error('Not saved: this game is already in the season.');
  }

  const ids = {};
  S.teams = await updateJson(S.repo, 'data/teams.json', [], (teams) => {
    for (const key of ['away', 'home']) {
      const side = parsed[key];
      let team = f[key] === '+new' ? matchTeam(teams, side.name) : teams.find((t) => t.id === f[key]);
      if (!team) teams.push((team = makeTeam(teams, side.name, side.label)));
      learnAliases(team, side.name, side.label);
      ids[key] = team.id;
    }
  }, `Teams for ${parsed.away.name} at ${parsed.home.name}`);

  let saved;
  await updateJson(S.repo, path, { id: f.season, name: meta.name, games: [] }, (season) => {
    season.id ||= f.season;
    season.games ||= [];
    saved = toStoredGame(parsed, { id: nextGameId(season), date: f.date, week: f.week, type: f.type, awayTeam: ids.away, homeTeam: ids.home });
    season.games.push(saved);
  }, `Add game: ${parsed.away.name} ${parsed.away.score}, ${parsed.home.name} ${parsed.home.score}`, serializeSeason);
  return `Saved as game ${saved.id}.${whenLive()}`;
}

// ---- Games already saved ---------------------------------------------------

async function tabGames(el) {
  let seasonId = S.league.currentSeason;
  const path = () => `data/seasons/${seasonId}.json`;
  const teamName = (id) => S.teams.find((t) => t.id === id)?.name || id;

  const draw = async () => {
    const games = (await readJson(path(), { games: [] })).games || [];
    el.innerHTML = html`
      <h2>Games</h2>
      <label class="inline">Season <select data-season>${seasonOptions(seasonId)}</select></label>
      ${games.length
        ? html`<table class="mini mini--wide">
            <thead><tr><th>Game</th><th>Date</th><th>Week</th><th>Type</th><th>Result</th><th></th></tr></thead>
            <tbody>${[...games].reverse().map((g) => html`<tr data-id="${g.id}">
              <td>${g.id}</td>
              <td><input type="date" value="${g.date}" data-date></td>
              <td><input type="number" min="1" max="99" value="${g.week || ''}" data-week></td>
              <td><select data-type>${options(Object.entries(GAME_TYPES), g.type || 'regular')}</select></td>
              <td>${g.notPlayed ? `${teamName(g.away.team)} at ${teamName(g.home.team)}, not played` : `${teamName(g.away.team)} ${g.away.score}, ${teamName(g.home.team)} ${g.home.score}`}</td>
              <td><button type="button" data-save>Save changes</button> <button type="button" class="danger" data-del>Delete</button></td>
            </tr>`)}</tbody>
          </table>`
        : html`<p class="hint">No games in this season yet.</p>`}`;
  };

  el.onchange = (e) => {
    if (!e.target.matches('[data-season]')) return;
    seasonId = e.target.value;
    work(null, async () => {
      await draw();
      return '';
    });
  };
  el.onclick = (e) => {
    const row = e.target.closest('tr[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.matches('[data-del]')) {
      if (!confirm(`Delete game ${id}? Its stats come off every page. This cannot be undone here.`)) return;
      work(e.target, async () => {
        await updateJson(S.repo, path(), null, (s) => { s.games = s.games.filter((g) => g.id !== id); }, `Remove game ${id}`, serializeSeason);
        await draw();
        return `Game ${id} deleted.${whenLive()}`;
      });
    } else if (e.target.matches('[data-save]')) {
      const date = $('[data-date]', row).value;
      const type = $('[data-type]', row).value;
      const week = Number($('[data-week]', row).value);
      work(e.target, async () => {
        await updateJson(S.repo, path(), null, (s) => {
          const game = s.games.find((g) => g.id === id);
          Object.assign(game, { date, type });
          if (week > 0) game.week = week;
          else delete game.week;
        }, `Update game ${id}`, serializeSeason);
        return `Game ${id} updated.${whenLive()}`;
      });
    }
  };
  await draw();
}

// ---- Articles --------------------------------------------------------------

// Pictures are shrunk in the browser before saving, so the repository stays
// small. A square picture (a writer's) is cropped from the middle.
async function shrinkPicture(file, { max, square = false }) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Pick a PNG, JPG, WebP or GIF picture.');
  const img = await createImageBitmap(file);
  let [sx, sy, sw, sh] = [0, 0, img.width, img.height];
  if (square) {
    const side = Math.min(sw, sh);
    [sx, sy, sw, sh] = [(sw - side) / 2, (sh - side) / 2, side, side];
  }
  const scale = Math.min(1, max / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const paint = (type) => {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (type === 'image/jpeg') {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, canvas.width, canvas.height);
    }
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(type, 0.86);
  };
  // PNGs keep their see-through parts, unless that makes a photo very large.
  let type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  let dataUrl = paint(type);
  if (type === 'image/png' && dataUrl.length > 1_400_000) dataUrl = paint((type = 'image/jpeg'));
  return { dataUrl, base64: dataUrl.split(',')[1], ext: type === 'image/png' ? 'png' : 'jpg', width: canvas.width, height: canvas.height };
}

async function tabArticles(el) {
  let [list, writers] = await Promise.all([readJson('data/articles.json', []), readJson('data/authors.json', [])]);
  let cur = null;
  // Pictures picked but not saved yet.
  let picked = { story: null, writer: null, dropStory: false };
  const writerPic = (name) => writers.find((w) => slug(w.name) === slug(name || ''))?.picture || '';
  const picAttrs = (src) => (src ? html`src="${src}"` : 'hidden');

  const draw = () => {
    picked = { story: null, writer: null, dropStory: false };
    const sorted = [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    el.innerHTML = html`
      <h2>Articles</h2>
      <div class="two">
        <div>
          <button type="button" class="btn btn--plain" data-new>Write a new story</button>
          <ul class="list">${sorted.map((a) => html`<li><button type="button" data-edit="${a.id}" class="${cur?.id === a.id ? 'is-on' : ''}"><b>${a.title}</b><span>${a.date}${a.author ? ` / ${a.author}` : ''}</span></button></li>`)}</ul>
        </div>
        ${cur
          ? html`<form class="card" data-article>
              <label>Headline<input name="title" value="${cur.title}" required></label>
              <div class="grid">
                <label>Date<input type="date" name="date" value="${cur.date}" required></label>
                <label>Writer <small>pick one or type a new name</small><input name="author" value="${cur.author || ''}" list="writers" autocomplete="off"></label>
              </div>
              <datalist id="writers">${writers.map((w) => html`<option value="${w.name}"></option>`)}</datalist>
              <div class="picrow">
                <div class="picbox picbox--writer"><img data-writer-pic alt="" ${picAttrs(writerPic(cur.author))}></div>
                <label>Writer's picture <small>square works best. It shows on all of this writer's stories.</small><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-writer-file></label>
              </div>
              <label>Summary <small>a sentence or two for the home page</small><input name="summary" value="${cur.summary || ''}"></label>
              <div class="picrow">
                <div class="picbox picbox--story"><img data-story-pic alt="" ${picAttrs(cur.image)}></div>
                <div class="stack">
                  <label>Story picture <small>shown above the story and on its clipping</small><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-story-file></label>
                  <label>Caption <small>optional</small><input name="caption" value="${cur.caption || ''}"></label>
                  <button type="button" class="btn btn--plain" data-drop-pic ${cur.image ? '' : 'hidden'}>Remove picture</button>
                </div>
              </div>
              <label>Story<textarea name="body" rows="14" required>${cur.body || ''}</textarea></label>
              <p class="hint">Formatting: # Heading, **bold**, *italic*, [link text](https://...), ![picture](https://...). Start lines with - for a list. Leave a blank line between paragraphs.</p>
              <div class="story__body preview" data-preview></div>
              <button class="btn">Save story</button>
              ${cur.id ? html`<button type="button" class="danger" data-del>Delete story</button>` : ''}
            </form>`
          : html`<p class="hint">Pick a story to edit, or write a new one.</p>`}
      </div>`;
    const body = $('[name="body"]', el);
    if (!body) return;
    const show = () => { $('[data-preview]', el).innerHTML = markdown(body.value); };
    body.oninput = show;
    show();
    const setPic = (img, src) => {
      img.hidden = !src;
      if (src) img.src = src;
      else img.removeAttribute('src');
    };
    // Typing a known writer's name shows their picture, unless a new one was picked.
    $('[name="author"]', el).oninput = (e) => { if (!picked.writer) setPic($('[data-writer-pic]', el), writerPic(e.target.value)); };
    $('[data-writer-file]', el).onchange = (e) => e.target.files[0] && work(null, async () => {
      picked.writer = await shrinkPicture(e.target.files[0], { max: 256, square: true });
      setPic($('[data-writer-pic]', el), picked.writer.dataUrl);
      return 'Writer picture ready. It is saved with the story.';
    });
    $('[data-story-file]', el).onchange = (e) => e.target.files[0] && work(null, async () => {
      picked.story = await shrinkPicture(e.target.files[0], { max: 1400 });
      picked.dropStory = false;
      setPic($('[data-story-pic]', el), picked.story.dataUrl);
      $('[data-drop-pic]', el).hidden = false;
      return 'Story picture ready. It is saved with the story.';
    });
    $('[data-drop-pic]', el).onclick = (e) => {
      picked.story = null;
      picked.dropStory = true;
      $('[data-story-file]', el).value = '';
      setPic($('[data-story-pic]', el), '');
      e.target.hidden = true;
    };
  };

  el.onclick = (e) => {
    if (e.target.closest('[data-new]')) {
      cur = { id: '', title: '', date: todayISO(), author: S.who === 'Local mode' || S.who === 'Key holder' ? '' : S.who, summary: '', body: '' };
      draw();
    } else if (e.target.closest('[data-edit]')) {
      cur = list.find((a) => a.id === e.target.closest('[data-edit]').dataset.edit);
      draw();
    } else if (e.target.closest('[data-del]')) {
      if (!confirm(`Delete "${cur.title}"?`)) return;
      const { id, title, image } = cur;
      work(e.target, async () => {
        list = await updateJson(S.repo, 'data/articles.json', [], (all) => all.filter((a) => a.id !== id), `Remove article: ${title}`);
        if (image) await S.repo.remove(image, `Remove story picture: ${title}`).catch(() => {});
        cur = null;
        draw();
        return `Story deleted.${whenLive()}`;
      });
    }
  };
  el.onsubmit = (e) => {
    e.preventDefault();
    const f = fields(e.target);
    const title = f.title.trim();
    const author = f.author.trim();
    work(e.submitter, async () => {
      let id = cur.id;
      if (!id) {
        const taken = (await readJson('data/articles.json', [])).map((a) => a.id);
        const base = slug(title) || 'story';
        id = base;
        for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
      }
      // New pictures get a fresh name, so nobody's browser shows an old copy.
      const stamp = Date.now().toString(36);
      const oldImage = cur.image || '';
      let image = picked.dropStory ? '' : oldImage;
      if (picked.story) {
        image = `assets/news/${id}-${stamp}.${picked.story.ext}`;
        await S.repo.putFile(image, picked.story.base64, `Story picture: ${title}`);
      }
      let oldWriterPic = '';
      if (picked.writer && author) {
        const picture = `assets/authors/${slug(author)}-${stamp}.${picked.writer.ext}`;
        await S.repo.putFile(picture, picked.writer.base64, `Writer picture: ${author}`);
        writers = await updateJson(S.repo, 'data/authors.json', [], (all) => {
          const at = all.findIndex((w) => slug(w.name) === slug(author));
          if (at >= 0) {
            oldWriterPic = all[at].picture;
            all[at] = { ...all[at], name: author, picture };
          } else {
            all.push({ name: author, picture });
          }
        }, `Writer: ${author}`);
      }
      list = await updateJson(S.repo, 'data/articles.json', [], (all) => {
        const story = {
          id, title, date: f.date, author, summary: f.summary.trim(),
          ...(image ? { image } : {}),
          ...(image && f.caption.trim() ? { caption: f.caption.trim() } : {}),
          body: f.body.replace(/\r\n?/g, '\n').trim(),
        };
        const at = all.findIndex((a) => a.id === id);
        if (at >= 0) all[at] = story;
        else all.unshift(story);
      }, `Article: ${title}`);
      // Pictures nothing points to any more.
      if (oldImage && oldImage !== image) await S.repo.remove(oldImage, `Remove old story picture: ${title}`).catch(() => {});
      if (oldWriterPic) await S.repo.remove(oldWriterPic, `Remove old writer picture: ${author}`).catch(() => {});
      cur = list.find((a) => a.id === id);
      draw();
      return `Story saved.${whenLive()}`;
    });
  };
  draw();
}

// ---- Social posts ----------------------------------------------------------

// Made-up social media posts: a picture, who it is "by" (a player, a GM or
// anyone else) and the team it belongs to, so the site can filter them.
async function tabPosts(el) {
  const [list0, model] = await Promise.all([readJson('data/posts.json', []), loadLeague().catch(() => null)]);
  let list = list0;
  let cur = null;
  let picked = null; // the new picture, shrunk, until it is saved
  const players = model ? [...model.players.values()].map((p) => p.name).sort() : [];
  const teams = [...S.teams].sort((a, b) => a.name.localeCompare(b.name));
  const teamName = (id) => teams.find((t) => t.id === id)?.name || '';
  // A player's most recent team, to fill in the team for them.
  const teamOfPlayer = (name) => (model && name ? model.players.get(slug(model.canon(name)))?.last?.teamId || '' : '');
  const label = (p) => (p.by?.kind === 'gm' ? `${p.by.name} (GM, ${teamName(p.team)})` : p.by?.name || 'Someone');

  const draw = () => {
    picked = null;
    const sorted = [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const kind = cur?.by?.kind || 'player';
    el.innerHTML = html`
      <h2>Social posts</h2>
      <p class="hint">Made-up social media posts by players, GMs or anyone else. They show on the site under "${S.league.feedName || 'League Banter'}", newest first.</p>
      <div class="two">
        <div>
          <button type="button" class="btn btn--plain" data-new>New post</button>
          <ul class="list">${sorted.map((p) => html`<li><button type="button" data-edit="${p.id}" class="${cur?.id === p.id ? 'is-on' : ''}"><b>${label(p)}</b><span>${p.date}${p.spoiler ? ' / spoiler' : ''}</span></button></li>`)}</ul>
        </div>
        ${cur
          ? html`<form class="card" data-post>
              <div class="drop" data-drop tabindex="0">
                <img data-pic alt="" ${cur.image ? html`src="${cur.image}"` : 'hidden'}>
                <p class="hint" data-drop-hint ${cur.image ? 'hidden' : ''}><b>Paste the picture here</b> (Ctrl+V), drag it in, or choose a file.</p>
              </div>
              <label>Picture<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-file></label>
              <fieldset class="kinds">
                <legend>Posted by</legend>
                ${[['player', 'A player'], ['gm', 'A GM'], ['other', 'Someone else']].map(([v, t]) => html`<label class="tick"><input type="radio" name="kind" value="${v}" ${kind === v ? 'checked' : ''}> ${t}</label>`)}
              </fieldset>
              <label data-for="player">Player <small>start typing a name</small><input name="player" list="post-players" value="${kind === 'player' ? cur.by?.name || '' : ''}" autocomplete="off"></label>
              <datalist id="post-players">${players.map((n) => html`<option value="${n}"></option>`)}</datalist>
              <label data-for="gm">GM<select name="gm">${teams.flatMap((t) => (gmsOf(t).length ? gmsOf(t) : ['']).map((g) => html`<option value="${t.id}|${g}" ${kind === 'gm' && cur.team === t.id && (!g || slug(g) === slug(cur.by?.name || '') || gmsOf(t).length === 1) ? 'selected' : ''}>${g || 'No GM'} (${t.name})</option>`))}</select></label>
              <label data-for="other">Name <small>a reporter, a fan, a sponsor...</small><input name="other" value="${kind === 'other' ? cur.by?.name || '' : ''}"></label>
              <div class="grid">
                <label>Team <small>used by the team filter</small><select name="team"><option value="">No team</option>${teams.map((t) => html`<option value="${t.id}" ${cur.team === t.id ? 'selected' : ''}>${t.name}</option>`)}</select></label>
                <label>Date<input type="date" name="date" value="${cur.date}" required></label>
              </div>
              <label>Words in the post <small>optional. Helps screen readers.</small><textarea name="text" rows="3">${cur.text || ''}</textarea></label>
              <label class="tick"><input type="checkbox" name="spoiler" ${cur.spoiler ? 'checked' : ''}> Spoiler: hide it until it is clicked (it gives away a result)</label>
              <button class="btn">Save post</button>
              ${cur.id ? html`<button type="button" class="danger" data-del>Delete post</button>` : ''}
            </form>`
          : html`<p class="hint">Pick a post to edit, or make a new one.</p>`}
      </div>`;
    const form = $('[data-post]', el);
    if (!form) return;

    // Show only the "posted by" field that fits, and keep the team in step.
    const sync = (fillTeam) => {
      const k = form.kind.value;
      for (const box of form.querySelectorAll('[data-for]')) box.hidden = box.dataset.for !== k;
      if (!fillTeam) return;
      if (k === 'gm') form.team.value = form.gm.value.split('|')[0];
      if (k === 'player' && teamOfPlayer(form.player.value)) form.team.value = teamOfPlayer(form.player.value);
    };
    sync(false);
    form.querySelector('.kinds').onchange = () => sync(true);
    form.gm.onchange = () => sync(true);
    form.player.onchange = () => sync(true);

    const take = (file) => file && work(null, async () => {
      picked = await shrinkPicture(file, { max: 1200 });
      const img = $('[data-pic]', el);
      img.src = picked.dataUrl;
      img.hidden = false;
      $('[data-drop-hint]', el).hidden = true;
      return 'Picture ready. It is saved with the post.';
    });
    $('[data-file]', el).onchange = (e) => take(e.target.files[0]);
    const drop = $('[data-drop]', el);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('is-over'); };
    drop.ondragleave = () => drop.classList.remove('is-over');
    drop.ondrop = (e) => {
      e.preventDefault();
      drop.classList.remove('is-over');
      take([...e.dataTransfer.files].find((f) => f.type.startsWith('image/')));
    };
    // Pasting works anywhere on the page while a post is open.
    document.onpaste = (e) => {
      if (!form.isConnected) return (document.onpaste = null);
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (!item) return;
      e.preventDefault();
      take(item.getAsFile());
    };
  };

  el.onclick = (e) => {
    if (e.target.closest('[data-new]')) {
      cur = { id: '', date: todayISO(), by: { kind: 'player', name: '' }, team: '', text: '', spoiler: false };
      draw();
    } else if (e.target.closest('[data-edit]')) {
      cur = list.find((p) => p.id === e.target.closest('[data-edit]').dataset.edit);
      draw();
    } else if (e.target.closest('[data-del]')) {
      if (!confirm(`Delete this post by ${label(cur)}?`)) return;
      const { id, image } = cur;
      work(e.target, async () => {
        list = await updateJson(S.repo, 'data/posts.json', [], (all) => all.filter((p) => p.id !== id), `Remove post: ${label(cur)}`);
        if (image) await S.repo.remove(image, 'Remove post picture').catch(() => {});
        cur = null;
        draw();
        return `Post deleted.${whenLive()}`;
      });
    }
  };
  el.onsubmit = (e) => {
    e.preventDefault();
    const f = fields(e.target);
    const kind = f.kind;
    // A GM option is "team id|GM name": co-managed teams list each GM.
    const [gmTeam, gmName] = f.gm.split('|');
    const name = kind === 'player' ? (model ? model.canon(f.player.trim()) : f.player.trim()) : kind === 'gm' ? gmName || '' : f.other.trim();
    work(e.submitter, async () => {
      if (!name) throw new Error(kind === 'player' ? 'Type the player who is posting.' : kind === 'gm' ? 'That team has no GM yet.' : 'Type who is posting.');
      if (!picked && !cur.image) throw new Error('Add the picture first: paste it, drag it in, or choose a file.');
      let id = cur.id;
      if (!id) {
        const taken = (await readJson('data/posts.json', [])).map((p) => p.id);
        const base = `${f.date}-${slug(name) || 'post'}`;
        id = base;
        for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
      }
      const oldImage = cur.image || '';
      let image = oldImage;
      let size = { width: cur.width, height: cur.height };
      if (picked) {
        image = `assets/posts/${id}-${Date.now().toString(36)}.${picked.ext}`;
        await S.repo.putFile(image, picked.base64, `Post picture: ${name}`);
        size = { width: picked.width, height: picked.height };
      }
      list = await updateJson(S.repo, 'data/posts.json', [], (all) => {
        const post = {
          id, date: f.date, by: { kind, name }, team: kind === 'gm' ? gmTeam : f.team, image, ...size,
          ...(f.text.trim() ? { text: f.text.trim() } : {}),
          ...(f.spoiler ? { spoiler: true } : {}),
        };
        const at = all.findIndex((p) => p.id === id);
        if (at >= 0) all[at] = post;
        else all.unshift(post);
      }, `Post: ${name}`);
      if (oldImage && oldImage !== image) await S.repo.remove(oldImage, 'Remove old post picture').catch(() => {});
      cur = list.find((p) => p.id === id);
      draw();
      return `Post saved.${whenLive()}`;
    });
  };
  draw();
}

// ---- Teams -----------------------------------------------------------------

function tabTeams(el) {
  let drafts = 0;
  const card = (t) => html`<fieldset class="card team" data-id="${t.id}">
    <legend>${t.name || 'New team'}</legend>
    <div class="grid">
      <label>Team name<input name="name" value="${t.name}" required></label>
      <label>Short name <small>up to 5 letters</small><input name="abbr" value="${t.abbr || ''}" maxlength="5"></label>
      <label>General manager <small>co-GMs: put a comma between names</small><input name="gm" value="${gmLabel(t)}"></label>
      ${(S.league.conferences || []).length
        ? html`<label>Conference<select name="conference">${options([['', 'None'], ...S.league.conferences.map((c) => [c.id, c.name])], t.conference || '')}</select></label>`
        : ''}
      <label>Main color<input type="color" name="c1" value="${t.colors?.[0] || '#d63a2f'}"></label>
      <label>Trim color<input type="color" name="c2" value="${t.colors?.[1] || '#fffcf1'}"></label>
      <label class="tick"><input type="checkbox" name="active" ${t.active === false ? '' : 'checked'}> Active this season</label>
    </div>
    <label>Names used in game files <small>comma separated; a file with one of these names is matched to this team</small><input name="aliases" value="${(t.aliases || []).join(', ')}"></label>
    <label>Logo <small>a picture already in the repository, for example assets/teams/my-team.png</small><input name="logo" value="${t.logo || ''}"></label>
    <label>About the team <small>optional, shown on the team page</small><input name="blurb" value="${t.blurb || ''}"></label>
  </fieldset>`;

  const draw = () => {
    el.innerHTML = html`
      <h2>Teams</h2>
      <p class="hint">Teams are created automatically the first time they appear in an uploaded game. Set each one's general manager and colors here.</p>
      <form data-teams>
        ${S.teams.map(card)}
        <button class="btn">Save teams</button>
        <button type="button" class="btn btn--plain" data-add>Add a team</button>
      </form>`;
  };

  el.onclick = (e) => {
    if (!e.target.closest('[data-add]')) return;
    const holder = document.createElement('div');
    holder.innerHTML = card({ id: `+draft${++drafts}`, name: '', colors: null });
    $('form .btn', el).before(holder.firstElementChild);
  };
  el.onsubmit = (e) => {
    e.preventDefault();
    const edits = [...el.querySelectorAll('fieldset.team')].map((fs) => {
      const v = (name) => $(`[name="${name}"]`, fs)?.value.trim() ?? '';
      const gms = v('gm').split(',').map((s) => s.trim()).filter(Boolean);
      return {
        id: fs.dataset.id,
        optional: { conference: v('conference'), logo: v('logo'), blurb: v('blurb') },
        name: v('name'),
        abbr: v('abbr').toUpperCase(),
        gm: gms.length > 1 ? gms : gms[0] || '',
        colors: [v('c1'), v('c2')],
        aliases: v('aliases').split(',').map((s) => s.trim()).filter(Boolean),
        active: $('[name="active"]', fs).checked,
      };
    });
    work(e.submitter, async () => {
      S.teams = await updateJson(S.repo, 'data/teams.json', [], (teams) => {
        for (const { id, optional, active, ...edit } of edits) {
          let team = teams.find((t) => t.id === id);
          if (!team) teams.push((team = makeTeam(teams, edit.name)));
          Object.assign(team, edit, { abbr: edit.abbr || team.abbr });
          // Optional fields are saved only when filled in.
          for (const [key, value] of Object.entries(optional)) {
            if (value) team[key] = value;
            else delete team[key];
          }
          if (active) delete team.active;
          else team.active = false;
        }
      }, 'Update teams');
      draw();
      return `Teams saved.${whenLive()}`;
    });
  };
  draw();
}

// ---- Lineups ---------------------------------------------------------------

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

// A team's players in a season: its draft picks, then its trades and signings in order.
function rosterOf(season, teamId) {
  const names = new Map();
  for (const d of season.draft || []) if (d.team === teamId) names.set(slug(d.p), d.p);
  for (const m of season.moves || []) {
    if (m.from === teamId) names.delete(slug(m.p));
    if (m.to === teamId) names.set(slug(m.p), m.p);
  }
  return [...names.values()];
}

// A team's batting order, positions, captain and star for the current season. A login
// named like a team's general manager sets only that team's; admins and shared
// logins (like "staff") can set any team's. The site shows it on the team page.
async function tabLineups(el) {
  const sid = S.league.currentSeason;
  const meta = S.league.seasons.find((s) => s.id === sid) || { id: sid, name: sid };
  const path = `data/seasons/${sid}.json`;
  let season = await readJson(path, { rosters: [] });
  const model = await loadLeague().catch(() => null);
  const everyone = model ? [...model.players.values()].map((p) => p.name).sort((a, b) => a.localeCompare(b)) : [];
  const players = await readJson('data/players.json', {});
  const inSeason = S.teams
    .filter((t) => (t.seasons ? t.seasons.includes(sid) : t.active !== false))
    .sort((a, b) => a.name.localeCompare(b.name));
  const own = inSeason.filter((t) => gmsOf(t).some((g) => slug(g) === slug(S.who)));
  const mine = isAdmin() || !own.length ? inSeason : own;
  let teamId = mine[0]?.id || '';
  // The draft names Miis by shirt ("Red Mii (F)"); show who wears it this season.
  // The shirt is what gets saved, so the site follows any later renaming.
  const miiName = (n) => season.miiNames?.[n] || n;

  const draw = () => {
    if (!mine.length) {
      el.innerHTML = html`<h2>Lineups</h2>
        <p class="hint">No teams in ${meta.name} yet.</p>`;
      return;
    }
    const team = mine.find((t) => t.id === teamId);
    const roster = rosterOf(season, teamId);
    const pool = roster.length ? roster : everyone;
    const saved = (season.rosters || []).find((r) => r.team === teamId);
    const lineup = saved?.lineup || roster.slice(0, 9).map((p) => ({ p, pos: '' }));
    const pick = (name, chosen, blank, from = pool) => html`<select name="${name}">${options([['', blank], ...from.map((n) => [n, miiName(n)])], chosen || '')}</select>`;
    el.innerHTML = html`
      <h2>Lineups</h2>
      <p class="hint">${meta.name}: the batting order top to bottom, each batter's position, the captain and the star (any player but a Mii).</p>
      <form class="card" data-lineup>
        ${mine.length > 1
          ? html`<label>Team<select name="team">${options(mine.map((t) => [t.id, t.name]), teamId)}</select></label>`
          : html`<p class="lineup-team">${team.name}</p>`}
        <ol class="order">${Array.from({ length: 9 }, (_, i) => html`<li>
          <b>${i + 1}</b>${pick(`p${i}`, lineup[i]?.p, 'Choose a player')}
          <select name="pos${i}">${options([['', 'Position'], ...POSITIONS.map((x) => [x, x])], lineup[i]?.pos || '')}</select>
        </li>`)}</ol>
        ${roster.length
          ? html`<p class="hint">Everyone else on the roster is a sub. Roster: ${roster.map(miiName).join(', ')}.</p>`
          : html`<p class="hint">The roster fills in from the draft once it's entered. Until then, choose from every player.</p>
            <div class="grid">${[0, 1].map((i) => html`<label>Sub ${i + 1}${pick(`b${i}`, saved?.bench[i], 'None')}</label>`)}</div>`}
        <label>Captain${pick('captain', saved?.captain, 'Choose the captain')}</label>
        <label>Star${pick('star', saved?.star, 'Choose the star', pool.filter((n) => !isMii(n, players)))}</label>
        <button class="btn">Save lineup</button>
      </form>`;
  };

  el.onchange = (e) => {
    if (!e.target.matches('[name="team"]')) return;
    teamId = e.target.value;
    draw();
  };
  el.onsubmit = (e) => {
    e.preventDefault();
    const f = fields(e.target);
    work(e.submitter, async () => {
      const team = mine.find((t) => t.id === teamId);
      const roster = rosterOf(season, teamId);
      const lineup = Array.from({ length: 9 }, (_, i) => ({ p: f[`p${i}`], pos: f[`pos${i}`] }));
      if (lineup.some((l) => !l.p || !l.pos)) throw new Error('Fill in all nine batters and their positions.');
      const twice = lineup.find((l, i) => lineup.findIndex((x) => slug(x.p) === slug(l.p)) !== i);
      if (twice) throw new Error(`${miiName(twice.p)} is in the lineup twice.`);
      const pos = POSITIONS.find((x) => lineup.filter((l) => l.pos === x).length !== 1);
      if (pos) throw new Error(`Every position needs exactly one player. Check ${pos}.`);
      const batting = new Set(lineup.map((l) => slug(l.p)));
      const bench = roster.length ? roster.filter((p) => !batting.has(slug(p))) : [f.b0, f.b1].filter(Boolean);
      if (bench.some((p) => batting.has(slug(p))) || new Set(bench.map(slug)).size !== bench.length) throw new Error('A sub is also batting, or picked twice.');
      if (!f.captain) throw new Error('Choose a captain.');
      if (![...lineup.map((l) => l.p), ...bench].some((p) => slug(p) === slug(f.captain))) throw new Error('The captain has to be in the lineup or a sub.');
      if (!f.star) throw new Error('Choose a star.');
      if (isMii(f.star, players)) throw new Error('A Mii can\'t be the star.');
      if (![...lineup.map((l) => l.p), ...bench].some((p) => slug(p) === slug(f.star))) throw new Error('The star has to be in the lineup or a sub.');
      season = await updateJson(S.repo, path, { id: sid, name: meta.name, games: [] }, (s) => {
        s.rosters ||= [];
        const entry = { team: teamId, captain: f.captain, star: f.star, lineup, bench };
        const at = s.rosters.findIndex((r) => r.team === teamId);
        if (at >= 0) s.rosters[at] = entry;
        else s.rosters.push(entry);
      }, `Lineup: ${team.name} (saved by ${S.who})`, serializeSeason);
      draw();
      return `${team.name} lineup saved.${whenLive()}`;
    });
  };
  draw();
}

// ---- Stadiums --------------------------------------------------------------

// Where each of a week's games is played. The home team picks the week of the
// game, and a stadium (day or night) can be used only once a week.
async function tabStadiums(el) {
  const sid = S.league.currentSeason;
  const meta = S.league.seasons.find((s) => s.id === sid) || { id: sid, name: sid };
  const path = `data/seasons/${sid}.json`;
  let season = await readJson(path, { schedule: [] });
  const name = (id) => S.teams.find((t) => t.id === id)?.name || id;
  // A team's GM sets their own home games; everyone else can set any game.
  const own = S.teams.filter((t) => gmsOf(t).some((g) => slug(g) === slug(S.who))).map((t) => t.id);
  const canSet = (s) => isAdmin() || !own.length || own.includes(s.home);
  const valueOf = (s) => (s.stadium ? `${s.stadium}|${s.time || ''}` : '');
  const choices = [['', 'Not chosen yet'], ...STADIUMS.flatMap(([n, times]) => times.map((t) => [`${n}|${t}`, `${n} ${TIME_ICON[t]}`]))];
  // Start on the first week with a game still missing its stadium.
  let week = (season.schedule?.find((w) => w.series.some((s) => !s.stadium)) || season.schedule?.[0])?.week;
  const thisWeek = () => season.schedule.find((w) => w.week === week);

  // Grays out each stadium another game this week already has, day or night.
  const lockTaken = () => {
    const games = thisWeek().series;
    const taken = games.map((s, i) => ($(`[name="g${i}"]`, el)?.value ?? valueOf(s)).split('|')[0]);
    games.forEach((s, i) => {
      const box = $(`[name="g${i}"]`, el);
      if (!box) return;
      for (const o of box.options) o.disabled = Boolean(o.value) && taken.some((n, j) => j !== i && n === o.value.split('|')[0]);
    });
  };

  const draw = () => {
    if (!week) {
      el.innerHTML = html`<h2>Stadiums</h2>
        <p class="hint">${meta.name} has no schedule yet.</p>`;
      return;
    }
    el.innerHTML = html`
      <h2>Stadiums</h2>
      <p class="hint">${meta.name}: the home team picks the stadium the week of the game. ${TIME_ICON.day} is day and ${TIME_ICON.night} is night. Each stadium can be used once a week, day or night.</p>
      <form class="card" data-stadiums>
        <label>Week<select name="week">${options(season.schedule.map((w) => [String(w.week), `Week ${w.week}`]), String(week))}</select></label>
        <ol class="venues">${thisWeek().series.map((s, i) => html`<li>
          <span><b>Game ${i + 1}</b> ${name(s.teams[0])} @ ${name(s.teams[1])}</span>
          ${canSet(s) ? html`<select name="g${i}">${options(choices, valueOf(s))}</select>` : html`<span>${stadiumLabel(s) || 'Not chosen yet'}</span>`}
        </li>`)}</ol>
        <button class="btn">Save stadiums</button>
      </form>`;
    lockTaken();
  };

  el.onchange = (e) => {
    if (e.target.matches('[name="week"]')) {
      week = Number(e.target.value);
      draw();
    } else if (e.target.matches('[name^="g"]')) {
      lockTaken();
    }
  };
  el.onsubmit = (e) => {
    e.preventDefault();
    const f = fields(e.target);
    work(e.submitter, async () => {
      // Each game's choice, by its home team, so a reordered file still lines up.
      const want = thisWeek().series.filter(canSet).map((s) => [s.home, f[`g${thisWeek().series.indexOf(s)}`] || '']);
      season = await updateJson(S.repo, path, { id: sid, name: meta.name, games: [] }, (file) => {
        const live = file.schedule?.find((w) => w.week === week);
        if (!live) throw new Error(`Week ${week} is missing from the schedule.`);
        for (const [home, value] of want) {
          const s = live.series.find((x) => x.home === home);
          if (!s) continue;
          const [stadium, time] = value.split('|');
          delete s.stadium;
          delete s.time;
          if (stadium) Object.assign(s, { stadium, time });
        }
        // Checked against the saved file, in case someone else picked one meanwhile.
        const used = live.series.map((s) => s.stadium).filter(Boolean);
        const twice = used.find((n, i) => used.indexOf(n) !== i);
        if (twice) throw new Error(`${twice} is picked twice in Week ${week}. Each stadium can be used once a week.`);
      }, `Stadiums: Week ${week} (saved by ${S.who})`, serializeSeason);
      draw();
      return `Week ${week} stadiums saved.${whenLive()}`;
    });
  };
  draw();
}

// ---- Players ---------------------------------------------------------------

async function tabPlayers(el) {
  const model = await loadLeague().catch(() => null);
  let info = await readJson('data/players.json', {});
  const names = model ? [...model.players.values()].map((p) => p.name).sort((a, b) => a.localeCompare(b)) : [];
  let cur = names[0] || '';

  const draw = () => {
    const p = info[slug(cur)] || {};
    el.innerHTML = html`
      <h2>Players</h2>
      <p class="hint">Stats and team history fill in by themselves. This page adds the extras shown on a player's card.</p>
      ${names.length
        ? html`<form class="card" data-player>
            <label>Player<select name="who">${options(names.map((n) => [n, n]), cur)}</select></label>
            <div class="grid">
              <label>Bats<select name="bats">${options([['', 'Not set'], ['Right', 'Right'], ['Left', 'Left']], p.bats || '')}</select></label>
              <label>Throws<select name="throws">${options([['', 'Not set'], ['Right', 'Right'], ['Left', 'Left']], p.throws || '')}</select></label>
              <label>Type <small>for example Power, Speed, Technique, Balanced</small><input name="type" value="${p.type || ''}"></label>
            </div>
            <label>Scouting report<textarea name="bio" rows="5">${p.bio || ''}</textarea></label>
            <button class="btn">Save player</button>
          </form>`
        : html`<p class="hint">Players appear here once a game has been uploaded and the site has updated.</p>`}`;
  };

  el.onchange = (e) => {
    if (!e.target.matches('[name="who"]')) return;
    cur = e.target.value;
    draw();
  };
  el.onsubmit = (e) => {
    e.preventDefault();
    const { who, ...f } = fields(e.target);
    work(e.submitter, async () => {
      info = await updateJson(S.repo, 'data/players.json', {}, (all) => {
        const entry = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
        const name = all[slug(who)]?.name;
        if (Object.keys(entry).length || name) all[slug(who)] = { ...(name ? { name } : {}), ...entry };
        else delete all[slug(who)];
      }, `Player info: ${who}`);
      return `${who} saved.${whenLive()}`;
    });
  };
  draw();
}

// ---- League settings -------------------------------------------------------

function tabLeague(el) {
  const draw = () => {
    const L = S.league;
    el.innerHTML = html`
      <h2>League</h2>
      <form class="card" data-league>
        <div class="grid">
          <label>League name<input name="name" value="${L.name}" required></label>
          <label>Tagline<input name="tagline" value="${L.tagline || ''}"></label>
          <label>Players on the home page leader board<input type="number" name="leadersCount" min="1" max="25" value="${L.leadersCount || 5}"></label>
          <label>Headline ERA is per<select name="eraInnings">${options([['9', '9 innings'], ['7', '7 innings']], String(L.eraInnings || 9))}</select></label>
          <label>Plate appearances per team game to qualify<input type="number" name="pa" min="0" step="0.1" value="${L.qualifiers?.paPerTeamGame ?? 1}"></label>
          <label>Innings pitched per team game to qualify<input type="number" name="ip" min="0" step="0.1" value="${L.qualifiers?.ipPerTeamGame ?? 1}"></label>
        </div>
        <h3>Seasons</h3>
        <p class="hint">The current season is the one new uploads go into.</p>
        <label>Site opens on<select name="startSeason">${options(L.seasons.map((s) => [s.id, s.name]), L.startSeason || L.currentSeason)}</select></label>
        <div class="seasons">${L.seasons.map((s) => html`<label class="tick"><input type="radio" name="currentSeason" value="${s.id}" ${s.id === L.currentSeason ? 'checked' : ''}> <input name="season:${s.id}" value="${s.name}" required></label>`)}</div>
        <label>Start a new season <small>leave blank unless you are adding one</small><input name="newSeason" placeholder="New season name"></label>
        <h3>Player names</h3>
        <p class="hint">When the same character is spelled two ways (an old season says "Red Koopa", a game file says "Red Koopa Troopa"), list it here so both count as one player. One per line: the other spelling, an equals sign, then the name the site should show.</p>
        <label>Other spelling = Name on the site<textarea name="aliases" rows="5" placeholder="Red Koopa Troopa = Red Koopa">${Object.entries(L.playerAliases || {}).map(([from, to]) => `${from} = ${to}`).join('\n')}</textarea></label>
        <button class="btn">Save league settings</button>
      </form>`;
  };
  el.onsubmit = (e) => {
    e.preventDefault();
    const f = fields(e.target);
    work(e.submitter, async () => {
      S.league = await updateJson(S.repo, 'data/league.json', {}, (L) => {
        Object.assign(L, { name: f.name.trim(), tagline: f.tagline.trim(), leadersCount: Number(f.leadersCount) || 5, eraInnings: Number(f.eraInnings) });
        L.qualifiers = { paPerTeamGame: Number(f.pa), ipPerTeamGame: Number(f.ip) };
        L.playerAliases = Object.fromEntries(
          f.aliases.split('\n').map((line) => line.split('=').map((s) => s.trim())).filter(([from, to]) => from && to),
        );
        for (const s of L.seasons) s.name = (f[`season:${s.id}`] || s.name).trim();
        L.currentSeason = f.currentSeason || L.currentSeason;
        L.startSeason = f.startSeason || L.startSeason;
        if (f.newSeason.trim()) {
          let n = L.seasons.length + 1;
          while (L.seasons.some((s) => s.id === `s${n}`)) n++;
          L.seasons.push({ id: `s${n}`, name: f.newSeason.trim() });
          L.currentSeason = `s${n}`;
        }
      }, 'Update league settings');
      draw();
      return `League settings saved.${whenLive()}`;
    });
  };
  draw();
}

// ---- Logins ----------------------------------------------------------------

async function tabLogins(el) {
  const draw = async () => {
    const files = (await S.repo.list('data/access')).filter((f) => f.name.endsWith('.json'));
    el.innerHTML = html`
      <h2>Logins</h2>
      <p class="hint">A login is a GitHub key locked with a password. Anyone with a login can upload games and edit the site, and nothing else on your GitHub account. To cut everyone off at once, delete the key on GitHub.</p>
      ${files.length
        ? html`<ul class="list list--plain">${files.map((f) => html`<li><b>${f.name.replace(/\.json$/, '')}</b><button type="button" class="danger" data-del="${f.path}">Remove</button></li>`)}</ul>`
        : html`<p class="hint">No logins yet.</p>`}
      <form class="card" data-login>
        <h3>Create or replace a login</h3>
        <div class="grid">
          <label>Username<input name="user" required pattern="[A-Za-z0-9 _.\\-]{2,30}" autocomplete="off"></label>
          <label>Password <small>12 characters or more</small><input name="pass" type="password" minlength="12" required autocomplete="new-password"></label>
          <label>Password again<input name="again" type="password" required autocomplete="new-password"></label>
        </div>
        <label>GitHub key this login unlocks <small>starts out as the key you signed in with</small><input name="token" type="password" value="${S.repo.token || ''}" required autocomplete="off"></label>
        <button class="btn">Save login</button>
      </form>`;
  };
  el.onclick = (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn || !confirm('Remove this login?')) return;
    work(btn, async () => {
      await S.repo.remove(btn.dataset.del, 'Remove a Dugout login');
      await draw();
      return 'Login removed.';
    });
  };
  el.onsubmit = (e) => {
    e.preventDefault();
    const f = fields(e.target);
    work(e.submitter, async () => {
      if (f.pass !== f.again) throw new Error('The two passwords do not match.');
      const path = `data/access/${slug(f.user)}.json`;
      const existing = await S.repo.read(path);
      await S.repo.write(path, pretty(await seal(f.token.trim(), f.pass)), existing?.sha, `Dugout login: ${slug(f.user)}`);
      await draw();
      return `Login "${slug(f.user)}" saved.${S.repo.live ? ' It works once the site has updated, in about a minute.' : ' Commit and push to publish it.'}`;
    });
  };
  await draw();
}

// ---- Start -----------------------------------------------------------------

(async () => {
  const session = JSON.parse(sessionStorage.getItem('sl.dugout') || 'null');
  if (session) {
    try {
      await enter(new GitHubRepo(session), session.who, null);
      return;
    } catch {
      sessionStorage.removeItem('sl.dugout');
    }
  }
  signInView();
})();
