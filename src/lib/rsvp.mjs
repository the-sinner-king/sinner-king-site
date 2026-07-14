// src/lib/rsvp.mjs — THE RSVP SIGNAL · the engine (Broadcast Tower extension).
// Hop 1: issue idempotent per-guest links. Later hops add the state transition + the read signal here.
// Data model (Upstash Redis, schemaless — per RSVP_SIGNAL_MASTER_DR_2026-07-14):
//   campaign:<id>:tokens   SET   all valid tokens (index for the read pull)
//   campaign:<id>:byname   HASH  nameKey -> token   (the idempotency map — re-run reuses a guest's token)
//   rsvp:<id>:<token>      HASH  { guest, status, answer, opens, sent_at, first_opened_at, responded_at, last_seen_at }
import { nanoid } from 'nanoid';
import { Redis } from '@upstash/redis';

// stable key for a guest name so re-issuing NEVER duplicates a person (fixes the DR script's fresh-token-per-run bug)
export const nameKey = (name) => String(name).trim().toLowerCase().replace(/\s+/g, '-');

// A guest entry may be a bare string ("Blake") or a rich object ({ name, contact, channel }).
// normGuest collapses both to { name, contact, channel } so the token is ALWAYS keyed on the name
// (contact is pure delivery metadata — it rides the output for the send-list but never enters Redis).
export const normGuest = (g) => {
  if (g && typeof g === 'object') return { name: String(g.name || '').trim(), contact: g.contact ?? null, channel: g.channel ?? null };
  return { name: String(g ?? '').trim(), contact: null, channel: null };
};

// Redis client from env, or null if Upstash isn't provisioned yet (the "1 Marketplace click" gate).
export function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// Issue one unguessable personal link per guest.
// IDEMPOTENT: a guest already in campaign:<id>:byname keeps their existing token/link; only NEW names mint.
// dryRun (or no Upstash) → a throwaway PREVIEW (tokens are not persisted; real stable links mint against Redis).
export async function issueLinks({ campaign, base, guests, dryRun = false }) {
  if (!campaign || !base || !Array.isArray(guests)) throw new Error('issueLinks needs { campaign, base, guests[] }');
  // Accept bare strings OR { name, contact, channel } — normalize so the token keys on the NAME.
  // GU2 F5: dedup by stable nameKey so two identical names in one run can't orphan a token / ghost the feed.
  const seen = new Set();
  const roster = guests
    .map(normGuest)
    .filter((g) => { if (!g.name) return false; const k = nameKey(g.name); if (seen.has(k)) return false; seen.add(k); return true; });
  const redis = dryRun ? null : getRedis();

  if (!redis) {
    const links = roster.map(({ name, contact, channel }) => {
      const token = nanoid(10);
      return { name, contact, channel, token, url: `${base}/${campaign}?g=${token}`, status: 'preview', persisted: false };
    });
    return { campaign, dryRun: true, persisted: false, count: links.length, minted: 0, links };
  }

  const tokensKey = `campaign:${campaign}:tokens`;
  const byNameKey = `campaign:${campaign}:byname`;
  const existing = (await redis.hgetall(byNameKey)) || {};   // nameKey -> token (whatever's already been issued)
  const links = [];
  for (const { name, contact, channel } of roster) {
    const nk = nameKey(name);
    let token = existing[nk];
    let minted = false;
    if (!token) {
      token = nanoid(10);
      const rec = `rsvp:${campaign}:${token}`;
      const p = redis.pipeline();
      // one clean write of the initial 'sent' record + the two indexes, batched into a single round-trip.
      // NOTE: only the NAME lands in Redis — contact/channel are delivery-only PII kept in the local campaign file.
      p.hset(rec, { guest: name, status: 'sent', answer: '', opens: 0, sent_at: new Date().toISOString() });
      p.hset(byNameKey, { [nk]: token });
      p.sadd(tokensKey, token);
      await p.exec();
      minted = true;
    }
    links.push({ name, contact, channel, token, url: `${base}/${campaign}?g=${token}`, status: minted ? 'minted' : 'existing', persisted: true });
  }
  return { campaign, dryRun: false, persisted: true, count: links.length, minted: links.filter((l) => l.status === 'minted').length, links };
}

