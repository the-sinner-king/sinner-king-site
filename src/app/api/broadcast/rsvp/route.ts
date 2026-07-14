// src/app/api/broadcast/rsvp/route.ts — THE RSVP SIGNAL · Hop 3 · "The Write-Back"
// POST { campaign, token, eventType: 'OPENED'|'RESPONDED', answer?: 'yes'|'maybe'|'no' }
// Fires from the in-missive widget (Hop 4): OPENED on load (beacon), RESPONDED on the guest's tap.
// The monotonic guard lives in the engine's atomic Lua (applyEvent) — an OPENED can never downgrade a RESPONDED.
// Doctrine: M1 honest transport (404/400/503/502 distinct, never a lying 200); bot-safe write (defense-in-depth).
import { applyEvent } from '@/lib/rsvp.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ⚠ GU2 F2 (party-breaking, read before Hop 4): this route REQUIRES `campaign` in the POST body.
// The DR's widget snippet posts only { token, eventType, answer } — copy it verbatim and EVERY RSVP 400s.
// Hop-4 widget MUST derive campaign from the /s/<tag> path (the tag IS the campaign) and include it.
const CAMPAIGN_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/; // GU2 U1: case-strict — raw Redis namespace, no case-alias
const TOKEN_RE = /^[A-Za-z0-9_-]{6,32}$/; // nanoid url-safe alphabet
// link-preview / scanner crawlers must NEVER mutate state (the real widget needs a human onclick anyway)
const BOT_UA = /bot|crawl|spider|slack|discord|whatsapp|telegram|facebookexternalhit|applebot|bingpreview|twitterbot|preview|scanner|safelinks|python-requests|curl|headless/i;
const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export async function POST(req: Request) {
  const ua = req.headers.get('user-agent') || '';
  if (BOT_UA.test(ua)) return json({ ok: false, skipped: 'bot' }, 202); // acknowledged, but no state change

  let body: { campaign?: string; token?: string; eventType?: string; answer?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { campaign, token, eventType, answer } = body || {};

  if (!campaign || !CAMPAIGN_RE.test(campaign)) return json({ error: 'missing or invalid campaign' }, 400);
  if (!token || !TOKEN_RE.test(token)) return json({ error: 'missing or invalid token' }, 400);
  if (eventType !== 'OPENED' && eventType !== 'RESPONDED') return json({ error: 'invalid eventType' }, 400);

  try {
    const r = await applyEvent(campaign, token, eventType, answer);
    return json({ ok: true, status: r.status }, 200);
  } catch (err) {
    const m = err instanceof Error ? err.message : '';
    if (m === 'invalid-token') return json({ error: 'invalid token' }, 404);
    if (m === 'invalid-answer') return json({ error: 'invalid answer' }, 400);
    if (m === 'store-not-provisioned') return json({ error: 'store not provisioned (Upstash not wired yet)' }, 503);
    console.error('[rsvp-write] failed campaign=%s event=%s:', campaign, eventType, err);
    return json({ error: 'upstream error' }, 502);
  }
}
