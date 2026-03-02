/**
 * THE_TOWER — Homepage
 *
 * V1: Vertical Tunnel — 5-page Z-axis scroll experience.
 * HomepageScene owns all rendering: Canvas, ScrollControls, HTML layers.
 *
 * The old scaffold (pillar cards, signal stream) is preserved in
 * _SCRATCHPAD/homepage-scaffold-v0.tsx if ever needed.
 *
 * Wireframe: SINNER_KING_WEB_DESIGN/WIREFRAME.md
 * Session: 148
 */

import { HomepageScene } from '@/components/homepage/HomepageScene'

// Dynamic — no static caching, scene reads live SCRYER data in future
export const dynamic = 'force-dynamic'

export default function HomePage() {
  return <HomepageScene />
}