// ── Hop 2: THE RAW SIGNAL ──────────────────────────────────────────────────
// buildSignal — PURE: given the guest hash rows, compute the versioned envelope + totals-on-read.
// (No I/O → unit-testable. Totals computed here, never stored, so counters can't drift — DR §4.)
// The public signal exposes a stable non-secret `id` (nameKey), NOT the token: the token IS the guest's
// personal RSVP link, so leaking it into a shared feed would let any consumer impersonate their RSVP.
// (This is a deliberate hardening of the DR envelope, which put the raw token in the feed.)
export function buildSignal(campaign, rows) {
  const totals = { sent: 0, opened: 0, yes: 0, maybe: 0, no: 0 };
  const guests = [];
  for (const r of rows) {
    if (!r || !r.status) continue; // skip empty/missing hashes
    totals.sent++;
    if (r.status === 'opened' || r.status === 'responded') totals.opened++;
    const answer = r.answer === 'yes' || r.answer === 'maybe' || r.answer === 'no' ? r.answer : null;
    if (answer) totals[answer]++;
    guests.push({
      id: nameKey(r.guest || ''),
      guest: r.guest || '',
      status: r.status,
      answer,
      opens: Number(r.opens) || 0,
      guests_count: Number(r.guests_count) || 1, // GU2 upgrade-3: schema-safe placeholder for +1s (DR §9 defer)
      notes: r.notes || null,                    // GU2 upgrade-3: schema-safe placeholder for dietary/notes
      sent_at: r.sent_at || null,
      first_opened_at: r.first_opened_at || null,
      responded_at: r.responded_at || null,
      last_seen_at: r.last_seen_at || null,
    });
  }
  return { v: '1.0', campaign, updated_at: new Date().toISOString(), totals, guests };
}

// readSignal — reads the campaign's token index + pipelines hgetall on each record, then buildSignal.
// Throws 'store-not-provisioned' if Upstash isn't wired yet (the route turns that into an honest 503).
export async function readSignal(campaign) {
  const redis = getRedis();
  if (!redis) throw new Error('store-not-provisioned');
  const tokens = await redis.smembers(`campaign:${campaign}:tokens`);
  if (!tokens || tokens.length === 0) return buildSignal(campaign, []);
  const p = redis.pipeline();
  tokens.forEach((t) => p.hgetall(`rsvp:${campaign}:${t}`));
  const rows = (await p.exec()) || [];
  return buildSignal(campaign, rows);
}

// ── Hop 3: THE STATE MACHINE (monotonic transitions) ───────────────────────
// planTransition — PURE spec of the guard (unit-tested). The Lua in applyEvent MIRRORS this; keep in sync.
// Rules: OPENED bumps opens + last_seen and advances sent→opened, but NEVER downgrades a higher state;
// RESPONDED is terminal (always wins), records the answer, and seeds first_opened_at if the open beacon
// never landed (bfcache / blocked beacon). This is the invariant a naive read-then-write can violate.
export function planTransition(current, eventType, answer, now) {
  const sets = {};
  let incrOpens = 0;
  if (eventType === 'OPENED') {
    incrOpens = 1;
    sets.last_seen_at = now;
    if (current.status === 'sent') { sets.status = 'opened'; sets.first_opened_at = now; } // monotonic: only from 'sent'
  } else if (eventType === 'RESPONDED') {
    if (answer !== 'yes' && answer !== 'maybe' && answer !== 'no') throw new Error('invalid-answer');
    sets.status = 'responded';          // terminal — always overwrites
    sets.answer = answer;
    sets.responded_at = now;
    sets.last_seen_at = now;
    if (!current.first_opened_at) sets.first_opened_at = now; // responded implies opened
  } else {
    throw new Error('invalid-event');
  }
  return { sets, incrOpens };
}

// The atomic guard as a Lua script — Redis runs it single-threaded, so the read-evaluate-write is one
// indivisible step (no interleave race over the REST client). MUST mirror planTransition() above.
const TRANSITION_LUA = `
local key = KEYS[1]
if redis.call('EXISTS', key) == 0 then return 'NOTOKEN' end
local ev = ARGV[1]
local answer = ARGV[2]
local now = ARGV[3]
local status = redis.call('HGET', key, 'status')
if ev == 'OPENED' then
  redis.call('HINCRBY', key, 'opens', 1)
  redis.call('HSET', key, 'last_seen_at', now)
  if status == 'sent' then
    redis.call('HSET', key, 'status', 'opened')
    redis.call('HSET', key, 'first_opened_at', now)
  end
  return redis.call('HGET', key, 'status')
elseif ev == 'RESPONDED' then
  redis.call('HSET', key, 'status', 'responded')
  redis.call('HSET', key, 'answer', answer)
  redis.call('HSET', key, 'responded_at', now)
  redis.call('HSET', key, 'last_seen_at', now)
  local fo = redis.call('HGET', key, 'first_opened_at')
  if (not fo) or fo == '' then redis.call('HSET', key, 'first_opened_at', now) end
  return 'responded'
end
return 'BADEVENT'
`;

// applyEvent — the runtime write. Validates up-front, then fires the atomic Lua guard.
export async function applyEvent(campaign, token, eventType, answer) {
  if (eventType !== 'OPENED' && eventType !== 'RESPONDED') throw new Error('invalid-event');
  if (eventType === 'RESPONDED' && answer !== 'yes' && answer !== 'maybe' && answer !== 'no') throw new Error('invalid-answer');
  const redis = getRedis();
  if (!redis) throw new Error('store-not-provisioned');
  const key = `rsvp:${campaign}:${token}`;
  const now = new Date().toISOString();
  const result = await redis.eval(TRANSITION_LUA, [key], [eventType, answer || '', now]);
  if (result === 'NOTOKEN') throw new Error('invalid-token');
  if (result === 'BADEVENT') throw new Error('invalid-event');
  return { ok: true, status: result };
}
