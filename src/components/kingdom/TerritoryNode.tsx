'use client'

/**
 * TerritoryNode.tsx — per-territory 3D building
 *
 * Extracted from KingdomScene3D.tsx (Loop 1, MAINTENANCE 2026-03-13).
 *
 * Owns:
 *   - BuildingState type + deriveBuildingState mapper
 *   - BUILDING_STATE_CONFIG (visual params per state)
 *   - TERRITORY_BASE_COLORS, ring constants, EMISSIVE_FLOOR, EMISSIVE_LERP_BASE
 *   - ShapeParams + SHAPE_PARAMS (per-territory geometry config)
 *   - AGENT_STATE_COLORS (re-export of STATE_COLORS from kingdom-agents for shared consumers)
 *   - TerritoryNode component
 *
 * Exports shared by TerritoryDetailFloat and KingdomHUD (DebugPanel):
 *   BuildingState, deriveBuildingState, BUILDING_STATE_CONFIG, AGENT_STATE_COLORS
 */

import { useRef, useMemo, useCallback, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useKingdomStore } from '@/lib/kingdom-store'
import type { AgentState } from '@/lib/kingdom-agents'
import { TERRITORY_TO_AGENT, STATE_COLORS, PULSE_MS } from '@/lib/kingdom-agents'
import { getWorldY } from '@/lib/kingdom-layout'
import type { TerritoryLayout } from '@/lib/kingdom-layout'
import { overmindBrightBoost } from './OvmindRing'

// ---------------------------------------------------------------------------
// BUILDING STATES
// ---------------------------------------------------------------------------
// Three states derived from live territory status. Each has distinct visuals.
// OFFLINE = dark, static. STABLE = steady glow, static. WORKING = dramatic pulse.

export type BuildingState = 'offline' | 'stable' | 'working'

// Maps 9-state agent model → 3-state building visual.
// 'online' = territory is alive but idle → stable glow.
// Any active state = running/writing/etc → hot pulsing.
// Territories without agents (core_lore, the_scryer) return 'online' from getAgentState().
export function deriveBuildingState(agentState: AgentState): BuildingState {
  if (agentState === 'offline') return 'offline'
  if (agentState === 'online') return 'stable'
  return 'working'  // thinking | reading | working | writing | running | searching | swarming
}

interface BuildingStateConfig {
  emissiveBase: number
  breatheAmplitude: number
  breatheFreq: number
  lightIntensityMul: number
  stateLabel: string
  stateLabelColor: string
}

// Per-territory flat-shaded base colors — module scope so they aren't re-allocated on every
// TerritoryNode render. Bright enough to read through the warm-white directional fill.
// Neon emissive stays territory.color (separate channel).
const TERRITORY_BASE_COLORS: Record<string, string> = {
  claude_house: '#BB88FF',  // bright lavender   → warm rose-pink under orange fill
  the_throne:   '#FF88CC',  // hot pink          → warm coral under orange fill
  the_forge:    '#FFD966',  // warm gold          → stays gold — loves orange light
  the_tower:    '#88AAFF',  // periwinkle         → soft lilac under orange fill
  the_scryer:   '#44EECC',  // cyan-teal          → warm teal-white under orange fill
  core_lore:    '#FFEECC',  // warm ivory         → bright cream — sacred/warm
}

// Ring constants — decoupled from agent state.
// Ring = "this territory exists" (always true). Emissive/label = current activity.
// All 6 territories show the same idle ring. Selected ring elevated to mark selection.
const RING_OPACITY_BASE  = 0.55
const RING_BREATHE_AMP   = 0.04
const RING_BREATHE_FREQ  = 0.6    // rad/s — gentle ~10s cycle, like a slow pulse

