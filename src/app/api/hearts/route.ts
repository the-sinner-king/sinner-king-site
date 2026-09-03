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
 * no free text, no ids. Key = dc:hearts:<bake-token> so a data re-bake starts a fresh ledger.
 * Latest write per person wins (the phone's OWNER is the only one that syncs — a received list never
 * overwrites the sender's own newer save).
 *
 * No auth on purpose: the payload is validated to a strict grammar, capped, and the worst an
 * attacker can do is post a bogus list for one of four initials — which the decoder shows with its
 * timestamp/UA and the King eyeballs before anything becomes a plan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from '@/lib/rsvp.mjs';

export const runtime = 'nodejs';

const CODE = /^([0-9a-f]{6})~([eskb])~([0-9a-z.]*)~([0-9a-z]{1,2})$/;
const WHO: Record<string, string> = { e: 'ever', s: 'storie', k: 'kim', b: 'brandon' };

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const b = (body ?? {}) as { code?: unknown; n?: unknown };
  const code = typeof b.code === 'string' ? b.code.trim().toLowerCase() : '';
  const m = code.length <= 400 ? CODE.exec(code) : null;
  if (!m) return NextResponse.json({ error: 'bad code' }, { status: 400 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: 'no store' }, { status: 503 });

  const who = WHO[m[2]];
  const rec = {
    code,
    n: Math.max(0, Math.min(200, Number(b.n) || 0)),
    ts: Date.now(),
    ua: (req.headers.get('user-agent') ?? '').slice(0, 120),
  };
  const key = `dc:hearts:${m[1]}`;
  await redis.hset(key, { [who]: JSON.stringify(rec) });
  await redis.rpush(`${key}:log`, JSON.stringify({ who, ...rec }));
  return NextResponse.json({ ok: true, who, n: rec.n });
}
