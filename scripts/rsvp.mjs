#!/usr/bin/env node
// scripts/rsvp.mjs — THE RSVP SIGNAL · Hop 1 · CLI to issue per-guest links.
//   node --env-file=.env.local scripts/rsvp.mjs issue scripts/campaigns/storie_18.local.json
//   (auto DRY-RUN preview if Upstash isn't provisioned; add --dry to force a preview)
import { readFileSync } from 'node:fs';
import { issueLinks, getRedis } from '../src/lib/rsvp.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const file = argv.find((a, i) => i > 0 && !a.startsWith('--'));
const forceDry = argv.includes('--dry');
const die = (m, c = 2) => { console.error(`✗ ${m}`); process.exit(c); };

if (cmd !== 'issue' || !file) die('usage: node --env-file=.env.local scripts/rsvp.mjs issue <campaign.local.json> [--dry]');

let cfg;
try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { die(`can't read campaign file: ${e.message}`); }
if (!cfg.campaign || !cfg.base || !Array.isArray(cfg.guests)) die('campaign file needs { campaign, base, guests[] }');

const hasStore = !!getRedis();
const dryRun = forceDry || !hasStore;

const out = await issueLinks({ campaign: cfg.campaign, base: cfg.base, guests: cfg.guests, dryRun });

console.log(`\n🎟  RSVP issue-links · campaign="${out.campaign}" · ${out.count} guests · ` +
  (dryRun ? 'DRY-RUN (preview — not persisted)' : `PERSISTED (${out.minted} newly minted, ${out.count - out.minted} already had links)`));
if (dryRun && !hasStore) {
  console.log('   ⚠ Upstash not provisioned — these preview tokens are THROWAWAY. Provision Upstash (1 Marketplace click),');
  console.log('     add the env vars to .env.local, and re-run to mint stable, persisted links.\n');
}

// THE SEND-LIST — one row per guest: status · channel-glyph · name · contact · personal link.
const glyph = (ch) => ({ sms: '📱', instagram: '📸', email: '✉️ ' }[ch] || '•');
// display-shorten an instagram URL to @handle (the file keeps the full URL); other channels shown verbatim.
const short = (c, ch) => ch === 'instagram' ? '@' + String(c).replace(/\/+$/, '').split('/').pop() : String(c);
const pad = (s, n) => (s.length >= n ? s + '  ' : s.padEnd(n)); // never let a long cell touch the next column
console.log('   ' + 'STATUS'.padEnd(9) + '  ' + 'GUEST'.padEnd(14) + 'DELIVER TO'.padEnd(28) + 'LINK');
console.log('   ' + '─'.repeat(92));
for (const l of out.links) {
  const deliver = l.contact ? `${glyph(l.channel)} ${short(l.contact, l.channel)}` : '(no contact)';
  console.log(`   ${String(l.status).padEnd(9)}  ${pad(String(l.name), 14)}${pad(deliver, 28)}${l.url}`);
}
console.log('');
