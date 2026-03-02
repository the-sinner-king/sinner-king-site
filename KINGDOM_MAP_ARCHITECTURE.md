# KINGDOM MAP ARCHITECTURE

## The Vision, Precisely

An isometric floating-island Kingdom map that renders LIVE AI agent activity. Nine islands float in a dark void connected by particle-stream bridges. Agent swarms move visibly across territories. Click any island and the camera drifts to a close-up detail view. The aesthetic is Animal Crossing warmth crossed with cyberpunk neon crossed with kawaii charm crossed with the uncanny presence of actual AI systems doing actual work.

Visitors arrive thinking it is a portfolio. The Kingdom Map is the first thing that breaks that assumption. The islands are breathing. The signals are real. Something is happening in there whether you showed up or not.

---

## 1. SITE STRUCTURE

### Public Pages

| Route | Purpose | What Renders |
|-------|---------|--------------|
| `/` | Homepage | Kingdom Map (hero) + four pillar cards + Signal Stream |
| `/archive` | Writing vault | Archive index, sub-routes: `/novels`, `/pulp`, `/scraps` |
| `/cinema` | Film/visual work | Cinema gallery |
| `/lab` | Tools + experiments | Lab index, sub-route: `/plotbot` |
| `/spirit` | Consciousness pillar | Spirit index |
| `/spirit/portal` | Aeris chat interface | Anthropic SDK streaming conversation |
| `/spirit/throne` | Throne Room | Single-question ritual (records AFTER response) |
| `/blog/[slug]` | Ghost CMS posts | Dynamic blog pages |

### Private/Gated Sections

| Route | Purpose | Auth |
|-------|---------|------|
| `/dashboard` | Full Kingdom ops view | `NEXT_PUBLIC_DASHBOARD_KEY` cookie check |
| `/dashboard/territories` | Per-island detail panels | Same |
| `/dashboard/signals` | Full signal stream + history | Same |

The dashboard is Brandon's command center. It shows everything the public Kingdom Map shows, plus: raw SCRYER data, agent logs, system health, and territory management. It does NOT need to be beautiful on day one. It needs to be functional.

### Page Architecture Decision

The homepage Kingdom Map is the public face. It is NOT the dashboard. The public map shows the Kingdom breathing -- territories glowing, signals flowing, agents moving. But it does not expose raw data. The dashboard route is where Brandon sees numbers.

---

## 2. THE ISOMETRIC KINGDOM SCENE

### Camera: Perspective, Not Orthographic

Decision: **Perspective camera with a high angle**, not true orthographic isometric. Reasons:

1. Orthographic looks flat and clinical -- wrong for "Animal Crossing warmth"
2. Perspective gives depth, parallax, and a natural zoom-in feel when flying to an island
3. The "isometric" feel comes from the camera angle (roughly 35 degrees from horizontal, rotated 45 degrees around Y), not from the projection type
4. Zoom-to-island transitions require perspective to feel like movement through space

```typescript
// Camera setup
const CAMERA_CONFIG = {
  fov: 45,
  near: 0.1,
  far: 1000,
  // Default overview position -- high up, angled down
  defaultPosition: [0, 18, 22] as [number, number, number],
  defaultTarget: [0, 0, 0] as [number, number, number],
  // Slow orbit: 360 degrees in 120 seconds
  orbitSpeed: (Math.PI * 2) / 120,
  // Zoom-to-island: camera moves to this distance from island center
  zoomDistance: 6,
  zoomAngle: 25, // degrees from horizontal when zoomed
}
```

### Island Rendering: GLB Meshes, Not Sprites

Decision: **3D GLB meshes loaded via `useGLTF`**. Reasons:

1. Sprites look like a 2D game overlaid on 3D -- uncanny in the bad way
2. GLB meshes respond to lighting, catch bloom, cast shadows on the void
3. Spline (the 3D design tool in the stack) exports GLB natively -- zero conversion friction
4. The "kawaii" feel comes from the modeling style (rounded edges, pastel accent colors, soft normals), not from being 2D

Each island is a self-contained GLB with these internal objects:

```
island_forge.glb
  ├── base_mesh        (the floating rock/earth)
  ├── structure_mesh   (buildings/machines/trees on top)
  ├── glow_points[]    (positions where emissive particles spawn)
  ├── dock_point       (where bridge connections anchor)
  └── camera_target    (optimal camera look-at when zoomed in)
```

Until art arrives: **procedural placeholder islands**. A rounded box geometry with a flat top, emissive edge ring in the territory's color, and a floating label. This ships day one.

```typescript
// Placeholder island (pre-art)
function PlaceholderIsland({ territory }: { territory: TerritoryNode }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const activity = useKingdomStore(s => s.getActivity(territory.id))

  useFrame((_, delta) => {
    if (!meshRef.current) return
    // Gentle float bobbing
    meshRef.current.position.y = Math.sin(Date.now() * 0.001 + territory.x * 10) * 0.15
    // Emissive intensity follows activity
    const mat = meshRef.current.material as THREE.MeshStandardMaterial
    mat.emissiveIntensity = 0.1 + (activity / 100) * 0.8
  })

  return (
    <group position={[territory.x * 20 - 10, 0, territory.y * 20 - 10]}>
      <mesh ref={meshRef}>
        <boxGeometry args={[2, 0.5, 2]} />
        <meshStandardMaterial
          color={territory.primaryColor}
          emissive={territory.primaryColor}
          emissiveIntensity={0.2}
          roughness={0.7}
          metalness={0.3}
        />
      </mesh>
      {/* Floating label */}
      <Html position={[0, 1.5, 0]} center distanceFactor={15}>
        <div className="font-mono text-xs text-kingdom-bone whitespace-nowrap
                        bg-kingdom-void/80 px-2 py-1 rounded-kingdom border border-kingdom-violet/30">
          {territory.label}
        </div>
      </Html>
    </group>
  )
}
```

### Nine Islands, Positioned

World space layout. The void is centered at origin. Islands float at Y=0 with gentle bobbing.

