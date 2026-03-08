/**
 * kingdom-layout.ts
 *
 * Single source of truth for Kingdom territory positions, colors, labels, connections.
 * All components import from here. Never define territory data twice.
 *
 * COORDINATE SYSTEM
 * Territory position[1] (Y) is "clearance above terrain surface" — NOT world Y.
 * Use getTerrainY(x, z) + position[1] to get the world Y for any territory.
 * This keeps buildings planted on the ground regardless of terrain topology.
 *
 * Clearances are set to each shape's half-height so the base sits at terrain level:
 *   claude_house  box 1.2³     → clearance 0.60
 *   the_throne    box 1.5³     → clearance 0.75
 *   the_forge     box 0.7³     → clearance 0.35
 *   the_scryer    cone H=2.0   → clearance 1.00
 *   the_tower     cyl H=1.4    → clearance 0.70
 *   core_lore     cone H=0.85  → clearance 0.43
 */

export interface TerritoryLayout {
  id: string
  label: string
  position: [number, number, number]  // [x, clearance_above_terrain, z]
  color: string
  droneColor: string  // complement tint for swarm drones — lighter/shifted from territory color
  connections: string[]
}

// ---------------------------------------------------------------------------
// TERRAIN HEIGHT — matches KingdomGround displacement formula exactly.
// Amplitudes scaled to ×0.4 of the plane geometry coefficients so the
// function returns rolling hills (max ±~1.0) not mountains (max ±~2.5).
// Call getTerrainY(x, z) + territory.position[1] to get true world Y.
// ---------------------------------------------------------------------------

export function getTerrainY(x: number, z: number): number {
  return (
    Math.sin(x * 0.42 + 0.8) * 0.28 +
    Math.sin(z * 0.38 - 0.6) * 0.24 +
    Math.cos((x + z) * 0.28) * 0.20 +
    Math.sin(x * 0.85 - 0.3) * 0.12 +
    Math.cos(z * 0.70 + x * 0.25) * 0.14
  )
}

/** Compute the world Y for a territory (terrain surface + shape clearance). */
export function getWorldY(territory: TerritoryLayout): number {
  return getTerrainY(territory.position[0], territory.position[2]) + territory.position[1]
}

export const TERRITORIES: TerritoryLayout[] = [
  {
    id: 'claude_house',
    label: "CLAUDE'S HOUSE",
    position: [-5, 0.60, -0.5],  // clearance = box half-height (1.2/2)
    color: '#7000ff',
    droneColor: '#b566ff',        // lavender — lighter purple
    connections: ['the_scryer', 'core_lore', 'the_tower'],
  },
  {
    id: 'the_forge',
    label: 'THE FORGE',
    position: [1, 0.35, 3.0],    // clearance = box half-height (0.7/2)
    color: '#f0a500',
    droneColor: '#ffd166',        // champagne — lighter gold
    connections: ['the_scryer', 'the_throne', 'claude_house'],
  },
  {
    id: 'the_throne',
    label: 'THE THRONE',
    position: [5, 0.75, -0.5],   // clearance = box half-height (1.5/2)
    color: '#ff006e',
    droneColor: '#ff66b3',        // rose — lighter pink
    connections: ['the_forge', 'the_tower'],
  },
  {
    id: 'the_scryer',
    label: 'THE SCRYER',
    position: [0, 1.00, -4],     // clearance = cone half-height (2.0/2) — tip up, base down
    color: '#00f3ff',
    droneColor: '#66f9ff',        // ice — lighter cyan
    connections: ['claude_house', 'the_forge', 'the_tower', 'core_lore'],
  },
  {
    id: 'the_tower',
    label: 'THE TOWER',
    position: [4, 0.70, 2.5],    // clearance = cylinder half-height (1.4/2)
    color: '#9b30ff',
    droneColor: '#cc88ff',        // lilac — lighter violet
    connections: ['the_throne', 'the_scryer'],
  },
  {
    id: 'core_lore',
    label: 'CORE LORE',
    position: [-3.5, 0.43, -4],  // clearance = cone half-height (0.85/2)
    color: '#e8e0d0',
    droneColor: '#fff0e0',        // pearl — lighter cream
    connections: ['claude_house', 'the_scryer'],
  },
]

export const TERRITORY_MAP = Object.fromEntries(TERRITORIES.map((t) => [t.id, t]))

// Unique undirected edges — each pair appears once (a < b lexicographically)
export const EDGES: [string, string][] = []
TERRITORIES.forEach((t) => {
  t.connections.forEach((cId) => {
    if (t.id < cId) EDGES.push([t.id, cId])
  })
})

// Beams that flow toward THE_SCRYER (for TimeStream) — one per territory
export const SCRYER_BEAMS: [string, string][] = [
  ['claude_house', 'the_scryer'],
  ['the_forge',    'the_scryer'],
  ['the_throne',   'the_scryer'],
  ['the_tower',    'the_scryer'],
  ['core_lore',    'the_scryer'],
]
