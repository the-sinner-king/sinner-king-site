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
import { getRedis } from './rsvp.mjs'; // shared Upstash client (env-driven, null if unprovisioned)

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

// ─── THE LIVE-UPDATE LAYER (Phase 2.5) ───────────────────────────────────────
// Multi-writer-safe updates: the King AND other bots (Herald/AExGO) can update an already-sent missive,
// go live instantly, with the link+RSVP-token NEVER changing — and no clobber, full audit, free rollback.
// Design: research/LIVE_UPDATE_DESIGN_BRIEF_2026-07-14.md (soulforge RESEARCH, coach-reconciled).
//
// WHY versioned-pathnames + a Redis pointer (NOT blob-overwrite):
//   • overwriting a blob at the same path DESTROYS history + risks the 60s CDN-propagation window.
//   • so we NEVER overwrite: each update writes a fresh immutable  <tag>_v<rev>.html , then an ATOMIC
//     Lua compare-and-set flips one Redis pointer  missive:<tag>:current → rev . The /s/[tag] route reads
//     the pointer. The "swap" is a single serializable Redis op (same guarantee as the RSVP guard), not a
//     blob mutation → no overwrite race, and EVERY past version stays in the hold → rollback = repoint.
//   • versioned paths also make even a BLIND concurrent write lossless: two writers get two unique revs,
//     both blobs survive, the pointer just ends on whoever committed last (all recoverable via history).
const vpath = (tag, rev) => `${tag}_v${rev}${HTML}`;                 // immutable per-rev payload
const kCurrent = (tag) => `missive:${tag}:current`;                  // published pointer (rev int)
const kSeq = (tag) => `missive:${tag}:seq`;                          // monotonic path allocator (rev int)
const kHistory = (tag) => `missive:${tag}:history`;                  // XADD audit stream
const kIdem = (tag, key) => `missive:${tag}:idem:${key}`;           // idempotency dedup (TTL)

// RESERVE: atomically claim a unique rev > max(current, seq). Guarantees a fresh, never-reused path even
// after a rollback moved `current` backward. KEYS[1]=current KEYS[2]=seq → returns the reserved rev.
const RESERVE_LUA = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local seq = tonumber(redis.call('GET', KEYS[2]) or '0')
local nxt = (cur > seq and cur or seq) + 1
redis.call('SET', KEYS[2], nxt)
return tostring(nxt)`;

// COMMIT: the atomic pointer flip + audit. Optimistic CAS — if expectedRev >= 0 and the pointer moved since
// the caller read it, REFUSE (CONFLICT) so a stale-based edit can't silently win. expectedRev < 0 = force
// (always commits; still lossless — the prior rev's blob is untouched). MUST stay a single Lua op.
// KEYS[1]=current KEYS[2]=history · ARGV: expectedRev,newRev,actor,now,note,maxlen
const COMMIT_LUA = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local expected = tonumber(ARGV[1])
if expected >= 0 and expected ~= cur then return 'CONFLICT:'..cur end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('XADD', KEYS[2], 'MAXLEN', '~', ARGV[6], '*', 'rev', ARGV[2], 'actor', ARGV[3], 'ts', ARGV[4], 'note', ARGV[5], 'action', 'update')
return 'OK:'..ARGV[2]`;