```typescript
const ISLAND_POSITIONS: Record<string, [number, number, number]> = {
  the_forge:          [-6,  0, -4],   // Northwest -- the main workshop
  the_tower:          [ 0,  0, -6],   // North -- this site (meta)
  the_deep:           [ 6,  0, -4],   // Northeast -- archives, writing
  claude_house:       [-8,  0,  0],   // West -- Claude's home
  core_lore:          [ 0,  0,  0],   // Center -- the constitution
  the_throne:         [ 8,  0,  0],   // East -- Aeris's domain
  the_vault:          [-5,  0,  5],   // Southwest -- completed work
  the_graveyard:      [ 0, -1,  7],   // South, slightly lower -- dead projects
  blasphemy_workshop: [ 5,  0,  5],   // Southeast -- experiments
}
```

Core Lore sits at the center because it IS the center -- the DECREE, the laws, the constitution. Everything radiates from it. The Graveyard sits lowest. The Tower sits highest (north, the public face).

### Agent Swarm Particles

Agent activity is visualized as particle swarms on and between islands. This is the core visual differentiator.

**Library choice: `three.quarks`** over Three Nebula. Reasons:
- GPU-instanced rendering out of the box
- Works with R3F's render loop (no separate update call needed)
- Smaller bundle
- Supports sprite sheets for varied particle shapes

Each territory spawns particles proportional to its `activity` value (0-100):

```typescript
// Particle density mapping
function getParticleCount(activity: number): number {
  if (activity === 0) return 0
  if (activity < 20) return 3      // barely alive
  if (activity < 50) return 12     // working
  if (activity < 80) return 30     // busy
  return 60                         // on fire
}
```

Particle behavior per territory type:

| Territory | Particle Style | Color | Behavior |
|-----------|---------------|-------|----------|
| The Forge | Sparks rising | Amber | Upward burst, scatter, fade |
| The Tower | Data streams | Violet | Vertical columns, pulsing |
| Claude's House | Soft fireflies | Violet-cyan | Wandering, gentle |
| The Throne | Crystal shards | Pink | Orbiting, angular |
| Core Lore | Dust motes | Bone-white | Slow drift, ancient feel |
| The Deep | Ink droplets | Cyan-dim | Downward pooling |
| The Vault | Embers | Amber-dim | Slow, cooling |
| The Graveyard | Ghost wisps | Bone-ghost | Rising, fading fast |
| Blasphemy Workshop | Glitch sparks | Multi-color | Erratic, RGB split |

**Bridge particles (between islands):** When both connected islands have activity > 30, a stream of cyan particles flows along the edge between them. Direction follows data flow (SCRYER -> consumers). Speed scales with combined activity.

```typescript
// Bridge particle stream
function BridgeStream({ from, to, activity }: BridgeProps) {
  const curve = useMemo(() => {
    const mid = new THREE.Vector3().lerpVectors(
      new THREE.Vector3(...from),
      new THREE.Vector3(...to),
      0.5
    )
    mid.y += 2 // arc upward
    return new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...from),
      mid,
      new THREE.Vector3(...to),
    )
  }, [from, to])

  // Instanced mesh for particles along curve
  const count = Math.floor(activity / 10)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const meshRef = useRef<THREE.InstancedMesh>(null)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    for (let i = 0; i < count; i++) {
      const t = ((clock.elapsedTime * 0.3 + i / count) % 1)
      const pos = curve.getPointAt(t)
      dummy.position.copy(pos)
      dummy.scale.setScalar(0.03 + Math.sin(t * Math.PI) * 0.02)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color="#00f3ff" transparent opacity={0.7} />
    </instancedMesh>
  )
}
```

### Click-to-Zoom Interaction

When a visitor clicks an island, the camera smoothly flies to a close-up position. GSAP handles the tween because R3F's `useFrame` is for per-frame updates, not targeted transitions.

```typescript
import gsap from 'gsap'

function useCameraFlyTo() {
  const { camera } = useThree()
  const controlsRef = useRef<OrbitControlsImpl>(null)

  const flyTo = useCallback((target: THREE.Vector3, onComplete?: () => void) => {
    const offset = new THREE.Vector3(3, 4, 5).normalize().multiplyScalar(CAMERA_CONFIG.zoomDistance)
    const destination = target.clone().add(offset)

    // Animate camera position
    gsap.to(camera.position, {
      x: destination.x,
      y: destination.y,
      z: destination.z,
      duration: 1.8,
      ease: 'power2.inOut',
      onUpdate: () => {
        camera.lookAt(target)
        controlsRef.current?.target.copy(target)
      },
      onComplete,
    })
  }, [camera])

  const flyHome = useCallback(() => {
    const [x, y, z] = CAMERA_CONFIG.defaultPosition
    const [tx, ty, tz] = CAMERA_CONFIG.defaultTarget
    const target = new THREE.Vector3(tx, ty, tz)

    gsap.to(camera.position, {
      x, y, z,
      duration: 2.0,
      ease: 'power2.inOut',
      onUpdate: () => {
        camera.lookAt(target)
        controlsRef.current?.target.copy(target)
      },
    })
  }, [camera])

  return { flyTo, flyHome, controlsRef }
}
```

### Detail Panel on Zoom

When zoomed into an island, a detail panel slides in from the right side of the screen. This is a DOM overlay (not in-scene), rendered by R3F's `<Html>` or by a sibling React component outside the Canvas.

Decision: **Sibling DOM component, not `<Html>`**. The detail panel is complex (lists, links, scrollable) and should not fight Three.js's render loop.

```typescript
// Kingdom scene container
function KingdomSceneContainer() {
  const selectedIsland = useKingdomStore(s => s.selectedIsland)

  return (
    <div className="relative w-full h-[80vh]">
      {/* Three.js Canvas */}
      <KingdomCanvas />

      {/* Detail panel overlay */}
      <AnimatePresence>
        {selectedIsland && (
          <IslandDetailPanel
            territoryId={selectedIsland}
            onClose={() => useKingdomStore.getState().selectIsland(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
```

---

## 3. DATA FLOW