// 🏛️ ARCHAEOLOGICAL RECORD // EMISSIVE_FLOOR Color Physics
// 🗓️ 2026-03-06 | Session 166 | FIX-B
// ISSUE: The Forge appeared to glow while Claude's House and The Tower looked dark.
//        Hypothesis H2 confirmed: this is color physics, not data pipeline failure.
//        Three.js MeshStandardMaterial emissive at intensity 0.18 behaves differently
//        per hue: Gold (#f0a500) has high luminance (R=240, G=165, B=0) — visible even
//        at low intensity. Purple (#7000ff, #9b30ff) has low perceived luminance — below
//        ~0.30 intensity it disappears into the void scene's dark background.
//        Result: Forge (gold, activity=85) blazed. Tower (purple, activity=40) was
//        invisible. Created a false "Forge is special" effect.
// RESOLUTION: Raised EMISSIVE_FLOOR from 0.18 to 0.35. All territory emissives now
//             perceptible at idle regardless of hue.
// LAW: When adding a new territory color, verify it's visible at EMISSIVE_FLOOR in the
//      void scene (#03000A bg). Low-luminance hues (purple, navy, deep red) are at risk.
//
// REGRESSION GUARD: emissive floor — same philosophy as RING_OPACITY_BASE: territory existing ≠ darkness.
// Applied to stable/working states only. Offline (cfg.emissiveBase=0.015) is intentionally
// dark — that state conveys absence. Idle agents (state=online, activity=0) are present,
// so they hold a faint identity glow.
const EMISSIVE_FLOOR = 0.35

export const BUILDING_STATE_CONFIG: Record<BuildingState, BuildingStateConfig> = {
  offline: {
    emissiveBase:       0.015,
    breatheAmplitude:   0,
    breatheFreq:        0,
    lightIntensityMul:  0.02,
    stateLabel:         'OFFLINE',
    stateLabelColor:    '#201810',
  },
  stable: {
    // Visible resting glow — territory is present and alive at rest.
    // Raised from 0.13 → 0.45 so the scene reads as a living kingdom, not a void,
    // even when no agent activity data is available (e.g. production with no local API).
    emissiveBase:       0.45,
    breatheAmplitude:   0.06,
    breatheFreq:        0.6,
    lightIntensityMul:  0.50,
    stateLabel:         'STABLE',
    stateLabelColor:    '#706050',
  },
  working: {
    // 2.8 rad/s ≈ 0.45 Hz (~2.2s cycle) — tuned by eye. Painfully obvious working state.
    // Note: breatheFreq is in rad/s. Period = 2π / freq. 2.8 rad/s → ~2.24s cycle.
    // Emissive cranked high (1.4 base + 0.6 amp = 2.0 peak) — no mistaking active.
    emissiveBase:       1.4,
    breatheAmplitude:   0.6,
    breatheFreq:        2.8,
    lightIntensityMul:  2.0,
    stateLabel:         'WORKING',
    stateLabelColor:    '#00f3ff',
  },
}

// Frame-rate independent exponential approach lerp.
// Equivalent to *= 0.05 at exactly 60 fps but stable at any refresh rate.
// At delta=1/60: factor≈0.050. At delta=1/30: factor≈0.097. At delta=1/144: factor≈0.021.
// All converge to the same target in the same wall-clock time.
const EMISSIVE_LERP_BASE = 0.92  // per-(1/60 s) factor — 0.92 tracks fast 2.8 Hz pulse

// Agent state → neon color. Module-scope: shared by TerritoryNode badges + TerritoryDetailFloat.
// STATE_COLORS from kingdom-agents is the canonical source — no duplication.
export const AGENT_STATE_COLORS = STATE_COLORS

// ---------------------------------------------------------------------------
// SHAPE PARAMS — per-territory geometry configuration
// ---------------------------------------------------------------------------

interface ShapeParams {
  boxSize?: [number, number, number]
  ringRadius: number
  ringY: number
  labelHeight: number
}

