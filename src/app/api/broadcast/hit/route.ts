// src/app/api/broadcast/hit/route.ts — THE BROADCAST TOWER · public-link OPEN COUNTER (RSVP-free)
// For a SINGLE shareable link (e.g. /kylokikko) everyone passes around — counts opens WITHOUT the
// per-recipient RSVP token system. That system is FROZEN and untouched: this uses a DISTINCT Redis
// namespace `hit:<tag>:*` (never `campaign:*`/`rsvp:*`), no tokens, no campaign.
//   POST {tag}          → increment opens + record a rough-unique opener (salted-IP hash; raw IP never stored)
//   GET  ?tag=&auth=…    → { opens, unique }  (token-gated like the RSVP signal feed, so the count isn't public)
// Doctrine (KINGDOM_MOBILE_DOCTRINE): M1 honest transport (400/503/502 distinct), bot-filtered writes,
// cookieless salted-hash IP (no raw PII), force-dynamic + Node runtime (Upstash + crypto).
import { getRedis } from '@/lib/rsvp.mjs';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TAG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
// link-preview / scanner crawlers must NEVER inflate the count (they fetch the page to build the unfurl card).
const BOT_UA = /bot|crawl|spider|slack|discord|whatsapp|telegram|facebookexternalhit|applebot|bingpreview|twitterbot|preview|scanner|safelinks|python-requests|curl|headless/i;
const kOpens = (t: string) => `hit:${t}:opens`;   // total opens (a counter — can be nudged; the honest number is unique)
const kUniq = (t: string) => `hit:${t}:openers`;  // set of salted-IP hashes → rough UNIQUE opens, refresh-proof
const json = (b: unknown, s: number) => Response.json(b, { status: s, headers: { 'cache-control': 'no-store' } });

// hash the client IP with a server-only salt → cookieless proof-of-presence, raw IP never persisted.
function hashIp(req: Request): string {
  const salt = process.env.KINGDOM_PUSH_SECRET || process.env.SIGNAL_READ_TOKEN || 'kingdom-fallback-salt';
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  return createHmac('sha256', salt).update(ip).digest('hex').slice(0, 24);
}
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function POST(req: Request) {
  const ua = req.headers.get('user-agent') || '';
  if (BOT_UA.test(ua)) return json({ ok: false, skipped: 'bot' }, 202); // acknowledged, no count
  let body: { tag?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const tag = body?.tag || '';
  if (!TAG_RE.test(tag)) return json({ error: 'invalid tag' }, 400);
  const redis = getRedis();
  if (!redis) return json({ error: 'store not provisioned' }, 503);
  try {
    const opens = await redis.incr(kOpens(tag));
    await redis.sadd(kUniq(tag), hashIp(req)); // same person refreshing won't inflate the unique number
    return json({ ok: true, opens }, 200);
  } catch (err) {
    console.error('[broadcast-hit] write failed tag=%s:', tag, err);
    return json({ error: 'upstream error' }, 502);
  }
}

export async function GET(req: Request) {
  const secret = process.env.SIGNAL_READ_TOKEN;
  if (!secret) return json({ error: 'read token not configured' }, 503); // M1: unconfigured ≠ unauthorized
  const url = new URL(req.url);
  const provided = req.headers.get('x-signal-token') || url.searchParams.get('auth') || '';
  if (!safeEqual(provided, secret)) return json({ error: 'unauthorized' }, 401);
  const tag = url.searchParams.get('tag') || '';
  if (!TAG_RE.test(tag)) return json({ error: 'invalid tag' }, 400);
  const redis = getRedis();
  if (!redis) return json({ error: 'store not provisioned' }, 503);
  try {
    const [opens, unique] = await Promise.all([redis.get(kOpens(tag)), redis.scard(kUniq(tag))]);
    return json({ tag, opens: Number(opens) || 0, unique: Number(unique) || 0 }, 200);
  } catch (err) {
    console.error('[broadcast-hit] read failed tag=%s:', tag, err);
    return json({ error: 'upstream error' }, 502);
  }
}