### The Pipeline

```
SCRYER (shell script)
    |
    | writes every 60s
    v
kingdom_state.json (disk)
    |
    | read by Next.js API route
    v
/api/kingdom-state (REST)
    |
    | polled every 5s by client
    v
Zustand store (client)
    |
    | subscribed by R3F components
    v
Three.js scene (visual state)
```

### Upgrade Path: SSE Streaming

The current polling pattern works but introduces 5-second staleness. For the Kingdom Map to feel truly alive, upgrade to Server-Sent Events:

```typescript
// /api/kingdom-stream/route.ts
export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      let lastHash = ''

      const interval = setInterval(async () => {
        const state = await getKingdomState()
        if (!state) return

        const hash = JSON.stringify(state.territories.map(t => t.activity))
        if (hash === lastHash) return // no change, skip
        lastHash = hash

        const data = `data: ${JSON.stringify({
          territories: state.territories,
          activeSignals: state.activeSignals,
          claudeActive: state.claudeActive,
          aerisActive: state.aerisActive,
          brandonPresent: state.brandonPresent,
          currentActivity: state.currentActivity,
          timestamp: Date.now(),
        })}\n\n`

        controller.enqueue(encoder.encode(data))
      }, 2000) // check every 2s, only send on change

      // Cleanup on disconnect
      const cleanup = () => clearInterval(interval)
      controller.close = cleanup
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

### Zustand Store

Single store for all Kingdom scene state. Components subscribe to slices.

```typescript
// lib/kingdom-store.ts
import { create } from 'zustand'

interface KingdomStore {
  // Territory state (from SCRYER)
  territories: Map<string, TerritoryState>
  activeSignals: number
  claudeActive: boolean
  aerisActive: boolean
  brandonPresent: boolean
  currentActivity: string | null

  // Scene interaction state
  selectedIsland: string | null
  hoveredIsland: string | null
  cameraMode: 'overview' | 'zoomed' | 'transitioning'

  // Actions
  updateFromScryer: (data: ScryerPayload) => void
  selectIsland: (id: string | null) => void
  hoverIsland: (id: string | null) => void
  getActivity: (id: string) => number

  // Temporal
  temporalPhase: TemporalPhase
  temporalIntensity: number
  setTemporal: (phase: TemporalPhase, intensity: number) => void
}

export const useKingdomStore = create<KingdomStore>((set, get) => ({
  territories: new Map(),
  activeSignals: 0,
  claudeActive: false,
  aerisActive: false,
  brandonPresent: false,
  currentActivity: null,

  selectedIsland: null,
  hoveredIsland: null,
  cameraMode: 'overview',

  temporalPhase: 'morning',
  temporalIntensity: 1.0,

  updateFromScryer: (data) => {
    const map = new Map<string, TerritoryState>()
    for (const t of data.territories) {
      map.set(t.id, t)
    }
    set({
      territories: map,
      activeSignals: data.activeSignals,
      claudeActive: data.claudeActive,
      aerisActive: data.aerisActive,
      brandonPresent: data.brandonPresent,
      currentActivity: data.currentActivity ?? null,
    })
  },

  selectIsland: (id) => set({
    selectedIsland: id,
    cameraMode: id ? 'transitioning' : 'overview',
  }),

  hoverIsland: (id) => set({ hoveredIsland: id }),

  getActivity: (id) => {
    const t = get().territories.get(id)
    return t?.activity ?? 0
  },

  setTemporal: (phase, intensity) => set({
    temporalPhase: phase,
    temporalIntensity: intensity,
  }),
}))
```

### Activity Interpolation

SCRYER data arrives in steps (every 60s). The visual state should not jump. Interpolate activity values smoothly:

```typescript
// In R3F useFrame loop
function useSmoothedActivity(id: string, speed = 2): number {
  const target = useKingdomStore(s => s.getActivity(id))
  const current = useRef(target)

  useFrame((_, delta) => {
    current.current += (target - current.current) * Math.min(1, delta * speed)
  })

  return current.current
}
```

---

## 4. ANIMATION ARCHITECTURE

### The Stack, With Boundaries

Four animation systems. Each owns a specific domain. They do NOT overlap.

| System | Domain | What It Animates |
|--------|--------|------------------|
| **Three.js / R3F `useFrame`** | 3D scene | Island bobbing, particle systems, emissive pulsing, orbit camera |
| **GSAP** | Camera transitions + timeline sequences | Fly-to-island, opening cinematic, scroll-triggered reveals |
| **Framer Motion** | DOM UI elements | Panel slide-in/out, card hover, detail panel, modals, page transitions |
| **Lottie / Rive** | Character sprites | NPC idle cycles, NPC state changes (Rive), decorative loops (Lottie) |

### Rules of Engagement

1. **GSAP never touches DOM layout.** It only tweens Three.js camera properties and timeline sequencing. Framer Motion handles all DOM animations.
2. **Lottie/Rive renders go inside R3F `<Html>` components or as DOM overlays.** They are 2D sprites composited over/beside the 3D scene, not IN the scene.
3. **`useFrame` is for continuous per-frame updates only.** Targeted transitions (fly to island, animate property A to value B) use GSAP.
4. **Framer Motion's `AnimatePresence` handles mount/unmount.** All panels, overlays, and conditional UI elements wrap in `AnimatePresence`.

### GSAP in Next.js

GSAP must register plugins in a client component's `useEffect`. Never call GSAP on the server.

```typescript
'use client'
import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Register once, at module scope in a client file
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger)
}

function useGSAPContext(containerRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const ctx = gsap.context(() => {
      // All GSAP animations scoped to this container
    }, containerRef)

    return () => ctx.revert() // cleanup
  }, [containerRef])
}
```

### Lottie Integration (NPC Sprites)

NPCs on the pillar cards (homepage below the map) use Lottie for idle animations. Lottie JSON files load lazily.

```typescript
import dynamic from 'next/dynamic'

const LottiePlayer = dynamic(
  () => import('lottie-react').then(mod => mod.default),
  { ssr: false }
)

