// src/lib/broadcast.mjs — THE BROADCAST TOWER · Phase 2 · "The Publish Engine"
// The ONE source of truth for publishing/listing missives. Called by BOTH the CLI (scripts/broadcast.mjs)
// and (Phase 3) the Mast UI's API route — so the browser and the terminal can never drift.
// Storage model (blob-only, no DB yet): each missive is TWO private blobs:
//   <tag>.html        — the payload (served by /s/[tag])
//   <tag>.meta.json   — { tag, to, intent, title, created, updated }
// Doctrine: M3 live-swap = addRandomSuffix:false + allowOverwrite:true + useCache:false on reads.
//           M1 the-transport-must-not-lie: an auth/origin failure THROWS (loud), only a genuine
//           404 / corrupt-meta reads as "absent" — never mask a broken pipe as normal (GU-lite FLAG-1/2).
import { put, list, get, del, head } from '@vercel/blob';

const HTML = '.html';
const META = '.meta.json';
export const TAG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

const PRIVATE = { access: 'private' };
const READ = { access: 'private', useCache: false }; // M3 — always origin-fresh
const WRITE_BASE = { access: 'private', addRandomSuffix: false, allowOverwrite: true };

function isNotFound(e) {
  // @vercel/blob 2.6.1: a missing blob throws with constructor.name 'BlobNotFoundError' (e.name is just
  // 'Error') and message "…The requested blob does not exist". Match all three signals to be safe.
  return (
    e?.name === 'BlobNotFoundError' ||
    e?.constructor?.name === 'BlobNotFoundError' ||
    /not[\s_-]*found|does not exist/i.test(e?.message || '')
  );
}

// M1: get() throws on auth/origin failure (let it propagate — a broken pipe must be LOUD);
// returns null on genuine 404; only a corrupt body is swallowed to null (safe to treat as absent).
async function readJson(pathname) {
  const r = await get(pathname, READ);
  if (!r || !r.stream) return null;
  try {
    return JSON.parse(await new Response(r.stream).text());
  } catch {
    return null; // corrupt meta — treat as absent, not as a pipe failure
  }
}

/** Publish (or live-swap) a missive. Returns { tag, url, meta }. */
export async function publishMissive({ tag, html, to = '', intent = '', title = '' }) {
  if (!TAG_RE.test(tag || '')) throw new Error(`invalid tag "${tag}" — must match ${TAG_RE}`);
  if (!html || typeof html !== 'string') throw new Error('html (string) is required');
  const now = new Date().toISOString();
  // preserve original created-at across re-publishes (a live-swap edits, it doesn't re-birth).
  // readJson throws on a real pipe failure → we do NOT publish blind.
  const prior = await readJson(`${tag}${META}`);
  const meta = { tag, to, intent, title, created: prior?.created || now, updated: now };
  await put(`${tag}${HTML}`, html, { ...WRITE_BASE, contentType: 'text/html' });
  await put(`${tag}${META}`, JSON.stringify(meta, null, 2), { ...WRITE_BASE, contentType: 'application/json' });
  return { tag, url: `/s/${tag}`, meta };
}

/** List all live missives (newest-updated first), with their meta. Pages the whole store (no silent cap). */
export async function listMissives() {
  const all = [];
  let cursor;
  do {
    const page = await list(cursor ? { cursor } : undefined);
    all.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor); // GU-lite FLAG-4 — no silent 1000-blob truncation

  const tags = all
    .filter((b) => b.pathname.endsWith(HTML))
    .map((b) => b.pathname.slice(0, -HTML.length));
  // a missing/corrupt meta → fallback row (resilient); a real auth/origin failure → throws (loud, M1).
  const metas = await Promise.all(
    tags.map(async (tag) => (await readJson(`${tag}${META}`)) || { tag, to: '', intent: '', title: '', created: '', updated: '' }),
  );
  return metas.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
}

/** One missive's meta (null if genuinely absent; THROWS on a pipe failure so callers can 502, not 404). */
export async function getMissive(tag) {
  if (!TAG_RE.test(tag || '')) return null;
  return readJson(`${tag}${META}`);
}

/** Retire a missive (both blobs). Returns whether the payload existed. `existed` is keyed on the
 *  SERVE blob (.html), and a real delete failure SURFACES (not swallowed) — GU-lite FLAG-2. */
export async function retireMissive(tag) {
  if (!TAG_RE.test(tag || '')) throw new Error(`invalid tag "${tag}"`);
  let existed = false;
  try {
    await head(`${tag}${HTML}`, PRIVATE);
    existed = true;
  } catch (e) {
    if (!isNotFound(e)) throw e; // auth/origin failure — don't report a clean retire on a broken pipe
  }
  // delete each independently: a not-found is benign (already gone / orphan with no meta),
  // but a REAL failure (auth/network) surfaces instead of a lying "retired".
  await Promise.all(
    [`${tag}${HTML}`, `${tag}${META}`].map((p) => del(p).catch((e) => { if (!isNotFound(e)) throw e; })),
  );
  return existed;
}
