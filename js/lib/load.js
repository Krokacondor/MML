// Fetches the league's data files and builds the model the pages read from.

import { buildLeague } from './aggregate.js';

async function getJson(path, fallback) {
  try {
    // "no-cache" still uses the browser cache, but checks with the server
    // first, so a newly uploaded game shows up without a hard refresh.
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Could not load ${path} (${err.message}).`);
  }
}

export async function loadLeague() {
  const league = await getJson('data/league.json');
  const [teams, players, articles, authors, posts, ...files] = await Promise.all([
    getJson('data/teams.json', []),
    getJson('data/players.json', {}),
    getJson('data/articles.json', []),
    getJson('data/authors.json', []),
    getJson('data/posts.json', []),
    ...(league.seasons || []).map((s) => getJson(`data/seasons/${s.id}.json`, { games: [] })),
  ]);
  const seasons = Object.fromEntries((league.seasons || []).map((s, i) => [s.id, files[i]]));
  return buildLeague({ league, teams, players, articles, authors, posts, seasons });
}