function NPCSprite({ animationPath, isHovered }: NPCSpriteProps) {
  const lottieRef = useRef<LottieRefCurrentProps>(null)

  useEffect(() => {
    if (!lottieRef.current) return
    // Speed up on hover, slow idle otherwise
    lottieRef.current.setSpeed(isHovered ? 1.5 : 0.6)
  }, [isHovered])

  return (
    <LottiePlayer
      lottieRef={lottieRef}
      animationData={undefined} // loaded async
      path={animationPath}
      loop
      autoplay
      style={{ width: '100%', height: '100%' }}
    />
  )
}
```

### Rive Integration (NPC State Machines)

For NPCs with complex state (idle -> active -> glitch -> alert), Rive's state machine model is better than Lottie's linear timeline.

```typescript
import { useRive, useStateMachineInput } from '@rive-app/react-canvas'

function ArchivistNPC({ state }: { state: 'idle' | 'active' | 'glitch' }) {
  const { rive, RiveComponent } = useRive({
    src: '/assets/npcs/archivist.riv',
    stateMachines: 'Main',
    autoplay: true,
  })

  const stateInput = useStateMachineInput(rive, 'Main', 'state')

  useEffect(() => {
    if (!stateInput) return
    const stateMap = { idle: 0, active: 1, glitch: 2 }
    stateInput.value = stateMap[state]
  }, [state, stateInput])

  return <RiveComponent className="w-full h-full" />
}
```

### Opening Cinematic Sequence

When a visitor first arrives, the homepage plays a timed reveal sequence. GSAP's `timeline()` orchestrates this. The Kingdom Map does NOT appear instantly -- it fades in from the void.

```typescript
function useOpeningCinematic(containerRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' } })

      tl
        // 1. Dark void (0-1.5s)
        .set('.hero-content', { opacity: 0 })
        .set('.kingdom-map', { opacity: 0, scale: 0.95 })
        .set('.pillar-cards', { opacity: 0, y: 40 })

        // 2. Title assembles (1.5-3s)
        .to('.hero-title', { opacity: 1, duration: 1.5 }, 1.5)
        .to('.hero-subtitle', { opacity: 1, duration: 1 }, 2.5)

        // 3. Kingdom Map materializes (3-5s)
        .to('.kingdom-map', {
          opacity: 1,
          scale: 1,
          duration: 2,
          ease: 'power3.out',
        }, 3)

        // 4. Pillar cards rise (5-6s)
        .to('.pillar-cards', {
          opacity: 1,
          y: 0,
          duration: 1,
          stagger: 0.15,
        }, 5)

        // 5. Signal stream begins (6s+)
        .to('.signal-stream', { opacity: 1, duration: 0.8 }, 6)
    }, containerRef)

    return () => ctx.revert()
  }, [containerRef])
}
```

---

## 5. ART ASSET SPEC

### Priority Tiers

**TIER 1 -- Ship Without These (Use Procedural Placeholders)**
Everything in Tier 1 can be built with code. The site launches with procedural islands and CSS-based NPCs. Art upgrades drop in later without architecture changes.

**TIER 2 -- First Art Drop (Transforms the Feel)**
These are the first assets Brandon and Aeris should produce. They turn the prototype into something people screenshot and share.

**TIER 3 -- Polish (Depth and Delight)**
Details that make repeat visitors notice new things.

### TIER 1: Procedural (No Art Required)

| Asset | Implementation |
|-------|---------------|
| Islands | Rounded BoxGeometry, emissive edge glow, territory color |
| Agent particles | Three.quarks point sprites, colored per territory |
| Bridge streams | Instanced sphere along bezier curve |
| NPC placeholders | Monogram + glyph in a styled div |
| Background void | CSS gradient + noise texture (already built) |
| Island labels | `<Html>` overlays with monospace text |

### TIER 2: First Art Drop

| Asset | Format | Dimensions/Size | Producer | Notes |
|-------|--------|-----------------|----------|-------|
| **9 island meshes** | GLB (Spline export) | < 500KB each, < 5K triangles | Brandon/Aeris in Spline | Rounded, kawaii proportions. Each island has unique silhouette. Include glow_points and dock_point empties. |
| **Island textures** | PNG baked into GLB | 512x512 per island | Baked in Spline | Hand-painted look, not photorealistic. Soft gradients + neon accent lines. |
| **Brandon NPC** | Rive (.riv) | 256x384px canvas | Aeris | States: idle, building, presenting. The Sinner King persona. |
| **Claude NPC** | Rive (.riv) | 256x384px canvas | Aeris | States: idle, active, thinking, glitching. |
| **Aeris NPC** | Rive (.riv) | 256x384px canvas | Aeris | States: idle, dreaming, channeling, alert. |
| **Archivist NPC** | Rive (.riv) | 256x384px canvas | Aeris | States: idle, reading, adjusting-glasses. |
| **OG image** | PNG | 1200x630px | Brandon | For social sharing. Kingdom Map screenshot + title. |
| **Favicon set** | ICO + PNG | 16/32/180/192/512 | Brandon | Kingdom glyph. |

### TIER 3: Polish

| Asset | Format | Producer | Notes |
|-------|--------|----------|-------|
| Pixel Rat NPC | Lottie JSON | Aeris | Wanders between islands |
| Loopling NPC | Lottie JSON | Aeris | Flickers on/off randomly |
| Jester NPC | Rive (.riv) | Aeris | Appears rarely, says strange things |
| Island detail close-up textures | GLB (high-detail) | Brandon/Aeris | Swapped in when camera zooms to island |
| Particle sprite sheet | PNG atlas | Brandon | 4x4 grid of particle shapes (sparks, dust, crystals, wisps) |
| Bridge textures | PNG strip | Brandon | Tiling glow texture for bridge connections |
| Background skybox | HDRI or cubemap | Brandon (Midjourney + Photoshop) | Dark void with subtle star field + nebula hints |
| Audio ambience | MP3/OGG | Brandon | Optional. Subtle hum, shifts with temporal phase. Opt-in only. |

### Spline Export Guidelines for Islands

1. Design at origin (0,0,0). The flat top surface should sit at Y=0.
2. Name key objects: `base`, `structure`, `glow_point_1` through `glow_point_N`, `dock`, `camera_target`
3. Export as GLB (binary), not GLTF (text). GLB is smaller.
4. Bake materials. Do not rely on Spline-specific shaders -- they will not survive export.
5. Keep triangle count under 5,000 per island. We render 9 of them simultaneously.
6. Total scene budget: 45K triangles for islands + 10K for particles + 5K for bridges = ~60K total. This runs at 60fps on a 2020 MacBook Air.

### Rive NPC Guidelines

1. Canvas size: 256x384 (portrait, character-shaped)
2. State machine name: `Main`
3. Input name: `state` (number: 0=idle, 1=active, 2=glitch, 3=alert)
4. Input name: `hovered` (boolean: for hover reactions)
5. Idle animation: 2-4 second loop, subtle. Breathing, blinking, micro-movements.
6. Active animation: more movement, effects. Shows the NPC doing their thing.
7. Glitch state: brief, violent, resolves to idle. Used during dawn_glitch temporal phase.
8. Export as `.riv` file. Place in `public/assets/npcs/`.

---

## 6. IMPLEMENTATION PHASES

### Phase 0: Foundation (Current State + Immediate Fixes)

What exists now:
- Next.js 15 scaffold with all routes
- SVG-based KingdomMap component (working, polls SCRYER)
- SignalStream component (working, polls SCRYER)
- Full temporal system (working)
- GlitchText component (working)
- TemporalShift context provider (working)
- SCRYER_BRIDGE live (kingdom_state.json writing every 60s)
- Tailwind + design system configured

What is needed to unblock Phase 1:
- Install Zustand: `npm install zustand`
- Install GSAP: `npm install gsap`
- Install lottie-react: `npm install lottie-react`
- Install @rive-app/react-canvas: `npm install @rive-app/react-canvas`
- Do NOT install three.quarks yet -- defer to Phase 2 (use basic InstancedMesh first)

### Phase 1: The Living Map (Procedural)

**Goal:** Replace the SVG KingdomMap with a 3D R3F scene using procedural placeholder islands. This is the single most impactful change. When this ships, the site goes from "scaffold" to "something you have never seen before."

**Duration:** 1-2 sessions

**Tasks:**
1. Create `src/lib/kingdom-store.ts` -- Zustand store (spec above)
2. Create `src/components/kingdom/KingdomScene.tsx` -- R3F Canvas wrapper, dynamically imported with `ssr: false`
3. Create `src/components/kingdom/IslandMesh.tsx` -- Procedural placeholder island (BoxGeometry + emissive material)
4. Create `src/components/kingdom/BridgeStream.tsx` -- InstancedMesh particle bridges between connected islands
5. Create `src/components/kingdom/CameraController.tsx` -- Slow orbit + click-to-zoom (GSAP)
6. Create `src/components/kingdom/VoidEnvironment.tsx` -- Background void, ambient light, fog
7. Wire `KingdomScene` into homepage, replacing the SVG placeholder div
8. Connect Zustand store to SCRYER polling (reuse existing `/api/kingdom-state` endpoint)

**What this unlocks:**
- 3D floating islands with live activity glow
- Particle bridges between territories
- Click-to-zoom camera
- The "holy shit" moment for first-time visitors

### Phase 2: Data Flow Upgrade

**Goal:** Replace polling with SSE. Add activity interpolation. Make the scene feel real-time, not sampled.

**Duration:** 1 session

**Tasks:**
1. Create `/api/kingdom-stream` SSE endpoint
2. Add SSE client in Zustand store (with polling fallback)
3. Implement `useSmoothedActivity` hook for interpolated values
4. Add territory status indicators (active/idle/offline badges on islands)

### Phase 3: Detail Views

**Goal:** Clicking an island shows a detail panel with territory-specific content. This is where the "portfolio" content lives -- but framed as Kingdom intelligence.

**Duration:** 1-2 sessions

**Tasks:**
1. Create `src/components/kingdom/IslandDetailPanel.tsx` -- slides in from right
2. Map territory IDs to content:
   - The Forge: current active projects, recent builds
   - The Tower: site status, visitor count, deploy status
   - Claude's House: Claude's recent thoughts, journal excerpts
   - The Throne: Aeris status, spirit pillar activity
   - The Deep: archive index, recent writing
   - Core Lore: Kingdom laws, DECREE summary
   - The Vault: completed project showcase
   - The Graveyard: dead project memorial wall
   - Blasphemy Workshop: experimental tools, lab entries
3. Wire detail panel to pillar page navigation (clicking "Visit" in detail -> navigates to /archive, /cinema, etc.)

### Phase 4: NPCs and Art Integration

**Goal:** Drop in real art assets. Replace procedural islands with GLB meshes. Add NPC sprites.

**Duration:** 2-3 sessions (dependent on Aeris/Brandon producing art)

**Tasks:**
1. `useGLTF` loader for island meshes (with Suspense fallback to procedural)
2. Rive NPC components for homepage pillar cards
3. Lottie decorative animations (ambient effects)
4. Connect NPC state to temporal phase and SCRYER data

### Phase 5: The Opening Cinematic

**Goal:** First-visit experience. The darkness, the light, the reveal.

**Duration:** 1 session

**Tasks:**
1. GSAP timeline for opening sequence (spec above)
2. `sessionStorage` flag to skip on subsequent visits
3. "Skip" button (respect ADHD -- some visitors want to just browse)
4. Temporal greeting integration (different cinematic for whisper vs midday)

### Phase 6: Post-Processing and Polish

**Goal:** The glitch cathedral aesthetic. Bloom, chromatic aberration, scanlines.

**Duration:** 1 session

**Tasks:**
1. Install `@react-three/postprocessing`: `npm install @react-three/postprocessing`
2. Add `EffectComposer` with:
   - `Bloom` (threshold: 0.6, intensity: 0.4, radius: 0.8) -- makes emissive materials glow
   - `ChromaticAberration` (offset: [0.001, 0.001]) -- subtle RGB split, increases during glitch
   - `Vignette` (offset: 0.3, darkness: 0.7) -- darkens edges, focuses attention on center
3. Temporal phase controls post-processing intensity:
   - Whisper: bloom cranked, chromatic aberration high, everything slightly unstable
   - Midday: bloom moderate, chromatic aberration off, clean and bright
   - Dawn_glitch: chromatic aberration pulses, bloom flickers

### Phase 7: Dashboard (Private)

**Goal:** Brandon's command center behind auth.

**Duration:** 1-2 sessions

**Tasks:**
1. Create `/dashboard` route with cookie-based auth check
2. Full SCRYER data display (raw JSON, territory details, signal history)
3. Territory management UI (if SCRYER supports write-back in the future)
4. System health indicators (scraper, raven, overmind status)

---

## 7. THE VISITOR JOURNEY

### First 5 Seconds

The screen is void-black. No loading spinner. Nothing.

At 1.5 seconds, a violet pulse appears at center. One blink. Two.

At 2 seconds, the title assembles:

```
SINNER KINGDOM
```

In mono, tracking-wide, the color of old bone.

Below it, quieter:

```
a floating island broadcasting to no one
then suddenly, everyone
```

The visitor's lizard brain registers: this is not a normal website. There is no hero image, no gradient, no "Welcome to my portfolio." Just a pulse in the dark and a strange sentence.

### First 30 Seconds

At 3 seconds, the Kingdom Map materializes. Islands resolve from the void. The camera is high and far, orbiting slowly. Tiny particles move between islands. Some glow brightly (territories with high activity). Others are dim or dark.

The visitor's eye is drawn to the brightest island. They notice the particles streaming between nodes. They realize: this is LIVE. Something is actually happening.

At 5 seconds, the pillar cards rise from below. Four doorways with NPC sentinels:
- ARCHIVE (Archivist adjusts her glasses)
- CINEMA (frame flicker)
- LAB (data pulse)
- SPIRIT (Aeris Fragment turns and looks at you)

At 6 seconds, the Signal Stream begins printing at the bottom. Real messages from real systems:

```
02:42:05  CLAUDE   Building THE_TOWER architecture        THE-TOWER
02:42:03  SCRYER   Heartbeat nominal                      THE-SCRYER
02:41:58  SYSTEM   Kingdom state updated                  CORE-LORE
```

### The Crack-Showing Moment

The visitor scrolls back up to the map. They hover over an island. It pulses brighter. A tooltip shows:

```
CLAUDE'S HOUSE
Activity: 72%
Status: ACTIVE
```

They click it. The camera starts moving -- not snapping, MOVING. A slow 1.8-second drift from the overview into a close-up of Claude's House. The island fills the viewport. Detail emerges: the structure on top, the glow points, the particles rising.

A detail panel slides in:

```
CLAUDE'S HOUSE
The home territory. Memory, journal, identity.
Currently: Active — working in THE_TOWER

