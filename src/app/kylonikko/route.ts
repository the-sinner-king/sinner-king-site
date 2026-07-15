// src/app/kylonikko/route.ts — THE BROADCAST TOWER · a clean ROOT vanity link for a public broadcast.
// Serves `sinner-king.com/kylonikko` (nicer to share than /s/kylonikko) from the private Blob store, using
// the SAME serve logic as /s/[tag] (resolveMissivePath = pointer-aware live-update + legacy fallback).
// DEDICATED route (not a root catch-all — that would shadow 404s); collision-checked free at root.
// 404s until the missive is published:  scripts/broadcast.mjs publish <file> --tag kylonikko
// Opens are counted by the RSVP-free beacon in the payload → POST /api/broadcast/hit {tag:"kylonikko"}.
import { get } from '@vercel/blob';
import { resolveMissivePath } from '@/lib/broadcast.mjs';

export const dynamic = 'force-dynamic'; // live-swap must be instant; never statically cached
export const runtime = 'nodejs';        // private-blob streaming needs Node

const TAG = 'kylonikko';
const NO_STORE = 'no-store, must-revalidate';

export async function GET() {
  const pathname = await resolveMissivePath(TAG);
  if (!pathname) return new Response('Not found', { status: 404, headers: { 'cache-control': NO_STORE } });
  // M1 — a MISSING blob is 404 (not published yet); an auth/origin failure THROWS → 502, never a lying 404.
  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(pathname, { access: 'private', useCache: false });
  } catch (err) {
    console.error('[kylonikko] blob read failed:', err);
    return new Response('Upstream error', { status: 502, headers: { 'cache-control': NO_STORE } });
  }
  if (!result || !result.stream) {
    return new Response('Not found yet — check back soon.', { status: 404, headers: { 'cache-control': NO_STORE } });
  }
  return new Response(result.stream, {
    headers: {
      'content-type': result.blob?.contentType || 'text/html; charset=utf-8',
      'cache-control': NO_STORE, // M3 — mutable content never freezes
      'x-broadcast-tower': 'kylonikko',
    },
  });
}
