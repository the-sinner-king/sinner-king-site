/**
 * /api/visitor-geo
 *
 * Returns geo info for the requesting visitor using Vercel's injected headers.
 * Called by the client-side beacon before connecting to the visitor PartyKit room.
 *
 * GET /api/visitor-geo
 *   Returns: { country: "US", city: "Austin" }
 *
 * Headers used (injected by Vercel edge, empty in local dev):
 *   x-vercel-ip-country  — ISO 3166-1 alpha-2 country code
 *   x-vercel-ip-city     — City name (URL-encoded)
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export function GET(req: NextRequest) {
  const country = req.headers.get('x-vercel-ip-country') ?? '??'
  const cityRaw = req.headers.get('x-vercel-ip-city') ?? 'Unknown'

  // Vercel URL-encodes the city name
  let city = 'Unknown'
  try { city = decodeURIComponent(cityRaw) } catch { city = cityRaw }

  return NextResponse.json({ country, city }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
