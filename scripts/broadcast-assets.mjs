#!/usr/bin/env node
// scripts/broadcast-assets.mjs — THE BROADCAST TOWER · missive ASSETS (the media a missive can't inline).
// A missive is capped at 500 KB, so its images/audio live in the same Vercel Blob store as the missive
// itself, PUBLIC, under a stable prefix — and the work table's MEDIA BASE points at that prefix.
//
//   node --env-file=.env.local scripts/broadcast-assets.mjs push <dir> --prefix <p> [--dry] [--force] [--skip <substr>]...
//   node --env-file=.env.local scripts/broadcast-assets.mjs list --prefix <p>
//   node --env-file=.env.local scripts/broadcast-assets.mjs verify <dir> --prefix <p>      # HEAD every file's public URL
//
// push walks <dir> and uploads every file as <prefix>/<path relative to dir>. Same pathname + same byte
// size already in the store = skipped (idempotent re-runs); --force overwrites. Names are canonical
// (addRandomSuffix:false) so the URL is knowable before upload — the point of a MEDIA BASE.
// Example (HUFF): push …/HUFF_MISSIVE/media --prefix huff/media  →  MEDIA BASE = https://<store>/huff
//
// ⚠ 2026-08-25: the Tower's blob store is PRIVATE ("Cannot use public access on a private store") — public
// puts are refused, so this tool is parked until the store (or a second one) allows public access. Until
// then missive media ships in THE_SITE's own public/ (HUFF: public/huff/media → MEDIA BASE https://sinner-king.com/huff),
// with a Cache-Control rule for /huff/:path* in next.config.js. Verified against @vercel/blob 2.6.1.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { put, list } from '@vercel/blob';

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i < 0 ? '' : (argv[i + 1] ?? ''); };
const has = (n) => argv.includes(`--${n}`);
const multi = (n) => argv.flatMap((a, i) => (a === `--${n}` && argv[i + 1] ? [argv[i + 1]] : []));
const die = (m, c = 2) => { console.error(`✗ ${m}`); process.exit(c); };

if (!process.env.BLOB_READ_WRITE_TOKEN) die('BLOB_READ_WRITE_TOKEN not set — run with:  node --env-file=.env.local scripts/broadcast-assets.mjs …');

const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.txt': 'text/plain', '.html': 'text/html' };
const WEEK = 60 * 60 * 24 * 7;   // CDN max-age: long enough to be free, short enough that a re-cut face lands within a week without a rename

function walk(root, skips) {
  const out = [];
  const rec = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); const st = statSync(p);
    if (st.isDirectory()) rec(p); else if (n !== '.DS_Store' && !skips.some((s) => p.includes(s))) out.push({ path: p, rel: relative(root, p).split('\\').join('/'), size: st.size }); } };
  rec(root); return out.sort((a, b) => a.rel.localeCompare(b.rel));
}
async function listAll(prefix) {
  const rows = []; let cursor;
  do { const page = await list({ prefix, cursor, limit: 1000 }); rows.push(...page.blobs); cursor = page.hasMore ? page.cursor : undefined; } while (cursor);
  return rows;
}
async function pool(items, n, fn) { const q = items.slice(); const run = async () => { while (q.length) await fn(q.shift()); }; await Promise.all(Array.from({ length: Math.min(n, items.length) }, run)); }

const prefix = flag('prefix').replace(/^\/+|\/+$/g, '');
if (!prefix) die('--prefix is required (e.g. --prefix huff/media)');

try {
  if (cmd === 'list') {
    const rows = await listAll(prefix + '/');
    if (!rows.length) { console.log(`(nothing under ${prefix}/)`); process.exit(0); }
    let total = 0; for (const b of rows) { total += b.size; console.log(`  ${String(b.size).padStart(9)}  ${b.pathname}`); }
    console.log(`\n${rows.length} blob(s) · ${(total / 1048576).toFixed(1)} MB · base = ${rows[0].url.slice(0, rows[0].url.indexOf('/' + prefix + '/'))}/${prefix}\n`);
  } else if (cmd === 'push' || cmd === 'verify') {
    const dir = argv[1] && !argv[1].startsWith('--') ? argv[1] : '';
    if (!dir) die(`usage: ${cmd} <dir> --prefix <p>`);
    const files = walk(dir, multi('skip'));
    const existing = new Map((await listAll(prefix + '/')).map((b) => [b.pathname, b]));
    if (cmd === 'verify') {
      let ok = 0, bad = [];
      await pool(files, 8, async (f) => { const b = existing.get(`${prefix}/${f.rel}`); if (!b) { bad.push(`${f.rel}: not in store`); return; }
        const r = await fetch(b.url, { method: 'HEAD' }); if (r.status !== 200) bad.push(`${f.rel}: HTTP ${r.status}`); else if (Number(r.headers.get('content-length')) !== f.size) bad.push(`${f.rel}: size ${r.headers.get('content-length')} ≠ ${f.size}`); else ok++; });
      console.log(`\n✓ ${ok}/${files.length} public + byte-exact`); if (bad.length) { console.log('✗ ' + bad.join('\n✗ ')); process.exit(1); } process.exit(0);
    }
    const dry = has('dry'), force = has('force');
    let up = 0, skip = 0, bytes = 0, base = '';
    const plan = files.filter((f) => { const b = existing.get(`${prefix}/${f.rel}`); if (b && b.size === f.size && !force) { skip++; base = base || b.url.slice(0, b.url.indexOf('/' + prefix + '/')); return false; } return true; });
    console.log(`\n🗼 ${cmd}${dry ? ' (DRY)' : ''} ${files.length} file(s) from ${dir} → ${prefix}/  ·  ${plan.length} to upload · ${skip} already there`);
    if (dry) { for (const f of plan) console.log(`  + ${String(f.size).padStart(9)}  ${prefix}/${f.rel}  (${TYPES[extname(f.rel).toLowerCase()] || 'application/octet-stream'})`); process.exit(0); }
    await pool(plan, 6, async (f) => {
      const ct = TYPES[extname(f.rel).toLowerCase()] || 'application/octet-stream';
      const r = await put(`${prefix}/${f.rel}`, readFileSync(f.path), { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: ct, cacheControlMaxAge: WEEK, multipart: f.size > 5 * 1048576 });
      up++; bytes += f.size; base = base || r.url.slice(0, r.url.indexOf('/' + prefix + '/'));
      console.log(`  ↑ ${String(f.size).padStart(9)}  ${r.pathname}`);
    });
    console.log(`\n✓ uploaded ${up} (${(bytes / 1048576).toFixed(1)} MB) · skipped ${skip}`);
    if (base) console.log(`   MEDIA BASE  →  ${base}/${prefix.split('/').slice(0, -1).join('/') || prefix}\n   (the work table rewrites media/… → BASE/media/…, so BASE is the prefix MINUS its last segment when that segment is "media")\n`);
  } else {
    die('commands: push <dir> --prefix <p> [--dry] [--force] [--skip <s>] | list --prefix <p> | verify <dir> --prefix <p>');
  }
} catch (e) { die(e?.message || String(e), 1); }
