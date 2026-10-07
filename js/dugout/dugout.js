// The Dugout: the league's back office. Sign in, then upload game files,
// write articles, and edit teams, players, league settings and logins.
// Every save is a commit to the repository, so nothing here needs a server.

import { html, slug } from '../lib/html.js';
import { readXlsx, readCsv } from '../lib/xlsx-lite.js';
import { parseGame } from '../lib/parse-game.js';
import { markdown } from '../lib/markdown.js';
import { fmtIP } from '../lib/statdefs.js';
import { loadLeague } from '../lib/load.js';
import { GAME_TYPES, matchTeam, makeTeam, learnAliases, nextGameId, toStoredGame, serializeSeason, pretty, todayISO } from '../lib/league-ops.js';
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
  teams: ['Teams', tabTeams],
  players: ['Players', tabPlayers],
  league: ['League', tabLeague],
  logins: ['Logins', tabLogins],
};

function shell() {
  app.innerHTML = html`
    <header class="dbar">
      <b>The Dugout</b>
      <span>${S.who} / saving to ${S.repo.label}</span>
      <a href="./">View the site</a>
      <button type="button" data-out>Sign out</button>
    </header>
    <nav class="dtabs">${Object.entries(TABS).map(([id, [label]]) => html`<button type="button" data-tab="${id}">${label}</button>`)}</nav>
    <div data-host></div>`;
  $('[data-out]').onclick = signOut;
  $('.dtabs').onclick = (e) => {
    const btn = e.target.closest('[data-tab]');
    if (btn) openTab(btn.dataset.tab);
  };
  openTab(S.tab);
}

