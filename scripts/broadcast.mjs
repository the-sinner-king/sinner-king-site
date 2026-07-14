#!/usr/bin/env node
// scripts/broadcast.mjs — THE BROADCAST TOWER · Phase 2 · the CLI wrapper.
// Run from THE_SITE with the blob token loaded:
//   node --env-file=.env.local scripts/broadcast.mjs publish <file.html> --tag <t> [--to "who"] [--intent "why"] [--title "t"]
//   node --env-file=.env.local scripts/broadcast.mjs list
//   node --env-file=.env.local scripts/broadcast.mjs retire --tag <t>
import { readFileSync } from 'node:fs';
import { publishMissive, listMissives, retireMissive } from '../src/lib/broadcast.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const KNOWN = new Set(['tag', 'to', 'intent', 'title']);
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
  } else if (cmd === 'retire') {
    const tag = flag('tag');
    if (!tag) die('retire --tag <tag>');
    const existed = await retireMissive(tag);
    console.log(existed ? `☠ retired /s/${tag}` : `(nothing at /s/${tag})`);
  } else {
    die('commands: publish <file> --tag <t> | list | retire --tag <t>');
  }
} catch (e) {
  die(e.message, 1);
}