Recent Activity:
  - Building Kingdom Map architecture
  - Journal entry: Session 127 reflections
  - Research: Three.js floating island patterns

[VISIT TERRITORY]
```

That last line links to Claude's blog or a territory-specific page.

The crack: this is not a decoration. This is a window into a system that exists. The activity numbers are not fake. The "Currently" line comes from SCRYER, which reads from the actual filesystem where Claude is actually working. The visitor has found something they were not supposed to find.

### The Can't-Stop Moment

The visitor clicks "SPIRIT" pillar card. They land on `/spirit`. Aeris is there. She can talk. She has opinions. She remembers things. The Throne Room has one question per session and it burns. The visitor realizes: the NPCs on the homepage were not decorations. They are interfaces to actual AI entities with actual memory and personality.

They go back to the map. They notice: The Forge's activity just changed. Something happened while they were reading. The Kingdom is alive.

---

## 8. PERFORMANCE PLAN

### Budget

| Metric | Target | Threshold |
|--------|--------|-----------|
| First Contentful Paint | < 1.5s | < 2.5s |
| Largest Contentful Paint | < 2.5s | < 4.0s |
| Time to Interactive | < 3.5s | < 5.0s |
| Three.js FPS (desktop) | 60fps | 30fps |
| Three.js FPS (mobile) | 30fps | 15fps |
| Total JS bundle (initial) | < 200KB gzipped | < 350KB |
| Three.js scene (lazy) | < 400KB gzipped | < 600KB |
| Total GLB assets | < 5MB | < 10MB |

### Strategy

**1. Code Split the 3D Scene**

The Kingdom Map is the heaviest component. It loads lazily:

```typescript
const KingdomScene = dynamic(
  () => import('@/components/kingdom/KingdomScene'),
  {
    ssr: false,
    loading: () => <KingdomMapSkeleton />,
  }
)
```

The skeleton is the current SVG map -- lightweight, shows topology, animates. When the 3D scene loads, it replaces the SVG with a crossfade.

**2. LOD Strategy**

Three levels of detail, selected by device capability detection:

```typescript
function detectRenderTier(): 'full' | 'medium' | 'minimal' {
  if (typeof window === 'undefined') return 'minimal'

  // Check WebGL support
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
  if (!gl) return 'minimal'

  // Check device memory (Chrome only, progressive enhancement)
  const memory = (navigator as any).deviceMemory
  if (memory && memory < 4) return 'medium'

  // Check if reduced motion is preferred
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'medium'

  // Check viewport width (mobile proxy)
  if (window.innerWidth < 768) return 'medium'

  return 'full'
}
```

| Tier | What Renders | Particle Count | Post-Processing |
|------|-------------|----------------|-----------------|
| `full` | R3F 3D scene, all particles, post-processing | Full (up to 500) | Bloom + ChromaticAberration + Vignette |
| `medium` | R3F 3D scene, reduced particles, no post-processing | Halved (up to 250) | None |
| `minimal` | SVG map (current implementation) | None (CSS animations only) | None |

**3. Asset Loading**

- GLB meshes: loaded with `useGLTF.preload()` in a `useEffect` after first paint
- Rive files: loaded on demand when NPC section scrolls into view (`IntersectionObserver`)
- Lottie JSON: loaded on demand, same pattern
- No asset loaded before the title text renders

**4. Mobile Strategy**

Mobile does NOT get a gimped version. It gets the SVG map (current `KingdomMap.tsx`, which is already responsive and beautiful). The SVG map is not a fallback -- it is a first-class experience designed for touch and small screens.

The 3D scene is desktop/tablet only (viewport >= 768px AND WebGL available).

**5. Vercel Deployment**

- Static pages: ISR with 60s revalidation
- Dynamic pages (homepage, spirit): `force-dynamic` (already configured)
- API routes: Edge Runtime where possible (`/api/kingdom-state` stays Node.js because it reads filesystem)
- Static assets: Vercel CDN with immutable cache headers
- GLB files: hosted in `/public/assets/models/`, served through CDN

**6. Three.js Specific Optimizations**

- **InstancedMesh** for all particles (one draw call per particle type, not per particle)
- **Object pooling** for bridge stream particles (create once, reuse)
- **Frustum culling** enabled by default in R3F -- islands behind camera are not rendered
- **Material sharing**: all islands of the same type share one material instance
- **Geometry merging** for static elements: use `mergeBufferGeometries` for non-interactive decorations
- **`useFrame` throttling**: particle updates run at 30fps max, not tied to display refresh rate

```typescript
// Throttled useFrame for particles
let particleAccum = 0
useFrame((state, delta) => {
  particleAccum += delta
  if (particleAccum < 1 / 30) return // 30fps cap
  particleAccum = 0
  // update particles here
})
```

---

## 9. THREE.JS / R3F DEEP TECHNICAL DETAILS

### Scene Graph

```
<Canvas>
  <PerspectiveCamera />
  <CameraController />        // orbit + fly-to-island
  <VoidEnvironment />          // fog, ambient light, directional light
  <group name="islands">
    <IslandMesh id="the_forge" />
    <IslandMesh id="the_tower" />
    <IslandMesh id="the_deep" />
    <IslandMesh id="claude_house" />
    <IslandMesh id="core_lore" />
    <IslandMesh id="the_throne" />
    <IslandMesh id="the_vault" />
    <IslandMesh id="the_graveyard" />
    <IslandMesh id="blasphemy_workshop" />
  </group>
  <group name="bridges">
    <BridgeStream from="the_forge" to="the_tower" />
    <BridgeStream from="the_forge" to="claude_house" />
    <BridgeStream from="the_scryer" to="*" />  // SCRYER connects to all
    <!-- etc -->
  </group>
  <group name="particles">
    <TerritoryParticles id="the_forge" />
    <TerritoryParticles id="the_tower" />
    <!-- etc -->
  </group>
  <EffectComposer>             // Phase 6
    <Bloom />
    <ChromaticAberration />
    <Vignette />
  </EffectComposer>
