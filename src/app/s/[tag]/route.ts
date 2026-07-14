// src/app/s/[tag]/route.ts — THE BROADCAST TOWER · Phase 1 · "The Pipe"
// Serves a hand-made HTML "missive" from the PRIVATE Vercel Blob store at /s/<tag>.
// Doctrine bindings (research/KINGDOM_MOBILE_DOCTRINE_DRAFT.md):
//   M1 — the transport must not lie: an origin/auth failure is NOT a 404 (see the 502 branch).
//   M3 — cache-bust: private blob + useCache:false + no-store, so an overwritten missive is never stale (THE MIRAGE).
//   M7 — Node runtime: private-blob streaming needs it; the stream is piped straight through (no buffering).
//   M8 — async params: `params` is a Promise, awaited before use.
//   + tag-safety: slug-only, no dots/slashes → no traversal into the store (8 encoded payloads verified → 404).
import { get } from '@vercel/blob';

export const dynamic = 'force-dynamic'; // never statically cached — live-swap must be instant
export const runtime = 'nodejs';        // private blob get() streaming needs Node, not Edge

// a missive tag: url-safe slug, 1–64 chars, must start alphanumeric. No '.'/'/' → can't escape the store.
const TAG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const NO_STORE = 'no-store, must-revalidate';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tag: string }> },
) {
  const { tag } = await params;
  if (!TAG_RE.test(tag)) {
    return new Response('Not found', { status: 404, headers: { 'cache-control': NO_STORE } });
  }

  // Private delivery: the SDK authenticates via BLOB_READ_WRITE_TOKEN (or OIDC).
  // GU-lite FLAG-1 fix: a MISSING blob returns null (→ 404); an auth/origin failure THROWS.
  // We must NOT let the throw masquerade as "not found" — that blinds us to a broken pipe (the MIRAGE).
  let result: Awaited<ReturnType<typeof get>>;
  try {
    result = await get(`${tag}.html`, { access: 'private', useCache: false });
  } catch (err) {
    console.error('[broadcast-tower] blob read failed for tag=%s:', tag, err);
    return new Response('Upstream error', { status: 502, headers: { 'cache-control': NO_STORE } });
  }
  if (!result || !result.stream) {
    return new Response('Missive not found', { status: 404, headers: { 'cache-control': NO_STORE } });
  }

  // Pipe the stream straight through — preserves backpressure, honours the reason Node runtime is required.
  return new Response(result.stream, {
    headers: {
      'content-type': result.blob?.contentType || 'text/html; charset=utf-8',
      'cache-control': NO_STORE, // M3 — mutable content never freezes
      'x-broadcast-tower': 'phase-1',
    },
  });
}