const SHAPE_PARAMS: Record<string, ShapeParams> = {
  claude_house: { boxSize: [1.2, 1.2, 1.2], ringRadius: 1.15, ringY:  0.0,  labelHeight: 1.2 },
  the_throne:   { boxSize: [1.5, 1.5, 1.5], ringRadius: 1.42, ringY:  0.0,  labelHeight: 1.4 },
  the_forge:    {                             ringRadius: 1.35, ringY:  0.0,  labelHeight: 0.9 },
  core_lore:    {                             ringRadius: 0.65, ringY: -0.35, labelHeight: 0.85},
  the_scryer:   {                             ringRadius: 0.65, ringY: -0.95, labelHeight: 1.35},
  the_tower:    {                             ringRadius: 0.55, ringY: -0.1,  labelHeight: 1.85},
}
const DEFAULT_SHAPE_PARAMS: ShapeParams = { ringRadius: 0.9, ringY: 0, labelHeight: 1.2 }

// Module-level HSL scratch object — reused every frame. Never allocate inside useFrame.
const _hsl = { h: 0, s: 0, l: 0 }

// ---------------------------------------------------------------------------
// TERRITORY NODE
// ---------------------------------------------------------------------------

interface TerritoryNodeProps {
  territory: TerritoryLayout
}

