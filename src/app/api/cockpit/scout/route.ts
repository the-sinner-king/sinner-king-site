/**
 * /api/cockpit/scout
 *
 * Returns the latest SCOUT.MINUTE snapshot.
 * Reads SCOUT_MINUTE.json from THE_SCRYER sensor output.
 *
 * GET /api/cockpit/scout
 *   Returns: { ok: true, spark, chronicle, timestamp, model, context_chars }
 *   or:      { ok: false, error }
 */

import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import os from 'os'
import path from 'path'

const SCOUT_FILE = path.join(
  os.homedir(),
  'Desktop/THE_SCRYER/ENGINE_ROOM/SCOUT/data/SCOUT_MINUTE.json'
)

interface ScoutMinute {
  timestamp:     string
  spark:         string
  chronicle:     string
  raw:           string
  model:         string
  context_chars: number
}

export async function GET() {
  try {
    const raw  = await readFile(SCOUT_FILE, 'utf-8')
    const data = JSON.parse(raw) as ScoutMinute
    return NextResponse.json({ ok: true, ...data }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'SCOUT_MINUTE.json not found or unreadable' }, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
