// src/app/api/broadcast/rsvp/signal/route.ts — THE RSVP SIGNAL · Hop 2 · "The Read Feed"
// The RAW, PIPEABLE SIGNAL: a versioned per-recipient status envelope any Kingdom surface can pull
// (the mini HUD, THE_NEON_NET guest list, The Mast) — decoupled, no consumer knows about another.
// Transport = short-poll (DR §6: SSE dies on Vercel's serverless duration cap; a 3–5s GET is real-time-enough).
// Doctrine (KINGDOM_MOBILE_DOCTRINE): M1 honest transport (503 ≠ 401 ≠ 502), M3 force-dynamic (no stale JSON).
import { readSignal } from '@/lib/rsvp.mjs';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic'; // DR gotcha: App Router would else serve a stale cached payload for hours
export const runtime = 'nodejs';

// GU2 F4: constant-time compare so the read-token can't be probed by response timing.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// CORS: open origin so a decoupled app can consume the feed — but the READ is token-gated (below),
// so an open ACAO does NOT leak the guest list; only a holder of SIGNAL_READ_TOKEN can pull it.
const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type, x-signal-token',
};
const CAMPAIGN_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/; // GU2 U1: case-strict — the campaign is a raw Redis namespace, so `Storie_18` must NOT alias `storie_18`
const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...CORS, 'cache-control': 'no-store', ...extra } });

// preflight for the x-signal-token header path
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const secret = process.env.SIGNAL_READ_TOKEN;
  // M1 — don't lie: an UNCONFIGURED server is a 503, not a 401 (which would imply "wrong token").
  if (!secret) return json({ error: 'signal read token not configured' }, 503);

  const url = new URL(req.url);
  // token via the x-signal-token HEADER (preferred, app-to-app). The ?auth= query is a TESTING-ONLY fallback —
  // it leaks the secret into access logs / history / Referer, so real consumers must use the header. (GU2 F4)
  const provided = req.headers.get('x-signal-token') || url.searchParams.get('auth') || '';
  if (!safeEqual(provided, secret)) return json({ error: 'unauthorized consumer' }, 401);

  const campaign = url.searchParams.get('campaign');
  if (!campaign || !CAMPAIGN_RE.test(campaign)) return json({ error: 'missing or invalid campaign' }, 400);

  try {
    const signal = await readSignal(campaign);
    return json(signal, 200);
  } catch (err) {
    // M1 — an un-provisioned store is a 503, an upstream failure is a 502; neither masquerades as an empty 200.
    if (err instanceof Error && err.message === 'store-not-provisioned') {
      return json({ error: 'store not provisioned (Upstash not wired yet)' }, 503);
    }
    console.error('[rsvp-signal] read failed for campaign=%s:', campaign, err);
    return json({ error: 'upstream error' }, 502);
  }
}
