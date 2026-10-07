// Where the Dugout saves to. Two back ends with the same four methods
// (read, write, remove, list):
//   GitHubRepo  commits to the repository through GitHub's API (the live site)
//   LocalRepo   writes to the data/ folder on this computer, through tools/serve.js

import { pretty } from '../lib/league-ops.js';

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

function explain(status, detail) {
  if (status === 401) return 'GitHub did not accept the key. It may have expired or been revoked.';
  if (status === 403) return `GitHub refused that. The key may not have "Contents: Read and write" access to this repository. (${detail})`;
  if (status === 409 || status === 422) return `GitHub could not save: the file changed at the same moment. Try again. (${detail})`;
  return `GitHub error ${status}: ${detail || 'no details given'}`;
}

export class GitHubRepo {
  constructor({ owner, name, branch = 'main', token }) {
    Object.assign(this, { owner, name, branch, token, live: true, label: `${owner}/${name}` });
    this.base = `/repos/${owner}/${name}`;
  }

  async api(method, path, body) {
    const res = await fetch('https://api.github.com' + path, {
      method,
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404 && method === 'GET') return null;
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw Object.assign(new Error(explain(res.status, detail.message)), { status: res.status });
    }
    return res.status === 204 ? {} : res.json();
  }

  async check() {
    const repo = await this.api('GET', this.base);
    if (!repo) throw new Error(`The repository ${this.label} was not found, or this key cannot see it.`);
    return repo;
  }

  async read(path) {
    const file = await this.api('GET', `${this.base}/contents/${path}?ref=${encodeURIComponent(this.branch)}`);
    if (!file || Array.isArray(file)) return null;
    let content = file.content;
    // Files over 1 MB come back without their content; fetch it as a blob instead.
    if (!content && file.size) content = (await this.api('GET', `${this.base}/git/blobs/${file.sha}`)).content;
    return { text: fromBase64(content || ''), sha: file.sha };
  }

  async write(path, text, sha, message) {
    await this.api('PUT', `${this.base}/contents/${path}`, { message, content: toBase64(text), branch: this.branch, ...(sha ? { sha } : {}) });
  }

  async remove(path, message) {
    const file = await this.api('GET', `${this.base}/contents/${path}?ref=${encodeURIComponent(this.branch)}`);
    if (file) await this.api('DELETE', `${this.base}/contents/${path}`, { message, sha: file.sha, branch: this.branch });
  }

  async list(dir) {
    const items = await this.api('GET', `${this.base}/contents/${dir}?ref=${encodeURIComponent(this.branch)}`);
    return Array.isArray(items) ? items.map((i) => ({ name: i.name, path: i.path })) : [];
  }
}

export class LocalRepo {
  constructor() {
    Object.assign(this, { live: false, label: 'this computer' });
  }

  static async available() {
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) return false;
    try {
      const res = await fetch('/__local/ping', { headers: { 'X-Sluggers-Local': '1' } });
      return res.ok && (await res.json()).ok === true;
    } catch {
      return false;
    }
  }

  async call(method, action, params = {}, body) {
    const res = await fetch(`/__local/${action}?${new URLSearchParams(params)}`, {
      method,
      headers: { 'X-Sluggers-Local': '1', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404 && method === 'GET') return null;
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw Object.assign(new Error(detail.message || `Local save failed (${res.status}).`), { status: res.status });
    }
    return res.json();
  }

  check() {
    return this.call('GET', 'ping');
  }
  read(path) {
    return this.call('GET', 'read', { path });
  }
  write(path, text, sha) {
    return this.call('PUT', 'write', {}, { path, text, sha });
  }
  remove(path) {
    return this.call('DELETE', 'remove', { path });
  }
  async list(dir) {
    return (await this.call('GET', 'list', { path: dir })) || [];
  }
}

// Read a JSON file fresh, change it, save it. If someone else saved in
// between, start over from their version rather than overwrite it.
export async function updateJson(repo, path, fallback, mutate, message, serialize = pretty) {
  for (let attempt = 1; ; attempt++) {
    const current = await repo.read(path);
    const data = current ? JSON.parse(current.text) : structuredClone(fallback);
    const next = (await mutate(data)) ?? data;
    const text = serialize(next);
    if (current && text === current.text) return next; // nothing changed, so no empty commit
    try {
      await repo.write(path, text, current?.sha, message);
      return next;
    } catch (err) {
      if (attempt >= 3 || ![409, 422].includes(err.status)) throw err;
    }
  }
}
