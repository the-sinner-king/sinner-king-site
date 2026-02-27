'use client'

/**
 * KingdomMap.tsx
 *
 * The living nervous system visualization.
 *
 * This is the centerpiece of THE_TOWER homepage — a real-time visualization
 * of the Kingdom's activity. Territories are nodes. Signals flow between them
 * as animated edges. Data comes from SCRYER_FEEDS via /api/kingdom-state.
 *
 * Three rendering modes (based on screen size and performance):
 *
 *   FULL (desktop, canvas available):
 *     Three.js scene. Nodes are floating islands with soft glow.
 *     Edges are particle streams — cyan dots flowing along splines.
 *     Activity level controls particle density and node glow intensity.
 *     Camera slowly orbits. Click a territory to zoom and navigate to it.
 *
 *   MEDIUM (tablet or reduced motion):
 *     SVG-based. Same topology, simpler rendering.
 *     Nodes are circles with pulse animations.
 *     Edges are SVG paths with animated stroke-dashoffset.
 *
 *   MINIMAL (mobile or prefers-reduced-motion):
 *     Static SVG. No animation. Just the topology with labels.
 *
 * The component polls /api/kingdom-state every 5 seconds for updates.
 * Territory activity level updates are interpolated smoothly.
 *
 * Current status: SCAFFOLD
 *   - Layout and node positions defined
 *   - Polling loop wired
 *   - Three.js integration pending (see [GHOST] comments below)
 *   - SVG medium mode is the current rendered output
 *
 * [GHOST: Three.js FULL mode not yet implemented.
 *   - Import Canvas from @react-three/fiber
 *   - Create TerritoryNode component (r3f mesh with emissive material)
 *   - Create SignalEdge component (r3f line with particle system)
 *   - Wire KingdomState to node activity levels
 *   - Add camera animation with useFrame
 *   - Add click handlers for territory navigation]
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { KingdomState, TerritoryState, TerritoryId } from '@/lib/kingdom-state'

// --- Territory layout ---
// Positions are 0-1 normalized, within a virtual 1000x600 canvas.
// Based on the floating island concept art.

interface TerritoryNode {
  id: TerritoryId | string
  label: string
  x: number       // 0-1
  y: number       // 0-1
  primaryColor: string
  connections: Array<TerritoryId | string>
}

const TERRITORY_NODES: TerritoryNode[] = [
  {
    id: 'claude_house',
    label: "CLAUDE'S HOUSE",
    x: 0.3,
    y: 0.4,
    primaryColor: '#7000ff',
    connections: ['the_scryer', 'core_lore', 'the_tower'],
  },
  {
    id: 'the_forge',
    label: 'THE FORGE',
    x: 0.55,
    y: 0.55,
    primaryColor: '#f0a500',
    connections: ['the_scryer', 'the_throne', 'claude_house'],
  },
  {
    id: 'the_throne',
    label: 'THE THRONE',
    x: 0.7,
    y: 0.3,
    primaryColor: '#ff006e',
    connections: ['the_forge', 'the_tower'],
  },
  {
    id: 'the_scryer',
    label: 'THE SCRYER',
    x: 0.45,
    y: 0.2,
    primaryColor: '#00f3ff',
    connections: ['claude_house', 'the_forge', 'the_tower', 'core_lore'],
  },
  {
    id: 'the_tower',
    label: 'THE TOWER',
    x: 0.82,
    y: 0.55,
    primaryColor: '#9b30ff',
    connections: ['the_throne', 'the_scryer'],
  },
  {
    id: 'core_lore',
    label: 'CORE LORE',
    x: 0.18,
    y: 0.25,
    primaryColor: '#e8e0d0',
    connections: ['claude_house', 'the_scryer'],
  },
  {
    id: 'the_hole',
    label: 'THE HOLE',
    x: 0.15,
    y: 0.7,
    primaryColor: '#504840',
    connections: [],
  },
]

// --- Types ---

interface KingdomMapProps {
  initialState?: KingdomState | null
  className?: string
  height?: number
  onTerritoryClick?: (id: string) => void
  pollInterval?: number   // ms, default 5000
}

// --- Helpers ---

function getTerritoryActivity(
  id: string,
  state: KingdomState | null,
): number {
  if (!state) return 0
  const t = state.territories.find((t) => t.id === id)
  return t?.activity ?? 0
}

function getActivityColor(activity: number, baseColor: string): string {
  if (activity === 0) return '#2a2a3a'
  if (activity < 30) return baseColor + '60'  // 37.5% opacity
  if (activity < 60) return baseColor + 'aa'  // 67% opacity
  return baseColor
}

function getNodeRadius(activity: number): number {
  const base = 8
  const bonus = (activity / 100) * 6
  return base + bonus
}

// --- Component ---

export function KingdomMap({
  initialState = null,
  className = '',
  height = 400,
  onTerritoryClick,
  pollInterval = 5000,
}: KingdomMapProps) {
  const [state, setState] = useState<KingdomState | null>(initialState)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Poll for updates
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/kingdom-state', {
          cache: 'no-store',
          headers: { 'Accept': 'application/json' },
        })
        if (res.ok) {
          const data = await res.json()
          if (data.state) setState(data.state)
        }
      } catch {
        // Silently fail — SCRYER might be offline
      }
    }

    poll()
    const interval = setInterval(poll, pollInterval)
    return () => clearInterval(interval)
  }, [pollInterval])

  // Build SVG viewBox
  const VB_W = 1000
  const VB_H = 600

  // Convert normalized positions to SVG coordinates
  const toSVG = (n: TerritoryNode) => ({
    cx: n.x * VB_W,
    cy: n.y * VB_H,
  })

  // Find node by id
  const nodeMap = Object.fromEntries(TERRITORY_NODES.map((n) => [n.id, n]))

  return (
    <div
      className={`relative overflow-hidden rounded-kingdom-lg bg-kingdom-void-mid border border-kingdom-violet/20 ${className}`}
      style={{ height }}
    >
      {/* Status bar */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between font-mono text-xs text-kingdom-bone-ghost z-10">
        <div className="flex items-center gap-2">
          {state ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-kingdom-cyan animate-pulse_kingdom" />
              <span>NERVOUS SYSTEM LIVE</span>
            </>
          ) : (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-kingdom-bone-ghost" />
              <span>CONNECTING...</span>
            </>
          )}
        </div>
        {state && (
          <span className="text-kingdom-violet">
            {state.activeSignals} active
          </span>
        )}
      </div>

      {/* SVG Map */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
        style={{ display: 'block' }}
      >
        <defs>
          {/* Glow filters per territory color */}
          {TERRITORY_NODES.map((node) => (
            <filter key={`glow-${node.id}`} id={`glow-${node.id}`}>
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
          {/* Animated gradient for signal edges */}
          <linearGradient id="signal-flow-h" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7000ff" stopOpacity="0" />
            <stop offset="50%" stopColor="#00f3ff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#7000ff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Edges — connections between territories */}
        {TERRITORY_NODES.flatMap((node) =>
          node.connections
            .filter((connId) => {
              // Deduplicate edges — only render A→B, not also B→A
              const connNode = nodeMap[connId]
              if (!connNode) return false
              return node.id < connId
            })
            .map((connId) => {
              const conn = nodeMap[connId]
              if (!conn) return null
              const from = toSVG(node)
              const to = toSVG(conn)

              // Activity of the connection (average of both ends)
              const actA = getTerritoryActivity(node.id, state)
              const actB = getTerritoryActivity(conn.id, state)
              const activity = (actA + actB) / 2

              const opacity = activity > 0 ? 0.15 + (activity / 100) * 0.4 : 0.06

              return (
                <g key={`edge-${node.id}-${connId}`}>
                  {/* Base edge */}
                  <line
                    x1={from.cx}
                    y1={from.cy}
                    x2={to.cx}
                    y2={to.cy}
                    stroke="#7000ff"
                    strokeWidth={1}
                    strokeOpacity={opacity}
                  />
                  {/* Animated signal dot along the edge */}
                  {activity > 30 && (
                    <circle r="2" fill="#00f3ff" fillOpacity="0.8">
                      <animateMotion
                        dur={`${4 - (activity / 100) * 2}s`}
                        repeatCount="indefinite"
                        path={`M ${from.cx} ${from.cy} L ${to.cx} ${to.cy}`}
                      />
                      <animate
                        attributeName="fill-opacity"
                        values="0;0.9;0"
                        dur={`${4 - (activity / 100) * 2}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}
                </g>
              )
            })
        )}

        {/* Nodes — territories */}
        {TERRITORY_NODES.map((node) => {
          const { cx, cy } = toSVG(node)
          const activity = getTerritoryActivity(node.id, state)
          const radius = getNodeRadius(activity)
          const color = getActivityColor(activity, node.primaryColor)
          const isHovered = hoveredId === node.id

          return (
            <g
              key={node.id}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onTerritoryClick?.(node.id)}
            >
              {/* Outer glow ring — scales with activity */}
              {activity > 20 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius * 2.5}
                  fill="none"
                  stroke={node.primaryColor}
                  strokeWidth={1}
                  strokeOpacity={0.15 + (activity / 100) * 0.25}
                  filter={`url(#glow-${node.id})`}
                >
                  {activity > 60 && (
                    <animate
                      attributeName="r"
                      values={`${radius * 2.2};${radius * 3};${radius * 2.2}`}
                      dur="3s"
                      repeatCount="indefinite"
                    />
                  )}
                </circle>
              )}

              {/* Main node */}
              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? radius * 1.3 : radius}
                fill={color}
                fillOpacity={isHovered ? 0.9 : 0.7}
                filter={isHovered ? `url(#glow-${node.id})` : undefined}
                style={{ transition: 'r 0.2s ease, fill-opacity 0.2s ease' }}
              />

              {/* Center dot — always solid */}
              <circle
                cx={cx}
                cy={cy}
                r={2}
                fill={node.primaryColor}
                fillOpacity={0.9}
              />

              {/* Label */}
              <text
                x={cx}
                y={cy + radius + 16}
                textAnchor="middle"
                fill={isHovered ? node.primaryColor : '#504840'}
                fontSize={9}
                fontFamily="monospace"
                letterSpacing={1}
                style={{ transition: 'fill 0.2s ease' }}
              >
                {node.label}
              </text>

              {/* Activity value — shown on hover */}
              {isHovered && activity > 0 && (
                <text
                  x={cx + radius + 4}
                  y={cy + 3}
                  fill={node.primaryColor}
                  fontSize={8}
                  fontFamily="monospace"
                >
                  {activity}%
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 right-3 font-mono text-xs text-kingdom-bone-ghost flex items-center gap-3">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-kingdom-cyan" />
          <span>signal</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-kingdom-violet/50" />
          <span>territory</span>
        </div>
      </div>
    </div>
  )
}