export function TerritoryNode({ territory }: TerritoryNodeProps) {
  // floatGroupRef animates Y — all children float together (fixes Y double-count bug)
  const floatGroupRef    = useRef<THREE.Group>(null)
  const meshRef          = useRef<THREE.Mesh>(null)    // main shape — used for material access
  const ringRef          = useRef<THREE.Mesh>(null)
  const lightRef         = useRef<THREE.PointLight>(null)
  const labelRef         = useRef<HTMLDivElement>(null)
  const labelColorRef    = useRef<string>('')          // change-track: skip DOM write when unchanged
  const labelBorderRef   = useRef<string>('')          // change-track: skip DOM write when unchanged
  const freshnessRef     = useRef<number>(1.0)         // target freshness multiplier (0.45–1.0)
  const freshnessCurRef  = useRef<number>(1.0)         // current smoothed freshness value
  const freshnessColorRef = useRef<number>(1.0)        // current saturation scale (mirrors opacity curve)
  // PERF: cache lastSignal as pre-parsed ms — avoids Date.parse() on every frame (6×60fps=360/s).
  // lastSignalStrRef tracks the raw string; only re-parse when it actually changes (~every 60s).
  const lastSignalStrRef = useRef<string>('')
  const lastSignalMsRef  = useRef<number>(0)

  // Derived selector — only re-renders THIS node when ITS selection state changes.
  // Without this, all 6 nodes re-render on every click (they all subscribed to selectedId).
  const isSelected = useKingdomStore((s) => s.selectedId === territory.id)

  // Micro-badge — subscribes to agentStates (updates ~15s or on WS push, not per frame).
  // core_lore and the_scryer have no agent key → return null → no badge rendered.
  // REGRESSION GUARD: subscribe to s.agentStates, derive inline (never subscribe to getter fn).
  const agentKeyForBadge = TERRITORY_TO_AGENT[territory.id] ?? null
  const agentStateForBadge = useKingdomStore((s) =>
    agentKeyForBadge ? ((s.agentStates[agentKeyForBadge]?.state ?? 'offline') as AgentState) : null
  )
  // World Y = terrain surface at this XZ + shape clearance (position[1])
  const baseY      = getWorldY(territory)
  const params     = SHAPE_PARAMS[territory.id] ?? DEFAULT_SHAPE_PARAMS

  // Shared material — one instance, all sub-meshes (forge pair, tower balls) reference it.
  // Patch 4: flat-shaded low-poly look. Per-territory base colors, bright enough to read
  // through the orange directional light. Neon emissive stays territory.color.
  // PERF: BASE_COLORS hoisted to module scope — was re-allocated as a new object literal
  // on every render for all 6 TerritoryNode instances.
  const baseColor = useMemo(() => TERRITORY_BASE_COLORS[territory.id] ?? '#CCBBFF', [territory.id])
  // PERF: pre-compute color suffix strings — template literals in useFrame allocate on every call.
  // These are stable for the life of the component (territory.color never changes at runtime).
  const colorAlpha40 = useMemo(() => `${territory.color}40`, [territory.color])
  const colorAlpha20 = useMemo(() => `${territory.color}20`, [territory.color])

  // FIX C1: Stable THREE.Color from baseColor — read-only source for freshness desaturation.
  // Never read material.color in useFrame (compounding drift). Always read from this object.
  const _baseColorObj = useMemo(() => new THREE.Color(baseColor), [baseColor])

  // REGRESSION GUARD: deps are [baseColor, territory.color]. TERRITORY_BASE_COLORS is
  // intentionally module-static (never changes at runtime). territory.id is implicitly
  // covered via baseColor which is derived from territory.id above.
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color:             baseColor,
    emissive:          territory.color,  // neon emissive stays the territory color
    emissiveIntensity: 0.2,              // animated in useFrame — initial value only
    roughness:         0.85,
    metalness:         0.0,
    flatShading:       true,             // faceted low-poly look — each face gets solid fill
  }), [baseColor, territory.color])
  useEffect(() => () => material.dispose(), [material])

  // Ring material — stable instance across renders. Inline JSX <meshBasicMaterial> would
  // create a new Three.js material object on every re-render and never dispose the old one.
  // useMemo + useEffect cleanup matches the pattern used above for the shape material.
  const ringMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color:       territory.color,
    transparent: true,
    opacity:     0.15,
    side:        THREE.DoubleSide,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  }), [territory.color])
  useEffect(() => () => ringMaterial.dispose(), [ringMaterial])

  // Glow corona color — territory color lerped 50% toward white so dark colors
  // (purple #7000ff, amber #f0a500) produce a visible bright corona regardless of
  // their original luminance. Crisp main ring keeps territory.color for identity.
  const glowColor = useMemo(() => {
    const col = new THREE.Color(territory.color)
    col.lerp(new THREE.Color('#ffffff'), 0.5)
    return col
  }, [territory.color])

  // Glow corona — single soft halo, tube just barely wider than the main ring.
  // tube=0.055 (vs main 0.04) = 37% wider — a slim bleeding edge, not a fat disc.
  // Opacity driven in useFrame at 50% of main ring opacity.
  const glowRingMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color:       glowColor,
    transparent: true,
    opacity:     0.08,
    side:        THREE.DoubleSide,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  }), [glowColor])
  useEffect(() => () => glowRingMaterial.dispose(), [glowRingMaterial])

  // Stable callback — reads current selection from store directly, not from subscription.
  // isSelected is not in deps: we call getState() to get the live value at click time,
  // which avoids re-creating this function every time selection changes.
  const handleClick = useCallback(() => {
    // Reset cursor immediately — panel opens and may occlude canvas, preventing onPointerLeave
    document.body.style.cursor = 'auto'
    const { selectTerritory: sel, selectedId } = useKingdomStore.getState()
    sel(selectedId === territory.id ? null : territory.id)
  }, [territory.id])

  // Unmount cleanup — reset cursor if component ever unmounts while hovered
  useEffect(() => {
    return () => { document.body.style.cursor = 'auto' }
  }, [])

  useFrame(({ clock }, delta) => {
    if (!floatGroupRef.current) return

    // Overmind brightness boost — module-level Map, no re-renders
    const boost = overmindBrightBoost.get(territory.id)
    const overmindMul = (boost && boost > Date.now()) ? 1.20 : 1.0

    const t      = clock.elapsedTime
    const offset = territory.position[0] * 0.7 + territory.position[2] * 0.3

    // Grounded — no float. baseY = terrain surface + shape clearance.
    floatGroupRef.current.position.y = baseY

    if (!meshRef.current) return

    // 🏛️ ARCHAEOLOGICAL RECORD // DebugPanel Override Gate
    // 🗓️ 2026-03-06 | Session 166 | FIX-A
    // ISSUE: DebugPanel called setDebugOverride(id, override) but buildings never responded.
    //        This useFrame block read store.agentStates directly — debugOverrides slice was
    //        written but never consulted. DebugPanel had never worked from the first day it
    //        was built.
    // RESOLUTION: Check store.debugOverrides[territory.id] first. Override takes priority
    //             with explicit status→AgentState mapping. Without override, fall back to
    //             getAgentState() (normal live path).
    // LAW: Any code path that drives building visual state MUST read debugOverrides first.
    //      getAgentState() alone is insufficient — it has no knowledge of the debug layer.
    const store         = useKingdomStore.getState()
    const debugOverride = store.debugOverrides[territory.id]
    // REGRESSION GUARD: debugOverride must take priority over agentStates for DebugPanel to work.
    // DebugOverride.status maps: 'active'→'working', 'idle'→'online', 'offline'→'offline'.
    // Without this, setDebugOverride() writes to a store slice TerritoryNode never reads.
    const agentState: AgentState = debugOverride
      ? (debugOverride.status === 'offline' ? 'offline' : debugOverride.status === 'idle' ? 'online' : 'working')
      : store.getAgentState(territory.id)
    const buildingState = deriveBuildingState(agentState)
    const cfg           = BUILDING_STATE_CONFIG[buildingState]

    // Activity-scaled emissive with state-dependent ceiling and floor.
    // offline  → cfg.emissiveBase (0.015) — dark, static — conveys absence intentionally
    // stable   → EMISSIVE_FLOOR (0.18) min → scales to 0.50 ceiling at activity=100
    // working  → EMISSIVE_FLOOR (0.18) min → scales to 1.40 ceiling at activity=100
    //   stable:  idle(0)→0.18(floor)  online(40)→0.20  reading(70)→0.35
    //   working: working(80)→1.12  swarming(100)→1.40 (neon dominates)
    const agentKey  = TERRITORY_TO_AGENT[territory.id]
    // Prefer live-push agentStates activity; fall back to SCRYER territory.activity when agentStates
    // is empty (polling mode, no PartyKit live-push). Without fallback: all agent territories
    // show activity=0 and appear permanently dark even when SCRYER reports them active.
    const activity  = debugOverride
      ? debugOverride.activity
      : agentKey
        ? (store.agentStates[agentKey]?.activity ?? store.territoryMap.get(territory.id)?.activity ?? 0)
        : (store.territoryMap.get(territory.id)?.activity ?? 40)
    const emissiveCeiling  = buildingState === 'working' ? 1.4 : 0.50
    const activityBase     = buildingState === 'offline'
      ? cfg.emissiveBase
      : Math.max(EMISSIVE_FLOOR, (activity / 100) * emissiveCeiling)

    // Freshness decay — reads lastSignal from store via getState() (no hook, no re-render)
    // NOTE: SCRYER writes lastSignal: NOW for every territory every cycle, so ageMinutes is
    // always <2. For the ageMinutes<=2 case, use territory activity as a staleness proxy:
    //   activity<=15 (offline) → 0.45  |  activity<=40 (idle) → 0.75  |  active → 1.0
    // Temporal decay (>2 min) only fires when SCRYER genuinely stops writing — e.g. offline.
    // FIX H2: use already-fetched `store` (above) instead of a second getState() call per frame.
    // PERF: cache parsed ms in lastSignalMsRef — lastSignal changes ~every 60s, so 99.9% of frames
    // we do a cheap string identity check instead of Date.parse(). Zero allocation either way.
    const ts = store.territoryMap.get(territory.id)?.lastSignal ?? ''
    if (ts !== lastSignalStrRef.current) {
      lastSignalStrRef.current = ts
      lastSignalMsRef.current  = ts ? Date.parse(ts) : 0
    }
    const ageMinutes = lastSignalMsRef.current > 0 ? (Date.now() - lastSignalMsRef.current) / 60000 : Infinity
    const targetFreshness = ageMinutes > 30 ? 0.45
      : ageMinutes > 10 ? 0.65
      : ageMinutes > 2  ? 0.85
      : activity <= 15  ? 0.45   // offline territory
      : activity <= 40  ? 0.75   // idle territory
      : 1.0                       // active territory
    freshnessRef.current = targetFreshness
    const reviveRate = 1 - Math.pow(0.001, delta * 60)
    const decayRate  = 1 - Math.pow(0.997, delta * 60)
    const freshnessRate = freshnessCurRef.current < freshnessRef.current ? reviveRate : decayRate
    freshnessCurRef.current += (freshnessRef.current - freshnessCurRef.current) * freshnessRate
    freshnessColorRef.current = freshnessCurRef.current

    const freshenedBase = activityBase * freshnessCurRef.current

    // Breathing pulse — modifies shared material (all sub-meshes update)
    const breathe = cfg.breatheAmplitude > 0
      ? Math.sin(t * cfg.breatheFreq + offset * 0.5) * cfg.breatheAmplitude
      : 0
    const targetIntensity = (freshenedBase + breathe) * overmindMul

    // Frame-rate independent exponential approach — same convergence at any FPS
    const lerpFactor = 1 - Math.pow(EMISSIVE_LERP_BASE, delta * 60)
    material.emissiveIntensity += (targetIntensity - material.emissiveIntensity) * lerpFactor

    // FIX C1: Color saturation decay — reads from _baseColorObj (original, never drifts).
    // Old code read material.color each frame, compounding desaturation on every write.
    if (freshnessColorRef.current < 0.999) {
      _baseColorObj.getHSL(_hsl)  // read ORIGINAL base color — never drifts
      material.color.setHSL(_hsl.h, _hsl.s * freshnessColorRef.current, _hsl.l)
    } else {
      material.color.copy(_baseColorObj)  // full freshness → restore exact original
    }

    // Core Lore: always pulse regardless of status (truth never sleeps)
    if (territory.id === 'core_lore') {
      material.emissiveIntensity = Math.max(material.emissiveIntensity,
        0.08 + Math.sin(t * 1.8 + offset) * 0.06)
    }

    // Ring opacity — identity marker, state-blind. Ring = territory is present (always true).
    // All 6 territories share the same idle ring. Selected ring elevated slightly above
    // idle peak (BASE + AMP = 0.59) → selected = 0.65, a clear but not jarring step up.
    if (ringRef.current) {
      ringMaterial.opacity = isSelected
        ? 0.65  // BASE(0.55) + AMP(0.04) = 0.59 idle peak → 0.65 is ~10% above, marks selection
        : RING_OPACITY_BASE + Math.sin(t * RING_BREATHE_FREQ + offset * 0.5) * RING_BREATHE_AMP
    }
    // Glow corona — slim halo just outside the crisp ring edge.
    // 50% of main opacity keeps it visible but subordinate to the crisp wire.
    glowRingMaterial.opacity = ringMaterial.opacity * 0.50

    // Point light — position is fixed relative to float group, just update intensity
    if (lightRef.current) {
      lightRef.current.intensity = targetIntensity * cfg.lightIntensityMul
    }

    // Label color — direct DOM update, change-tracked to eliminate 6 string allocs/frame at rest
    // FIX (S167 audit): previously wrote to style on every frame regardless of state change.
    if (labelRef.current) {
      const labelColor = buildingState === 'offline'
        ? '#2a1830'
        : buildingState === 'stable'
        ? '#8a7090'
        : territory.color
      const nextColor  = isSelected ? territory.color : labelColor
      const nextBorder = isSelected
        ? colorAlpha40
        : buildingState === 'offline' ? 'transparent' : colorAlpha20
      if (nextColor !== labelColorRef.current) {
        labelRef.current.style.color = nextColor
        labelColorRef.current = nextColor
      }
      if (nextBorder !== labelBorderRef.current) {
        labelRef.current.style.borderColor = nextBorder
        labelBorderRef.current = nextBorder
      }
    }
  })

  // Shape geometry — switch on territory.id
  const shapeGeometry = (() => {
    switch (territory.id) {
      case 'the_forge':
        // Two close blocks side by side — Aeris (left) + Claude (right)
        // Shared material means both pulse in sync
        return (
          <>
            <mesh material={material} position={[-0.65, 0, 0]} onClick={handleClick}>
              <boxGeometry args={[0.7, 0.7, 0.7]} />
            </mesh>
            <mesh ref={meshRef} material={material} position={[0.65, 0, 0]} onClick={handleClick}>
              <boxGeometry args={[0.7, 0.7, 0.7]} />
            </mesh>
          </>
        )

      case 'the_scryer':
        // Tall 4-sided pyramid
        return (
          <mesh ref={meshRef} material={material} onClick={handleClick}>
            <coneGeometry args={[0.55, 2.0, 4]} />
          </mesh>
        )

      case 'core_lore':
        // Equilateral triangular prism — 3 sides
        return (
          <mesh ref={meshRef} material={material} onClick={handleClick}>
            <coneGeometry args={[0.55, 0.85, 3]} />
          </mesh>
        )

      case 'the_tower':
        // Cylinder body + two balls stacked on top
        return (
          <group onClick={handleClick}>
            <mesh ref={meshRef} material={material}>
              <cylinderGeometry args={[0.30, 0.50, 1.4, 8]} />
            </mesh>
            {/* Big ball */}
            <mesh material={material} position={[0, 0.92, 0]}>
              <sphereGeometry args={[0.22, 10, 8]} />
            </mesh>
            {/* Small ball */}
            <mesh material={material} position={[0, 1.32, 0]}>
              <sphereGeometry args={[0.16, 10, 8]} />
            </mesh>
          </group>
        )

      default: {
        // claude_house and the_throne — boxes, sized from SHAPE_PARAMS
        const size = params.boxSize ?? [1.0, 1.0, 1.0]
        return (
          <mesh ref={meshRef} material={material} onClick={handleClick}>
            <boxGeometry args={size} />
          </mesh>
        )
      }
    }
  })()

  return (
    // Outer group: XZ position only (no Y — prevents double-count when floatGroup animates Y)
    // Cursor handlers here cover all building types — stopPropagation prevents nested geometry
    // from double-firing. onClick resets cursor in case panel occludes canvas (no leave event).
    <group
      position={[territory.position[0], 0, territory.position[2]]}
      onPointerEnter={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = 'auto' }}
    >
      {/* Float group: Y animated in useFrame. All children drift together. */}
      <group ref={floatGroupRef}>

        {shapeGeometry}

        {/* Glow halo ring — horizontal, state-driven opacity.
            AdditiveBlending: composites as light (consistent with signal pulses + SCRYER ring).
            Opacity managed entirely in useFrame via ringMaterial ref — stable useMemo instance. */}
        <mesh
          ref={ringRef}
          position={[0, params.ringY, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[params.ringRadius, 0.04, 8, 32]} />
          <primitive object={ringMaterial} />
        </mesh>
        {/* Glow corona — tube=0.055, barely wider than main (0.04).
            Additive blending on dark void: slim colored bleed at ring edge, not a disc. */}
        <mesh
          position={[0, params.ringY, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[params.ringRadius, 0.055, 8, 32]} />
          <primitive object={glowRingMaterial} />
        </mesh>

        {/* Point light — fixed above shape center */}
        <pointLight
          ref={lightRef}
          color={territory.color}
          intensity={0.3}
          distance={5}
          decay={2}
          position={[0, 0.8, 0]}
        />

        {/* Label — agent state micro-badge system
            Badge dot: uses PULSE_MS from kingdom-agents for per-state animation duration.
            State text: shown for all active (non-idle, non-offline) states.
            Zzz: floating Zs for offline agent territories (not core_lore/the_scryer).
            FIX M1: @keyframes badge-pulse and badge-zzz hoisted to globals.css — no per-instance <style>. */}
        <Html
          position={[0, params.labelHeight, 0]}
          center
          distanceFactor={12}
          style={{ pointerEvents: 'none' }}
        >
          <div
            ref={labelRef}
            style={{
              fontFamily: "'VT323', 'Courier New', monospace",
              fontSize: '11px',
              letterSpacing: '0.18em',
              color: '#6a5a70',
              background: 'rgba(13,2,33,0.75)',
              padding: '2px 6px',
              borderRadius: '2px',
              whiteSpace: 'nowrap',
              border: '1px solid rgba(100,60,180,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              position: 'relative',
              // Subtle CRT scan-line through the label text
              backgroundImage: 'linear-gradient(rgba(13,2,33,0.75) 49%, rgba(0,212,255,0.06) 50%, rgba(13,2,33,0.75) 51%)',
            }}
          >
            {/* State dot — offline=hollow ring, online=solid small, active=larger with glow+pulse */}
            {agentStateForBadge && (() => {
              const isOffline = agentStateForBadge === 'offline'
              const isOnline  = agentStateForBadge === 'online'
              const isActive  = !isOffline && !isOnline
              const sc = AGENT_STATE_COLORS[agentStateForBadge]
              return (
                <div style={{
                  width:        isOffline ? 4 : isOnline ? 5 : 7,
                  height:       isOffline ? 4 : isOnline ? 5 : 7,
                  borderRadius: '50%',
                  flexShrink:   0,
                  background:   isOffline ? 'transparent' : sc,
                  border:       isOffline ? `1px solid ${sc}` : 'none',
                  opacity:      isOffline ? 0.35 : 1,
                  boxShadow:    isActive ? `0 0 5px ${sc}99, 0 0 10px ${sc}44` : undefined,
                  transition:   'width 300ms ease-in-out, height 300ms ease-in-out',
                  animation:    PULSE_MS[agentStateForBadge] > 0
                    ? `badge-pulse ${PULSE_MS[agentStateForBadge]}ms ease-in-out infinite`
                    : undefined,
                }} />
              )
            })()}

            {territory.label}

            {/* Active state text — JetBrains Mono, full opacity, glow treatment */}
            {agentStateForBadge && agentStateForBadge !== 'offline' && agentStateForBadge !== 'online' && (
              <span style={{
                fontFamily:   "'JetBrains Mono', 'Courier New', monospace",
                fontSize:     '7px',
                color:        AGENT_STATE_COLORS[agentStateForBadge],
                opacity:      1.0,
                letterSpacing:'0.10em',
                textShadow:   `0 0 4px ${AGENT_STATE_COLORS[agentStateForBadge]}88`,
                background:   `${AGENT_STATE_COLORS[agentStateForBadge]}14`,
                padding:      '0 2px',
              }}>
                {agentStateForBadge.toUpperCase()}
              </span>
            )}

            {/* Zzz — offline agent territories only (core_lore/the_scryer have no agentKey → null badge) */}
            {agentStateForBadge === 'offline' && (
              <>
                <span style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '-2px',
                  fontSize: '7px',
                  color: AGENT_STATE_COLORS.offline,
                  opacity: 0,
                  pointerEvents: 'none',
                  animation: 'badge-zzz 2s ease-in-out infinite',
                  animationDelay: '0s',
                }}>z</span>
                <span style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '6px',
                  fontSize: '8px',
                  color: AGENT_STATE_COLORS.offline,
                  opacity: 0,
                  pointerEvents: 'none',
                  animation: 'badge-zzz 2s ease-in-out infinite',
                  animationDelay: '0.65s',
                }}>z</span>
                <span style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '14px',
                  fontSize: '6px',
                  color: AGENT_STATE_COLORS.offline,
                  opacity: 0,
                  pointerEvents: 'none',
                  animation: 'badge-zzz 2s ease-in-out infinite',
                  animationDelay: '1.3s',
                }}>z</span>
              </>
            )}
          </div>
        </Html>

      </group>
    </group>
  )
}
