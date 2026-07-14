#!/usr/bin/env node
// scripts/broadcast.livetest.mjs — LIVE end-to-end test of the update layer against REAL Upstash + Blob.
//   node --env-file=.env.local scripts/broadcast.livetest.mjs
// Self-skips if the store isn't provisioned. Uses a throwaway tag and cleans up after (never touches
// kim_appts / storie_18). Exits 1 on any failure. Needs the dev server on :3033 for the serve checks.
import { updateMissive, rollbackMissive, missiveHistory, resolveMissivePath, retireMissive } from '../src/lib/broadcast.mjs';
import { getRedis } from '../src/lib/rsvp.mjs';
import { del } from '@vercel/blob';

const TAG = 'zz_luptest';
const BASE = 'http://localhost:3033';
let pass = 0, fail = 0;
const A = (n, c) => { if (c) pass++; else { fail++; console.log(`  ✗ FAIL ${n}`); } };
const html = (v) => `<!doctype html><html><body><h1>MISSIVE ${TAG} v${v}</h1></body></html>`;

if (!getRedis()) { console.log('⚠ store not provisioned — skipping live test (provision Upstash to run)'); process.exit(0); }

const redis = getRedis();
async function cleanup() {
  // remove pointer/seq/history/idem + all versioned blobs + meta
  const keys = ['current', 'seq', 'history'].map((k) => `missive:${TAG}:${k}`);
  await redis.del(...keys).catch(() => {});
  const scan = await redis.keys(`missive:${TAG}:idem:*`).catch(() => []);
  if (scan?.length) await redis.del(...scan).catch(() => {});
  for (let v = 1; v <= 6; v++) await del(`${TAG}_v${v}.html`).catch(() => {});
  await retireMissive(TAG).catch(() => {});
}
async function serve() { const r = await fetch(`${BASE}/s/${TAG}`, { cache: 'no-store' }); return r.ok ? r.text() : `HTTP ${r.status}`; }

try {
  await cleanup(); // fresh slate

  // 1) first update → v1
  const r1 = await updateMissive(TAG, html(1), { actor: 'TESTER' });
  A('v1 minted', r1.rev === 1 && r1.committed);
  A('resolve → versioned path', (await resolveMissivePath(TAG)) === `${TAG}_v1.html`);
  A('serves v1', (await serve()).includes('v1'));

  // 2) second update → v2, pointer flips, link unchanged
  const r2 = await updateMissive(TAG, html(2), { actor: 'HERALD' });
  A('v2 minted', r2.rev === 2);
  A('serves v2 now (instant swap)', (await serve()).includes('v2'));

  // 3) idempotency — same idemKey returns the first rev, no new version
  const i1 = await updateMissive(TAG, html(3), { actor: 'BOT', idemKey: 'req-abc' });
  const i2 = await updateMissive(TAG, html(3), { actor: 'BOT', idemKey: 'req-abc' });
  A('idempotent: same rev', i1.rev === i2.rev);
  A('idempotent: 2nd flagged', i2.idempotent === true);
  A('idempotent: no version churn', Number(await redis.get(`missive:${TAG}:current`)) === i1.rev);

  // 4) optimistic conflict — a stale-based write (expectedRev=1) is REFUSED when current has moved on
  let conflicted = false;
  try { await updateMissive(TAG, html(9), { actor: 'STALE', expectedRev: 1 }); }
  catch (e) { conflicted = e.message === 'conflict' && e.currentRev === i1.rev; }
  A('stale write rejected (conflict)', conflicted);
  A('conflict left pointer untouched', Number(await redis.get(`missive:${TAG}:current`)) === i1.rev);

  // 5) rollback to v1 → pointer moves back, old cargo serves again
  const rb = await rollbackMissive(TAG, { toRev: 1, actor: 'KING' });
  A('rolled back to v1', rb.rev === 1 && rb.from === i1.rev);
  A('serves v1 again after rollback', (await serve()).includes('v1'));

  // 6) rollback to a nonexistent rev is refused
  let badrb = false;
  try { await rollbackMissive(TAG, { toRev: 99, actor: 'KING' }); } catch { badrb = true; }
  A('rollback to bad rev refused', badrb);

  // 7) audit history records every step, newest first
  const h = await missiveHistory(TAG);
  A('history has entries', h.length >= 4);
  A('history newest = rollback', h[0].action === 'rollback' && h[0].actor === 'KING');
  A('history carries actors', h.some((e) => e.actor === 'HERALD') && h.some((e) => e.actor === 'TESTER'));
} catch (e) {
  console.log(`  ✗ THREW: ${e.stack || e.message}`); fail++;
} finally {
  await cleanup();
}

console.log(`\nlive-update test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
