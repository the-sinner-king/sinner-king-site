#!/usr/bin/env node
// scripts/broadcast.mjs — THE BROADCAST TOWER · Phase 2 + 2.5 · the CLI wrapper.
// Run from THE_SITE with the blob token loaded:
//   node --env-file=.env.local scripts/broadcast.mjs publish <file.html> --tag <t> [--to "who"] [--intent "why"] [--title "t"]
//   node --env-file=.env.local scripts/broadcast.mjs update  <file.html> --tag <t> --actor <who> [--expect <rev>] [--note "why"]
//   node --env-file=.env.local scripts/broadcast.mjs rollback --tag <t> [--to <rev>] --actor <who>
//   node --env-file=.env.local scripts/broadcast.mjs history  --tag <t>
//   node --env-file=.env.local scripts/broadcast.mjs list | retire --tag <t>
import { readFileSync } from 'node:fs';
import { publishMissive, listMissives, retireMissive, updateMissive, rollbackMissive, missiveHistory } from '../src/lib/broadcast.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const KNOWN = new Set(['tag', 'to', 'intent', 'title', 'actor', 'expect', 'note', 'to']);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return '';
  const v = argv[i + 1];
  if (v === undefined) return '';
  // GU-lite FLAG-5: accept any value (incl. one starting with '--...') UNLESS it's itself a known flag,
  // so `--title "--- BREAKING ---"` works but `--title --to` doesn't eat the next flag.
  if (v.startsWith('--') && KNOWN.has(v.slice(2))) return '';
  return v;
};
const die = (msg, code = 2) => { console.error(`✗ ${msg}`); process.exit(code); };

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  die('BLOB_READ_WRITE_TOKEN not set — run with:  node --env-file=.env.local scripts/broadcast.mjs …');
}

try {
  if (cmd === 'publish') {
    const file = argv[1] && !argv[1].startsWith('--') ? argv[1] : '';
    const tag = flag('tag');
    if (!file) die('usage: publish <file.html> --tag <tag> [--to "who"] [--intent "why"] [--title "t"]');
    if (!tag) die('--tag is required');
    const html = readFileSync(file, 'utf8');
    const { url, meta } = await publishMissive({ tag, html, to: flag('to'), intent: flag('intent'), title: flag('title') });
    console.log(`\n🗼 published  →  https://sinner-king.com${url}`);
    console.log(`   local test →  http://localhost:3033${url}`);
    console.log(`   to: ${meta.to || '—'}  ·  intent: ${meta.intent || '—'}  ·  ${meta.created === meta.updated ? 'new' : 'live-swapped'}\n`);
  } else if (cmd === 'list') {
    const rows = await listMissives();
    if (!rows.length) { console.log('(no missives yet)'); process.exit(0); }
    console.log(`\n🗼 ${rows.length} live missive(s):\n`);
    for (const m of rows) {
      console.log(`  /s/${m.tag.padEnd(20)} → ${(m.to || '—').padEnd(14)} ${m.intent || m.title || ''}`);
    }
    console.log('');
  } else if (cmd === 'update') {
    const file = argv[1] && !argv[1].startsWith('--') ? argv[1] : '';
    const tag = flag('tag');
    if (!file) die('usage: update <file.html> --tag <t> --actor <who> [--expect <rev>] [--note "why"]');
    if (!tag) die('--tag is required');
    const expect = flag('expect');
    const html = readFileSync(file, 'utf8');
    try {
      const r = await updateMissive(tag, html, {
        actor: flag('actor') || 'cli', note: flag('note'),
        expectedRev: expect ? Number(expect) : -1,
        to: flag('to') || undefined, intent: flag('intent') || undefined, title: flag('title') || undefined,
      });
      console.log(`\n🗼 updated  →  /s/${tag}  (now v${r.rev}, by ${r.actor})`);
      console.log(`   https://sinner-king.com/s/${tag}  ·  local: http://localhost:3033/s/${tag}\n`);
    } catch (e) {
      if (e.message === 'conflict') die(`conflict — someone else published v${e.currentRev} since you read. Re-pull and retry (or omit --expect to force).`);
      throw e;
    }
  } else if (cmd === 'rollback') {
    const tag = flag('tag');
    if (!tag) die('rollback --tag <t> [--to <rev>] --actor <who>');
    const to = flag('to');
    const r = await rollbackMissive(tag, { toRev: to ? Number(to) : undefined, actor: flag('actor') || 'cli' });
    console.log(`↩ rolled /s/${tag} back to v${r.rev} (was v${r.from}, by ${r.actor})`);
  } else if (cmd === 'history') {
    const tag = flag('tag');
    if (!tag) die('history --tag <t>');
    const rows = await missiveHistory(tag);
    if (!rows.length) { console.log(`(no update history for /s/${tag} — legacy or never updated)`); process.exit(0); }
    console.log(`\n🗼 /s/${tag} — update history (newest first):\n`);
    for (const h of rows) console.log(`  v${String(h.rev).padEnd(3)} ${(h.action || '').padEnd(8)} ${(h.actor || '—').padEnd(12)} ${h.ts || ''}  ${h.note || ''}`);
    console.log('');
  } else if (cmd === 'retire') {
    const tag = flag('tag');
    if (!tag) die('retire --tag <tag>');
    const existed = await retireMissive(tag);
    console.log(existed ? `☠ retired /s/${tag}` : `(nothing at /s/${tag})`);
  } else {
    die('commands: publish <file> --tag <t> | update <file> --tag <t> --actor <w> | rollback --tag <t> | history --tag <t> | list | retire --tag <t>');
  }
} catch (e) {
  die(e.message, 1);
}