function openTab(id) {
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

function tabUpload(el) {
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
      showPreview($('[data-preview]', el), await readGameFiles(files));
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

function showPreview(el, { game, warnings }) {
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
        <label>Game type<select name="type">${options(Object.entries(GAME_TYPES), 'regular')}</select></label>
      </div>
      ${warnings.length
        ? html`<div class="warn"><b>Worth a look before saving:</b><ul>${warnings.map((w) => html`<li>${w}</li>`)}</ul></div>`
        : html`<p class="good">The file adds up: hits, runs and the score all agree.</p>`}
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
    saved = toStoredGame(parsed, { id: nextGameId(season), date: f.date, type: f.type, awayTeam: ids.away, homeTeam: ids.home });
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
            <thead><tr><th>Game</th><th>Date</th><th>Type</th><th>Result</th><th></th></tr></thead>
            <tbody>${[...games].reverse().map((g) => html`<tr data-id="${g.id}">
              <td>${g.id}</td>
              <td><input type="date" value="${g.date}" data-date></td>
              <td><select data-type>${options(Object.entries(GAME_TYPES), g.type || 'regular')}</select></td>
              <td>${teamName(g.away.team)} ${g.away.score}, ${teamName(g.home.team)} ${g.home.score}</td>
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
      work(e.target, async () => {
        await updateJson(S.repo, path(), null, (s) => { Object.assign(s.games.find((g) => g.id === id), { date, type }); }, `Update game ${id}`, serializeSeason);
        return `Game ${id} updated.${whenLive()}`;
      });
    }
  };
  await draw();
}

// ---- Articles --------------------------------------------------------------

async function tabArticles(el) {
  let list = await readJson('data/articles.json', []);
  let cur = null;

  const draw = () => {
    const sorted = [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    el.innerHTML = html`
      <h2>Articles</h2>
      <div class="two">
        <div>
          <button type="button" class="btn btn--plain" data-new>Write a new story</button>
          <ul class="list">${sorted.map((a) => html`<li><button type="button" data-edit="${a.id}" class="${cur?.id === a.id ? 'is-on' : ''}"><b>${a.title}</b><span>${a.date}</span></button></li>`)}</ul>
        </div>
        ${cur
          ? html`<form class="card" data-article>
              <label>Headline<input name="title" value="${cur.title}" required></label>
              <div class="grid">
                <label>Date<input type="date" name="date" value="${cur.date}" required></label>
                <label>Byline<input name="author" value="${cur.author || ''}"></label>
              </div>
              <label>Summary <small>a sentence or two for the home page</small><input name="summary" value="${cur.summary || ''}"></label>
              <label>Story<textarea name="body" rows="14" required>${cur.body || ''}</textarea></label>
              <p class="hint">Formatting: # Heading, **bold**, *italic*, [link text](https://...), ![picture](https://...). Start lines with - for a list. Leave a blank line between paragraphs.</p>
              <div class="story__body preview" data-preview></div>
              <button class="btn">Save story</button>
              ${cur.id ? html`<button type="button" class="danger" data-del>Delete story</button>` : ''}
            </form>`
          : html`<p class="hint">Pick a story to edit, or write a new one.</p>`}
      </div>`;
    const body = $('[name="body"]', el);
    if (body) {
      const show = () => { $('[data-preview]', el).innerHTML = markdown(body.value); };
      body.oninput = show;
      show();
    }
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
      const id = cur.id;
      work(e.target, async () => {
        list = await updateJson(S.repo, 'data/articles.json', [], (all) => all.filter((a) => a.id !== id), `Remove article: ${cur.title}`);
        cur = null;
        draw();
        return `Story deleted.${whenLive()}`;
      });
    }
  };
  el.onsubmit = (e) => {
    e.preventDefault();
    const f = fields(e.target);
    work(e.submitter, async () => {
      let id = cur.id;
      list = await updateJson(S.repo, 'data/articles.json', [], (all) => {
        if (!id) {
          const base = slug(f.title) || 'story';
          id = base;
          for (let n = 2; all.some((a) => a.id === id); n++) id = `${base}-${n}`;
        }
        const story = { id, title: f.title.trim(), date: f.date, author: f.author.trim(), summary: f.summary.trim(), body: f.body.replace(/\r\n?/g, '\n').trim() };
        const at = all.findIndex((a) => a.id === id);
        if (at >= 0) all[at] = story;
        else all.unshift(story);
      }, `Article: ${f.title.trim()}`);
      cur = list.find((a) => a.id === id);
      draw();
      return `Story saved.${whenLive()}`;
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
      <label>Short name <small>3 letters</small><input name="abbr" value="${t.abbr || ''}" maxlength="4"></label>
      <label>General manager<input name="gm" value="${t.gm || ''}"></label>
      <label>Main color<input type="color" name="c1" value="${t.colors?.[0] || '#d63a2f'}"></label>
      <label>Trim color<input type="color" name="c2" value="${t.colors?.[1] || '#fffcf1'}"></label>
      <label class="tick"><input type="checkbox" name="active" ${t.active === false ? '' : 'checked'}> Active this season</label>
    </div>
    <label>Names used in game files <small>comma separated; a file with one of these names is matched to this team</small><input name="aliases" value="${(t.aliases || []).join(', ')}"></label>
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
      const v = (name) => $(`[name="${name}"]`, fs).value.trim();
      return {
        id: fs.dataset.id,
        name: v('name'),
        abbr: v('abbr').toUpperCase(),
        gm: v('gm'),
        colors: [v('c1'), v('c2')],
        aliases: v('aliases').split(',').map((s) => s.trim()).filter(Boolean),
        blurb: v('blurb'),
        active: $('[name="active"]', fs).checked,
      };
    });
    work(e.submitter, async () => {
      S.teams = await updateJson(S.repo, 'data/teams.json', [], (teams) => {
        for (const { id, blurb, active, ...edit } of edits) {
          let team = teams.find((t) => t.id === id);
          if (!team) teams.push((team = makeTeam(teams, edit.name)));
          Object.assign(team, edit, { abbr: edit.abbr || team.abbr });
          if (blurb) team.blurb = blurb;
          else delete team.blurb;
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
        if (Object.keys(entry).length) all[slug(who)] = entry;
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
        <p class="hint">The current season is the one the site opens on and the one new uploads go into.</p>
        <div class="seasons">${L.seasons.map((s) => html`<label class="tick"><input type="radio" name="currentSeason" value="${s.id}" ${s.id === L.currentSeason ? 'checked' : ''}> <input name="season:${s.id}" value="${s.name}" required></label>`)}</div>
        <label>Start a new season <small>leave blank unless you are adding one</small><input name="newSeason" placeholder="Season ${L.seasons.length + 1}"></label>
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
        for (const s of L.seasons) s.name = (f[`season:${s.id}`] || s.name).trim();
        L.currentSeason = f.currentSeason || L.currentSeason;
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
