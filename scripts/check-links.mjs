#!/usr/bin/env node
// scripts/check-links.mjs — pre-post link verifier for a broadcast missive.
// Extracts every href/src URL from an HTML file and confirms each resolves (follows redirects),
// so no dead MAP / SPOTIFY / invite link ever goes out to the party.
//   node scripts/check-links.mjs scripts/missives/kylonikko.html
// Exit 0 = all links live · exit 1 = one or more failed (printed). Skips mailto:/tel:/#anchors.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/check-links.mjs <file.html>'); process.exit(2); }
const html = readFileSync(file, 'utf8');

// pull href="..." and src="..." (single or double quoted)
const urls = [...html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)]
  .map((m) => m[1].trim())
  .filter((u) => /^https?:\/\//i.test(u)); // only real external links; skip #, mailto:, tel:, relative
const unique = [...new Set(urls)];

if (!unique.length) { console.log('no external http(s) links found in', file); process.exit(0); }
console.log(`\n🔗 checking ${unique.length} link(s) in ${file}:\n`);

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
let failed = 0;
for (const url of unique) {
  let status = 0, note = '';
  try {
    // HEAD first (cheap); many hosts (Spotify) reject HEAD → fall back to GET.
    let r = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
    if (r.status === 405 || r.status === 403 || r.status === 501) {
      r = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
    }
    status = r.status;
  } catch (e) { note = e.name === 'TimeoutError' ? 'timeout' : (e.message || 'fetch failed'); }
  const ok = status >= 200 && status < 400;
  if (!ok) failed++;
  const label = url.includes('maps') || url.includes('goo.gl/maps') || url.includes('maps.app') ? ' [MAP]'
             : url.includes('spotify') ? ' [SPOTIFY]' : '';
  console.log(`  ${ok ? '✓' : '✗'} ${status || '—'}${label}  ${url}${note ? '  (' + note + ')' : ''}`);
}
console.log('');
if (failed) { console.error(`✗ ${failed} link(s) FAILED — do NOT post until fixed.\n`); process.exit(1); }
console.log('✓ all links live — safe to post.\n');