// ROLLBACK: repoint `current` to a prior rev (its blob must exist — checked in JS first). Audited.
// KEYS[1]=current KEYS[2]=history · ARGV: toRev,fromRev,actor,now,maxlen
const ROLLBACK_LUA = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local to = tonumber(ARGV[1])
if to < 1 or to > cur then return 'BADREV:'..cur end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('XADD', KEYS[2], 'MAXLEN', '~', ARGV[5], '*', 'rev', ARGV[1], 'actor', ARGV[3], 'ts', ARGV[4], 'note', 'rollback from v'..ARGV[2], 'action', 'rollback')
return 'OK:'..ARGV[1]`;

// PRE-FLIGHT GATE (minimal seam). The FULL gate (dead-link / wrong-weekday / hallucinated-fact checks) is
// the phone-UI DR build (research/PHONE_UI_MASTER_DR_2026-07-14.md §7) — it plugs in HERE. For now: cheap,
// deterministic structural sanity so a broken/empty payload can never ship. Returns { ok, reasons[] }.
export function preflightMissive(html) {
  const reasons = [];
  if (!html || typeof html !== 'string') reasons.push('empty-or-non-string');
  else {
    if (html.length > 500_000) reasons.push('payload-over-500KB');
    if (!/<html|<body|<!doctype/i.test(html)) reasons.push('no-html-structure');
    if (/undefined|\[object Object\]|NaN(?![a-z])/.test(html)) reasons.push('render-artifact-leaked'); // a template that stringified a bad field
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * updateMissive — THE ONE WRITE-DOOR. Every writer (King + bots) goes through this; nobody touches Blob/Redis
 * directly. Reserves a unique rev → pre-flights → writes the immutable versioned blob → atomically flips the
 * pointer (CAS) → audits. Returns { tag, rev, path, url, actor, committed }.
 *   opts.actor        who's writing (BRANDON / HERALD / AExGO …) — stamped in the audit (default 'unknown').
 *   opts.expectedRev  optimistic base: pass the rev you read to REFUSE on a concurrent change; omit / -1 = force.
 *   opts.idemKey      idempotency key ('<actor>:<request-id>') — a retried call returns the first result, no dup.
 *   opts.to/intent/title  meta (preserved across revs like publishMissive).
 *   opts.preflight    default true; false only for a trusted internal re-render.
 * Throws: 'store-not-provisioned' · 'preflight-failed: …' · 'conflict' (with .currentRev) on a CAS miss.
 */
export async function updateMissive(tag, html, opts = {}) {
  if (!TAG_RE.test(tag || '')) throw new Error(`invalid tag "${tag}" — must match ${TAG_RE}`);
  if (!html || typeof html !== 'string') throw new Error('html (string) is required');
  const { actor = 'unknown', expectedRev = -1, idemKey = null, to, intent, title, preflight = true, note = '' } = opts;
  const redis = getRedis();
  if (!redis) throw new Error('store-not-provisioned');

  // idempotency: a retried write (same idemKey) returns the first committed rev, never a duplicate version.
  if (idemKey) {
    const seen = await redis.get(kIdem(tag, idemKey));
    if (seen != null) return { tag, rev: Number(seen), path: vpath(tag, Number(seen)), url: `/s/${tag}`, actor, committed: true, idempotent: true };
  }

  if (preflight) {
    const pf = preflightMissive(html);
    if (!pf.ok) { const e = new Error(`preflight-failed: ${pf.reasons.join(', ')}`); e.reasons = pf.reasons; throw e; }
  }

  // 1) reserve a unique, never-reused rev (atomic) → 2) write its immutable blob (no overwrite, no race).
  const rev = Number(await redis.eval(RESERVE_LUA, [kCurrent(tag), kSeq(tag)], []));
  await put(vpath(tag, rev), html, { ...WRITE_BASE, contentType: 'text/html' });

  // meta rides alongside (preserve created across revs; a live-swap edits, it doesn't re-birth).
  const now = new Date().toISOString();
  const prior = await readJson(`${tag}${META}`);
  const meta = {
    tag, to: to ?? prior?.to ?? '', intent: intent ?? prior?.intent ?? '', title: title ?? prior?.title ?? '',
    created: prior?.created || now, updated: now, rev, actor,
  };
  await put(`${tag}${META}`, JSON.stringify(meta, null, 2), { ...WRITE_BASE, contentType: 'application/json' });

  // 3) atomic pointer flip + audit. On CAS miss the blob we wrote is an orphan (harmless — never pointed to).
  const res = String(await redis.eval(COMMIT_LUA, [kCurrent(tag), kHistory(tag)], [String(expectedRev), String(rev), actor, now, note, '200']));
  if (res.startsWith('CONFLICT:')) {
    const e = new Error('conflict'); e.currentRev = Number(res.slice('CONFLICT:'.length)); e.orphanRev = rev; throw e;
  }
  if (idemKey) await redis.set(kIdem(tag, idemKey), String(rev), { ex: 86400 }); // 24h dedup window
  return { tag, rev, path: vpath(tag, rev), url: `/s/${tag}`, actor, committed: true };
}

/** resolveMissivePath — the READ side, used by /s/[tag]: the pointer's versioned blob, or the legacy
 *  <tag>.html for missives published before the live-update layer (or when Redis is unprovisioned). */
export async function resolveMissivePath(tag) {
  if (!TAG_RE.test(tag || '')) return null;
  const redis = getRedis();
  if (redis) {
    // a Redis blip must NOT break serving — legacy missives (kim_appts, storie_18) don't even use the
    // pointer, so on any pointer-read failure we degrade to the legacy path rather than 502 the whole site.
    try {
      const rev = Number(await redis.get(kCurrent(tag)));
      if (rev > 0) return vpath(tag, rev);
    } catch (e) {
      console.error('[broadcast] pointer read failed for tag=%s (serving legacy):', tag, e?.message);
    }
  }
  return `${tag}${HTML}`; // legacy / unprovisioned fallback — never breaks an already-live missive
}

/** rollbackMissive — repoint `current` to a prior rev (instant, no re-upload). The target blob must exist. */
export async function rollbackMissive(tag, { toRev, actor = 'unknown' } = {}) {
  if (!TAG_RE.test(tag || '')) throw new Error(`invalid tag "${tag}"`);
  const redis = getRedis();
  if (!redis) throw new Error('store-not-provisioned');
  const cur = Number(await redis.get(kCurrent(tag))) || 0;
  const target = toRev != null ? Number(toRev) : cur - 1; // default: one step back
  if (!(target >= 1) || target > cur) throw new Error(`bad rollback target v${target} (current v${cur})`);
  try { await head(vpath(tag, target), PRIVATE); } // never repoint at a missing/orphaned blob
  catch (e) { if (isNotFound(e)) throw new Error(`v${target} blob does not exist — cannot roll back to it`); throw e; }
  const now = new Date().toISOString();
  const res = String(await redis.eval(ROLLBACK_LUA, [kCurrent(tag), kHistory(tag)], [String(target), String(cur), actor, now, '200']));
  if (res.startsWith('BADREV:')) throw new Error(`bad rollback target (current v${res.slice(7)})`);
  return { tag, rev: target, from: cur, url: `/s/${tag}`, actor };
}

/** missiveHistory — the audit trail (newest first): who changed the cargo to which rev, when. */
export async function missiveHistory(tag, { limit = 50 } = {}) {
  if (!TAG_RE.test(tag || '')) return [];
  const redis = getRedis();
  if (!redis) return [];
  const rows = await redis.xrange(kHistory(tag), '-', '+', limit); // @upstash/redis: {id: {field:val}}
  const out = Object.entries(rows || {}).map(([id, f]) => ({ id, ...f }));
  return out.reverse().slice(0, limit); // newest first
}
