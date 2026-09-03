/**
 * POST /api/hearts — THE HOME-SERVER SAVE for the Dragon Con family deck (/s/tap-the-hearts).
 *
 * WHY (2026-09-03, the King): "I don't know WHY they can't just save and we save it to our home
 * server." The deck was built offline-pure, so every heart lived only on the phone that tapped it
 * and a 14-year-old had to fight a share sheet to get nine hearts to her dad. This route ends that:
 * the deck POSTs its share-code after every heart; the metal pulls it (build/decode_hearts.py --pull).
 *
 * WHAT IS STORED: the same checksummed share code the "Send my list to Dad" button makes —
 * `<bake-token>~<initial>~<base36 deltas>~<check>` — nothing else. No names beyond a first initial,
 * no free text, no ids. Key = dc:hearts:<bake-token>, latest-per-person, plus an append log.
 *
 * GU-lite 2026-09-03 (THE HOME-SERVER SAVE) hardening:
 *  - the CHECK DIGITS are verified here, not just the grammar — a grammar-valid junk post used to
 *    silently replace a real list (latest-wins). Now it is refused with 400 like any mangled link.
 *  - the bake token is PINNED to the live deck(s) — any 6 hex used to mint an unbounded keyspace.
 *    ⚠ A DATA re-bake changes the token (meta.v = sha1 of the ev payload): add the new token here.
 *  - TTL 30 days on both keys, the log is trimmed to the last 500 writes, hset+rpush go in one
 *    pipeline inside try/catch → 503 (a Redis blip is never a 500 and never a half-write).
 * No auth by design: worst case is a checksum-valid list for one of four initials; the King eyeballs
 * counts/titles (with ts + device) before anything becomes a plan, and the log keeps every prior write.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from '@/lib/rsvp.mjs';

export const runtime = 'nodejs';

const CODE = /^([0-9a-f]{6})~([eskb])~([0-9a-z.]*)~([0-9a-z]{1,2})$/;
const WHO: Record<string, string> = { e: 'ever', s: 'storie', k: 'kim', b: 'brandon' };
const LIVE_TOKENS = new Set(['77354f']);   // meta.v of every deck currently in family hands
const TTL_S = 30 * 24 * 3600;
const LOG_KEEP = 500;

/** Mirror of the deck's ck2(): rolling hash mod 1296 over "<initial>~<deltas>", two base36 digits. */
function ck2(body: string): string {
  let h = 7;
  for (let i = 0; i < body.length; i++) h = (h * 31 + body.charCodeAt(i)) % 1296;
  return h.toString(36).padStart(2, '0');
}
/** Legacy v5 check: sum of decoded indices mod 36, one base36 digit. */
function ck1(deltas: string): string | null {
  let r = 0, sum = 0;
  for (const part of deltas ? deltas.split('.') : []) {
    const n = parseInt(part, 36);
    if (Number.isNaN(n)) return null;
    r += n;
    sum += r;
  }
  return (sum % 36).toString(36);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const b = (body ?? {}) as { code?: unknown; n?: unknown };
  const code = typeof b.code === 'string' ? b.code.trim().toLowerCase() : '';
  const m = code.length <= 400 ? CODE.exec(code) : null;
  if (!m) return NextResponse.json({ error: 'bad code' }, { status: 400 });
  const [, token, initial, deltas, check] = m;
  if (!LIVE_TOKENS.has(token)) return NextResponse.json({ error: 'unknown deck' }, { status: 400 });
  const ok = check.length === 2 ? ck2(`${initial}~${deltas}`) === check : ck1(deltas) === check;
  if (!ok) return NextResponse.json({ error: 'bad check' }, { status: 400 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: 'no store' }, { status: 503 });

  const who = WHO[initial];
  const rec = {
    code,
    n: Math.max(0, Math.min(200, Number(b.n) || 0)),   // advisory only — the puller counts the deltas
    ts: Date.now(),
    ua: (req.headers.get('user-agent') ?? '').slice(0, 120),
  };
  const key = `dc:hearts:${token}`;
  try {
    const p = redis.pipeline();
    p.hset(key, { [who]: JSON.stringify(rec) });
    p.expire(key, TTL_S);
    p.rpush(`${key}:log`, JSON.stringify({ who, ...rec }));
    p.ltrim(`${key}:log`, -LOG_KEEP, -1);
    p.expire(`${key}:log`, TTL_S);
    await p.exec();
  } catch {
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, who, n: rec.n });
}
