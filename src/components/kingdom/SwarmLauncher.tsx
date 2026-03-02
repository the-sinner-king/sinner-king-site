'use client'

/**
 * SwarmLauncher.tsx
 *
 * Test panel — fire drone swarms directly from the Kingdom Map UI.
 * Positioned bottom-left, symmetrical with ProductionQueueHUD (bottom-right).
 *
 * Five swarm types:
 *   SEARCH ONLINE  — off_screen from claude_house (purple)
 *   DEPLOY FORGE   — to_territory → the_forge (amber)
 *   THRONE SYNC    — to_territory → the_throne (hot pink)
 *   SCRYER SCAN    — to_territory → the_scryer (cyan)
 *   TOWER BUILD    — to_territory → the_tower (violet)
 *
 * Spec: KINGDOM_MAP/NORTH_STAR.md § SwarmLauncher
 */

import { useState } from 'react'
import { useKingdomStore } from '@/lib/kingdom-store'
import type { DroneSwarm } from '@/lib/kingdom-store'

// ---------------------------------------------------------------------------
// Static styles — defined once, outside component
// ---------------------------------------------------------------------------

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 24,
  left: 24,
  zIndex: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 200,
  fontFamily: 'monospace',
  pointerEvents: 'none',
  animation: 'swarm-launcher-fade-in 0.3s ease-out',
}

const headerStyle: React.CSSProperties = {
  paddingBottom: 3,
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  marginBottom: 2,
}

const headerLabelStyle: React.CSSProperties = {
  color: '#504840',
  fontSize: 8,
  letterSpacing: '0.18em',
}

// ---------------------------------------------------------------------------
// Button config
// ---------------------------------------------------------------------------

interface ButtonConfig {
  id: string
  label: string
  color: string
  swarm: Omit<DroneSwarm, 'id' | 'expiresAt' | 'active' | 'startedAt'>
}

const BUTTONS: ButtonConfig[] = [
  {
    id: 'search',
    label: '⬡ SEARCH ONLINE',
    color: '#7000ff',
    swarm: {
      label:             'SEARCH ONLINE',
      sourceTerritoryId: 'claude_house',
      targetTerritoryId: '',
      direction:         'off_screen',
    },
  },
  {
    id: 'forge',
    label: '⚡ DEPLOY FORGE',
    color: '#f0a500',
    swarm: {
      label:             'DEPLOY → FORGE',
      sourceTerritoryId: 'claude_house',
      targetTerritoryId: 'the_forge',
      direction:         'to_territory',
    },
  },
  {
    id: 'throne',
    label: '👁 THRONE SYNC',
    color: '#ff006e',
    swarm: {
      label:             'THRONE SYNC',
      sourceTerritoryId: 'claude_house',
      targetTerritoryId: 'the_throne',
      direction:         'to_territory',
    },
  },
  {
    id: 'scryer',
    label: '◈ SCRYER SCAN',
    color: '#00f3ff',
    swarm: {
      label:             'SCRYER SCAN',
      sourceTerritoryId: 'claude_house',
      targetTerritoryId: 'the_scryer',
      direction:         'to_territory',
    },
  },
  {
    id: 'tower',
    label: '🗼 TOWER BUILD',
    color: '#9b30ff',
    swarm: {
      label:             'TOWER BUILD',
      sourceTerritoryId: 'claude_house',
      targetTerritoryId: 'the_tower',
      direction:         'to_territory',
    },
  },
]

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function SwarmLauncher() {
  const pushDroneSwarm = useKingdomStore((s) => s.pushDroneSwarm)
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null)
  const [activeBtn, setActiveBtn]   = useState<string | null>(null)

  function handleFire(btn: ButtonConfig) {
    const now = Date.now()
    pushDroneSwarm({
      id:                `${btn.id}-${now}`,
      label:             btn.swarm.label,
      sourceTerritoryId: btn.swarm.sourceTerritoryId,
      targetTerritoryId: btn.swarm.targetTerritoryId,
      direction:         btn.swarm.direction,
      active:            true,
      startedAt:         now,
    })

    // Brief active state for press visual feedback
    setActiveBtn(btn.id)
    setTimeout(() => setActiveBtn(null), 120)
  }

  return (
    <div style={panelStyle}>
      <style>{`
        @keyframes swarm-launcher-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div style={headerStyle}>
        <span style={headerLabelStyle}>SWARM LAUNCHER</span>
      </div>

      {/* Buttons */}
      {BUTTONS.map((btn) => {
        const isHovered = hoveredBtn === btn.id
        const isActive  = activeBtn  === btn.id

        const btnStyle: React.CSSProperties = {
          background:     isHovered
            ? 'rgba(255,255,255,0.04)'
            : 'rgba(10, 10, 15, 0.88)',
          border:         `1px solid ${btn.color}33`,
          borderLeft:     `2px solid ${isHovered ? btn.color : btn.color + '88'}`,
          borderRadius:   2,
          padding:        '9px 14px 8px',
          backdropFilter: 'blur(6px)',
          cursor:         'pointer',
          pointerEvents:  'auto',
          color:          isHovered ? btn.color : `${btn.color}99`,
          fontSize:       9,
          letterSpacing:  '0.14em',
          textTransform:  'uppercase' as const,
          textAlign:      'left' as const,
          width:          '100%',
          minWidth:       200,
          transform:      isActive  ? 'scale(0.97)' : 'scale(1.0)',
          transition:     'transform 0.08s ease, background 0.12s ease, color 0.12s ease',
          boxShadow:      isHovered
            ? `inset 0 0 0 1px ${btn.color}22, 0 0 8px ${btn.color}11`
            : 'none',
          outline:        'none',
        }

        return (
          <button
            key={btn.id}
            style={btnStyle}
            onMouseEnter={() => setHoveredBtn(btn.id)}
            onMouseLeave={() => { setHoveredBtn(null); setActiveBtn(null) }}
            onMouseDown={() => setActiveBtn(btn.id)}
            onMouseUp={() => setActiveBtn(null)}
            onClick={() => handleFire(btn)}
          >
            {btn.label}
          </button>
        )
      })}
    </div>
  )
}
