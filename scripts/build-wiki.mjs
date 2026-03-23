/**
 * build-wiki.mjs
 * forge-polecat::wiki-sync::ST-B::S207
 *
 * Scans content/core-lore/**\/*.md, extracts frontmatter + git timestamps,
 * writes public/wiki-manifest.json per the INTERFACE_CONTRACT schema.
 *
 * Sends ntfy crybaby alert and exits 1 on any failure or zero pages.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ── Constants ────────────────────────────────────────────────────────────────

const SITE_ROOT = process.cwd();
const SUBMODULE_DIR = path.resolve(SITE_ROOT, 'content/core-lore');
const OUTPUT_PATH = path.resolve(SITE_ROOT, 'public/wiki-manifest.json');
const NTFY_TOPIC = 'claude-raven-px1ibjk6ohyluze4';

// ── CRYBABY alert ────────────────────────────────────────────────────────────

function fireNtfy(errorMsg) {
  const safe = errorMsg.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
  try {
    execSync(
      `curl -s -X POST "https://ntfy.sh/${NTFY_TOPIC}" ` +
      `-H "Title: WIKI BUILD FAILED" ` +
      `-H "Priority: high" ` +
      `-H "Tags: warning" ` +
      `-d "${safe}"`,
      { stdio: 'pipe' }
    );
  } catch (_) {
    // Never let ntfy failure cascade
  }
}

// ── Frontmatter parser ───────────────────────────────────────────────────────

/**
 * Parse YAML-style frontmatter from raw markdown.
 * Only recognises a frontmatter block that starts at byte 0 with '---\n'.
 * Returns { data: {}, content: rawMarkdown }.
 */
function parseFrontmatter(raw) {
  const data = {};

  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) {
    return { data, content: raw };
  }

  // Find the closing ---
  const rest = raw.slice(4); // skip opening ---\n
  const closingIdx = rest.search(/^---(\r?\n|$)/m);

  if (closingIdx === -1) {
    return { data, content: raw };
  }

  const fmBlock = rest.slice(0, closingIdx);
  const content = rest.slice(closingIdx).replace(/^---(\r?\n)?/, '');

  for (const line of fmBlock.split('\n')) {
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)/);
    if (!match) continue;

    const [, key, val] = match;
    const trimmed = val.trim();

    if (key === 'tags') {
      // Inline array: [a, b, c] or bare comma-sep
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        data.tags = trimmed
          .slice(1, -1)
          .split(',')
          .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
      } else if (trimmed) {
        data.tags = trimmed
          .split(',')
          .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
      } else {
        data.tags = [];
      }
    } else {
      // Strip surrounding quotes if present
      data[key] = trimmed.replace(/^['"]|['"]$/g, '');
    }
  }

  return { data, content };
}

// ── File walker ──────────────────────────────────────────────────────────────

/**
 * Recursively collect all .md files under dirPath.
 * Works on Node 18+ (no fs.glob needed).
 */
function walkMd(dirPath) {
  const results = [];

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMd(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results;
}

// ── Git timestamp ────────────────────────────────────────────────────────────

function getGitTimestamp(absolutePath) {
  // relPath must be relative to the submodule root
  const relPath = path.relative(SUBMODULE_DIR, absolutePath);

  try {
    const result = execSync(
      `git log --format=%cI -1 -- "${relPath}"`,
      { cwd: SUBMODULE_DIR, stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString().trim();

    if (result) return result;
  } catch {
    // fall through to mtime
  }

  // Fallback: file mtime (unreliable in CI shallow clones — log so operators know)
  console.warn(`[build-wiki] WARN: git log failed for "${path.relative(SUBMODULE_DIR, absolutePath)}" — falling back to file mtime`);
  return fs.statSync(absolutePath).mtime.toISOString();
}

// ── Slug derivation ──────────────────────────────────────────────────────────

function deriveSlug(absolutePath) {
  return path
    .basename(absolutePath, '.md')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[build-wiki] Starting wiki manifest build…');
  console.log(`[build-wiki] Submodule: ${SUBMODULE_DIR}`);

  // Verify submodule is populated
  if (!fs.existsSync(SUBMODULE_DIR)) {
    throw new Error(`content/core-lore/ does not exist. Run: git submodule update --init`);
  }

  const mdFiles = walkMd(SUBMODULE_DIR);
  console.log(`[build-wiki] Found ${mdFiles.length} .md files`);

  const pages = [];

  for (const filePath of mdFiles) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data, content: _content } = parseFrontmatter(raw);

    const basename = path.basename(filePath, '.md');
    const slug = deriveSlug(filePath);

    // Title: frontmatter > filename (human-readable)
    const title = data.title || basename.replace(/[-_]/g, ' ');

    // Description: frontmatter > null
    const description = data.description || null;

    // Tags: frontmatter > []
    const tags = Array.isArray(data.tags) ? data.tags : [];

    // Git timestamp (real commit time, fallback to mtime)
    const updated_at = getGitTimestamp(filePath);

    pages.push({
      slug,
      title,
      description,
      tags,
      updated_at,
      content_md: raw,
    });
  }

  // Sort: most recently updated first
  pages.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const manifest = {
    generated_at: new Date().toISOString(),
    page_count: pages.length,
    pages,
  };

  if (manifest.page_count === 0) {
    const msg = 'build-wiki.mjs produced 0 pages — content/core-lore may be empty or unpopulated';
    fireNtfy(msg);
    console.error(`[build-wiki] ERROR: ${msg}`);
    process.exit(1);
  }

  // Ensure public/ exists
  const publicDir = path.resolve(SITE_ROOT, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[build-wiki] Written: ${OUTPUT_PATH}`);
  console.log(`[build-wiki] page_count: ${manifest.page_count}`);
  console.log(`[build-wiki] Most recent page: "${pages[0].title}" — ${pages[0].updated_at}`);
}

main().catch((err) => {
  const errorMsg = String(err.message || err);
  console.error('[build-wiki] FATAL:', errorMsg);
  fireNtfy(`build-wiki.mjs threw: ${errorMsg}`);
  process.exit(1);
});