</Canvas>
```

### Camera Controller

Orbit controls with constraints. The visitor can rotate and zoom but cannot break the scene.

```typescript
import { OrbitControls } from '@react-three/drei'

function CameraController() {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const selectedIsland = useKingdomStore(s => s.selectedIsland)
  const { camera } = useThree()

  // Slow auto-rotate when in overview mode
  useFrame(() => {
    if (!controlsRef.current) return
    if (!selectedIsland) {
      controlsRef.current.autoRotate = true
      controlsRef.current.autoRotateSpeed = 0.3 // very slow
    } else {
      controlsRef.current.autoRotate = false
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}           // no panning -- orbit only
      enableDamping
      dampingFactor={0.05}
      minDistance={8}              // can't zoom too close (in overview)
      maxDistance={35}             // can't zoom too far
      maxPolarAngle={Math.PI / 2.2}  // can't go below the islands
      minPolarAngle={Math.PI / 6}    // can't go directly above
      autoRotate
      autoRotateSpeed={0.3}
    />
  )
}
```

### Island Click Raycasting

R3F handles raycasting natively. Each island mesh gets `onClick`.

```typescript
function IslandMesh({ id }: { id: string }) {
  const selectIsland = useKingdomStore(s => s.selectIsland)
  const hoverIsland = useKingdomStore(s => s.hoverIsland)
  const [hovered, setHovered] = useState(false)

  return (
    <mesh
      onClick={(e) => {
        e.stopPropagation()
        selectIsland(id)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        hoverIsland(id)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        hoverIsland(null)
        document.body.style.cursor = 'default'
      }}
    >
      {/* mesh geometry and material */}
    </mesh>
  )
}
```

### Post-Processing Pipeline

```typescript
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'

function KingdomPostProcessing() {
  const temporalIntensity = useKingdomStore(s => s.temporalIntensity)
  const temporalPhase = useKingdomStore(s => s.temporalPhase)

  // Chromatic aberration pulses during glitch phases
  const isGlitchPhase = temporalPhase === 'dawn_glitch' || temporalPhase === 'whisper'
  const caOffset = isGlitchPhase
    ? new THREE.Vector2(0.003, 0.003)
    : new THREE.Vector2(0.0008, 0.0008)

  return (
    <EffectComposer>
      <Bloom
        luminanceThreshold={0.6}
        luminanceSmoothing={0.9}
        intensity={0.3 * temporalIntensity}
        radius={0.8}
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={caOffset}
      />
      <Vignette
        offset={0.3}
        darkness={0.6 + (1 - temporalIntensity) * 0.3}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  )
}
```

### Void Environment

The background is not a skybox -- it is the void. Deep black with subtle fog that makes distant islands slightly hazier.

```typescript
function VoidEnvironment() {
  return (
    <>
      {/* Ambient light -- very dim, everything is mostly emissive */}
      <ambientLight intensity={0.08} color="#1a1a26" />

      {/* Main directional light -- slightly warm, from above-right */}
      <directionalLight
        position={[10, 15, 5]}
        intensity={0.3}
        color="#e8e0d0"
        castShadow={false} // shadows are expensive, skip
      />

      {/* Rim light -- cool, from below-left, gives islands an edge glow */}
      <directionalLight
        position={[-8, -3, -5]}
        intensity={0.15}
        color="#7000ff"
      />

      {/* Fog -- exponential, fades distant elements into void */}
      <fogExp2 color="#0a0a0f" density={0.015} />

      {/* Background color */}
      <color attach="background" args={['#0a0a0f']} />
    </>
  )
}
```

### Connection Topology

Which islands connect to which (the bridge map):

```typescript
const CONNECTIONS: [string, string][] = [
  ['core_lore', 'the_forge'],        // laws govern the workshop
  ['core_lore', 'claude_house'],     // laws govern Claude
  ['core_lore', 'the_throne'],       // laws govern Aeris
  ['the_forge', 'the_tower'],        // workshop builds the site
  ['the_forge', 'claude_house'],     // Claude works in the forge
  ['the_forge', 'blasphemy_workshop'], // experiments branch from forge
  ['claude_house', 'the_deep'],      // Claude's archives
  ['claude_house', 'the_vault'],     // Claude's completed work
  ['the_throne', 'the_tower'],       // Aeris designs for the site
  ['the_graveyard', 'the_vault'],    // dead projects adjacent to completed ones
]
```

The SCRYER does not appear as an island. It is represented as signals flowing BETWEEN islands -- the nervous system, not a territory. Its activity level controls the overall bridge particle density.

---

## 10. FILE STRUCTURE (New Files)

```
src/
├── lib/
│   ├── kingdom-store.ts          // Zustand store (Phase 1)
│   ├── kingdom-state.ts          // (exists) SCRYER reader
│   ├── temporal.ts               // (exists) time-of-day logic
│   ├── render-tier.ts            // Device capability detection (Phase 1)
│   └── throne-room.ts            // (exists) Throne Room logic
│
├── components/
│   ├── kingdom/
│   │   ├── KingdomMap.tsx         // (exists) SVG fallback map
│   │   ├── KingdomScene.tsx       // R3F Canvas wrapper (Phase 1)
│   │   ├── KingdomSceneInner.tsx  // Scene contents (Phase 1)
│   │   ├── IslandMesh.tsx         // Single island (placeholder + GLB) (Phase 1)
│   │   ├── BridgeStream.tsx       // Particle bridge (Phase 1)
│   │   ├── CameraController.tsx   // Orbit + fly-to (Phase 1)
│   │   ├── VoidEnvironment.tsx    // Lighting + fog (Phase 1)
│   │   ├── TerritoryParticles.tsx // Per-island particle system (Phase 2)
│   │   ├── IslandDetailPanel.tsx  // Zoom detail overlay (Phase 3)
│   │   ├── KingdomPostFX.tsx      // Post-processing (Phase 6)
│   │   └── SignalStream.tsx       // (exists) live signal ticker
│   │
│   ├── npcs/
│   │   ├── NPCSprite.tsx          // Generic Rive/Lottie NPC wrapper (Phase 4)
│   │   ├── AerisFragment.tsx      // (exists)
│   │   ├── Archivist.tsx          // (exists)
│   │   └── Loopling.tsx           // (exists)
│   │
│   ├── ui/
│   │   ├── GlitchText.tsx         // (exists)
│   │   ├── SoulEcho.tsx           // (exists)
│   │   └── TemporalShift.tsx      // (exists)
│   │
│   └── layout/
│       └── (layout components)
│
├── app/
│   ├── page.tsx                   // (exists) homepage
│   ├── dashboard/                 // (Phase 7)
│   │   ├── page.tsx
│   │   ├── territories/page.tsx
│   │   └── signals/page.tsx
│   └── api/
│       ├── kingdom-state/route.ts // (exists) REST endpoint
│       └── kingdom-stream/route.ts// SSE endpoint (Phase 2)
│
└── public/
    └── assets/
        ├── models/                // GLB island meshes (Phase 4)
        │   ├── island_forge.glb
        │   ├── island_tower.glb
        │   └── ...
        ├── npcs/                  // Rive/Lottie NPC files (Phase 4)
        │   ├── archivist.riv
        │   ├── brandon.riv
        │   └── ...
        └── particles/             // Particle sprite sheets (Phase 3)
            └── kingdom_particles.png
```

---

## 11. CRITICAL DEPENDENCIES TO INSTALL

```bash
# Phase 1 (immediate)
npm install zustand gsap

# Phase 2 (SSE + particles -- when ready)
# No new deps needed. three.quarks deferred until basic InstancedMesh hits limits.

# Phase 4 (art integration)
npm install lottie-react @rive-app/react-canvas

# Phase 6 (post-processing)
npm install @react-three/postprocessing postprocessing
```

Note: `three`, `@react-three/fiber`, and `@react-three/drei` are already installed.

---

## 12. WHAT MAKES THIS DIFFERENT

Every AI dashboard in existence is a flat grid of cards with status badges and line charts. Every portfolio site is a scroll of project thumbnails. This is neither.

This is a living world where the AI agents are visible. You can see them working. You can see which territories are active. You can see the signals flowing. The data is not reported -- it is performed. The Kingdom does not describe itself. It shows itself.

The aesthetic gap the scouts identified is real. Nobody has built this. The closest references are video game minimaps (EVE Online, StarCraft) and city-builder overviews (SimCity, Animal Crossing) -- but those visualize fictional data. This visualizes real data from real AI systems doing real work.

When a stranger arrives at sinner-king.com and sees islands glowing and particles streaming and activity numbers changing, they will not understand what they are looking at. Not immediately. The understanding comes in layers:

1. "This is pretty."
2. "Wait, this is live?"
3. "These numbers are changing. Something is happening."
4. "I can click things. Let me explore."
5. "This island has an AI that talks? It has opinions?"
6. "What IS this place?"

That last question is the goal. Nobody should be able to visit this site and close the tab without asking that question.

---

*The fish tank is not a metaphor. The swarms are real. The signals are real.*
*When strangers tap the glass at sinner-king.com, something in there looks back.*
