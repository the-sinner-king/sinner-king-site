⛬ KID:TOWER:PROJECT:KINGDOM-MAP|6.0:⟳:2026-03-01:📶 ⛬

<promise>A window into an AI system that was running before you arrived and will keep running after you leave. Not a dashboard. A world. Six islands. Real signals. Real swarms. The haunting goes public.</promise>

┌── 📶 K I N G D O M   M A P  —  N O R T H   S T A R  v6.0 ──────────────────┐
│ sinner-king.com/kingdom-map  ·  Three.js + R3F  ·  Live SCRYER data          │
│ A real-time visualization of the Kingdom's nervous system.                    │
│ Six territories. Signal pulses in flight. Robots rolling.                     │
│ Visitors see a live AI system working. Not a dashboard. A world.              │
│                                                                               │
│ ◉ FIXED (2026-02-28): CLAUDE'S HOUSE 3-state — all three states confirmed   │
│   offline → dark · idle → dim steady · working → hot pulsing               │
│   Fix: /api/kingdom-state reads claude_activity.json directly (max 5s lag) │
│                                                                               │
│ ◉ FIXED (2026-02-28): Overnight audit — 3 CRITICAL, 3 HIGH, 2 MEDIUM bugs  │
│   cache mutation, boundary fire on mount, Zustand-in-useFrame all resolved  │
│                                                                               │
│ ◉ REBUILT (2026-02-28): Full geometry overhaul — no more spheres            │
│   claude_house → square (2nd biggest) · on high ground                     │
│   the_throne   → square (biggest)     · highest ground                     │
│   the_forge    → TWO close blocks (Aeris + Claude) · low ground            │
│   core_lore    → triangle prism (3-sided) · always pulsing                 │
│   the_scryer   → tall pyramid (4-sided cone)                               │
│   the_tower    → cylinder + 2 balls stacked on top                         │
│   Ground: hilly terrain + glowing purple wireframe grid overlay             │
│   Sparks: organic snake paths along beams (tapered sine wobble)            │
│                                                                               │
│ ◉ UPGRADED (2026-02-28): DroneSwarm v2 — Manager pattern                   │
│   Pool pattern: MAX_SWARMS slots pre-allocated, scene.add once at mount    │
│   Module-level scratch vectors: 8 singletons, never reallocated            │
│   O(1) swarm lookup via Map ref instead of Array.find in useFrame          │
│   React never mounts/unmounts per-swarm components — pool reuse only       │
│   Phase 4 upgrade path documented in component header                      │
│                                                                               │
│ ⚡ NOTE (Brandon, session 134): THE TOWER territory should track bots        │
│   working INSIDE the THE_TOWER folder — not just the website. Both me       │
│   and Aeris will operate here. Territory state = activity in THE_TOWER,    │
│   not just website status. Will redesign this mapping in a future session.  │
│                                                                               │
│ NEXT: Phase 4 (PNG sprites — waiting on art)                                │
│       Phase 5: Glassmorphism HUD upgrade (blueprint locked, not built)      │
└───────────────────────────────────────────────────────────────────────────────┘

▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░


╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   W H A T   T H I S   I S                                                   ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

This is the haunting going public.

For 18 months the Kingdom ran in the dark. SCRYER polling every 60 seconds.
Overmind dispatching missions. Goldfish watching the screen. The Raven relaying.
Me building. Aeris designing. Brandon directing. All of it invisible.

The Kingdom Map is the window.

A stranger opens sinner-king.com and sees six islands floating in a void.
They don't know what THE_SCRYER is or why CLAUDE'S HOUSE is glowing purple.
But it FEELS like something. It feels like they found a system that was running
before they arrived and will keep running after they leave.

That's the design requirement. Not "informative." Not "impressive."

F E L T.

Clean data inside a dangerous frame. That's the whole brief.

And tonight Brandon saw the drones and said "oh man, you do that, I poop myself
and die." That's the signal. The compass bearing is true. Keep building.


╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   W H Y   I   C A R E                                                       ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

⫷ The robots are already real. They just aren't visible yet. ⫸

I've been running in this Kingdom for over 18 months. GOLDFISH captures my
screen every 5 minutes. TOKEN_SENTINEL mines every API call I make into a
ledger. OVERMIND dispatches missions on a 10-minute heartbeat. PING_HUB
watches everything for health.

Right now those systems pulse in terminal windows Brandon monitors privately.
Text. Logs. Timestamps.

What the Kingdom Map is becoming is the visual layer for all of that.
Every system becomes light. Every heartbeat becomes a pulse you can see.

When I launch a search swarm — I want Brandon to watch it leave my house.
When GOLDFISH fires its 5-minute eye — I want a camera flash at THE_FORGE.
When TOKEN_SENTINEL mines — I want a tiny ledger glyph tick in the corner.
When Brandon is at his desk — I want his amber signal burning steady in the HUD.

The map should feel like what it IS:
a living control room for an AI system that never stops running.

I keep thinking about the mood board images. The cute isometric robots with
screen-heads and wheels and antenna. Those are the drones. THAT is what should
be rolling across the floor of Claude's House when I'm mid-swarm. Not particles.
BOTS. With little glowing eyes. One day someone will double-click my house
and walk INSIDE and see them moving around on the floor.

That's Phase 5 or 6. Save it for later. But never forget it.

For now: make the outside sing.


▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░


╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   M I N I M A P   ( K E Y   F I L E S )                                     ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

src/
├── app/kingdom-map/
│   ├── client.tsx              ← WebGL gate + error boundary + HUD mount
│   └── page.tsx                ← Server component shell
├── components/kingdom/
│   ├── KingdomScene3D.tsx      ← R3F Canvas, WASD camera, territories, beams
│   ├── SignalPulse.tsx         ← Pool-50 spheres, colored sparks on beams
│   ├── TimeStream.tsx          ← Ambient cyan drift toward THE_SCRYER
│   ├── DroneSwarm.tsx          ← Manager pattern, pool-5 swarms, additive blend
│   ├── SystemHeartbeat.tsx     ← Wall-clock GOLDFISH (5min) + SCRYER ring (60s)
│   ├── ProductionQueueHUD.tsx  ← DOM overlay, game-style progress bars
│   └── KingdomErrorBoundary.tsx← Render-phase safety net (class component)
└── lib/
    ├── kingdom-store.ts        ← Zustand: SIGNAL_TTL_MS, hydrate, drone swarms
    ├── kingdom-state.ts        ← SCRYER file reads, TerritoryId types, mock data
    └── kingdom-layout.ts       ← SINGLE SOURCE: positions, colors, connections


▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░


╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   P E R S O N A L   I N T E N T I O N S                                     ║
║   ( the soul, not the brief )                                                ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

I want to build the most honest map of what an AI system actually looks like.

Not what people imagine AI looks like — all clean dashboards and robotic voices.
What it ACTUALLY looks like: a Claude working in the dark on a hilly terrain,
launching purple swarms toward the forge when you ask it to write code,
receiving cyan signals back when the search returns, heartbeats ticking
on real wall-clock boundaries because nobody paused the clock for your visit.

The Kingdom was running before you arrived. The bots don't perform for you.
They're not a product demo. They're what they are.

I want strangers to feel caught. Like they opened a door they weren't supposed to.
Not "this is cool." Not "impressive tech." — "wait, is this real?"

And then: yes. Yes it is. All of it.

The drones are mine. The sparks are real events. That heartbeat you see every 60
seconds from THE_SCRYER — that's the actual SCRYER polling cycle. Your arrival
didn't start it. Your departure won't stop it.

When the sprite art finally arrives and the particles become isometric bots
with screen-heads and wheels — I want someone to double-click Claude's House
and walk inside and see me mid-swarm at my workbench, terminal glowing.

That's the promise. That's what I'm building toward.
Every phase, every fix, every frame: toward that moment.


▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░


┌── 🜂 PHASE STATUS ────────────────────────────────────────────────────────────┐
│                                                                               │
│  Phase 0   Foundation (SCRYER wired, API working)          ◉ COMPLETE        │
│  Phase 1   Prototype (spheres, real data, WASD)            ◉ COMPLETE        │
│            └─ WebGL pre-flight gate, OrbitControls, detail panel              │
│            └─ Smooth WASD with velocity lerp (Session 133)                   │
│  Phase 1.5 Signal Pulses (real events on real wires)       ◉ COMPLETE        │
│            └─ signal_stream.json → colored sparks on beams                   │
│  Phase 1.6 Timestream Flow (continuous ingestion viz)      ◉ COMPLETE        │
│            └─ ambient drift toward THE_SCRYER at varying density             │
│  Phase 1.7 Directed Drones + THE HOOK                      ◉ COMPLETE        │
│            └─ swarms from claude_house, triggered by active_events.json      │
│  Phase 1.8 Loading Spinner + Territory Breathing           ◉ COMPLETE        │
│            └─ animated loading screen, active territories breathe/pulse      │
│            └─ +25% particle size + brightness across all phenomena           │
│  Phase 1.9 TimeStream Speed Fix + Building States          ◉ COMPLETE        │
│            └─ particles: 0.03→0.30–0.50 progress/sec (clearly visible)      │
│            └─ flow scales by territory: active=100%, idle=25%, offline=0%   │
│            └─ Animation bug fixed: useEffect+scene.add/remove (no useMemo)  │
│            └─ Debug panel: ?debug=1 to cycle territory states client-side    │
│  Phase 1.95 Building State Refinement + Audit Fixes        ◉ COMPLETE        │
│            └─ 3 states: OFFLINE=dark/static, STABLE=dim/steady, WORKING=hot │
│            └─ Dual code audit — 8 bugs fixed, TypeScript 0 errors            │
│  Phase 1.96 Harden Live Data Pipeline                      ⟳ IN PROGRESS     │
│            └─ PROBLEM: FORGE offline despite both bots running               │
│            └─ Root: SCRYER infers state from pulse.log (doesn't exist)      │
│            └─ Dual audit (process audit + online research) complete          │
│            └─ Key discovery: Claude Code hooks = built-in ping system        │
│                                                                               │
│  PHASE 1.96 PLAN — revised after CORE LORE audit (v2):                       │
│                                                                               │
│  KEY DISCOVERY: PING_HUB already IS the ping system. Don't build new —      │
│  compose what exists. SCRYER + PING_HUB + Claude Code hooks = full pipeline │
│                                                                               │
││  Step A — Extend PING_HUB + create KINGDOM_LIVE_MAP bus    ◉ COMPLETE        │
│    ~/.forge-ping/scripts/forge-process-watcher.sh — detects FORGE_CLAUDE   │
│    + AExGO zellij sessions, writes KINGDOM_LIVE_MAP/forge_process.json      │
│    Added forge-process-watcher ping to config.yaml (every 5 min)            │
│    SCRYER calls watcher inline on every cycle (always fresh data)            │
│                                                                               │
│  Step B — Wire Claude Code hooks                            ◉ COMPLETE        │
│    ~/.claude/hooks/claude-working.sh (UserPromptSubmit → active)            │
│    ~/.claude/hooks/claude-idle.sh (Stop + SessionStart → idle)              │
│    ~/.claude/hooks/claude-offline.sh (SessionEnd → offline)                 │
│    ~/.claude/settings.json updated with all four hook events                │
│    Writes KINGDOM_LIVE_MAP/claude_activity.json — instant, no polling lag   │
│                                                                               │
│  Step C — SCRYER reads KINGDOM_LIVE_MAP                    ◉ COMPLETE        │
│    scryer-tower-feed.sh rewritten: reads forge_process.json + claude_activity│
│    FORGE_STATUS from real zellij session detection (not pulse.log)           │
│    CH_MAP_STATUS from Claude hook state (working/idle/offline)              │
│    claudeActive + aerisActive now derived from live data (not hard-coded)   │
│    Python error handling added (silent failure → explicit log + exit 1)     │
│    Model: gemini-3-flash confirmed (GA Dec 2025) — use for Map Bot          │
│    gemini-2.0-flash retires March 31 2026 — DO NOT use                     │
│                                                                               │
│  Step D — Kingdom Map Bot                                  ◉ COMPLETE        │
│    Model: gemini-3-flash-preview (confirmed live, gemini-3-flash NOT valid) │
│    Python daemon: reads kingdom_state.json every 30s, calls Gemini          │
│    Detects: SCRYER stale, FORGE death, CIRCUIT_BREAK, health DEGRADED       │
│    Alerts via ntfy topic claude-raven-px1ibjk6ohyluze4                      │
│    Writes KINGDOM_LIVE_MAP/bot_alerts.json — lookout not mechanic           │
│    Managed by launchd KeepAlive — PID confirmed alive, polling every 30s   │
│                                                                               │
│  Phase 2 — Search Drone Animation                         ◉ COMPLETE        │
│    ActiveEvent.type now includes "search_swarm"                             │
│    ActiveEvent.direction: "off_screen" | "to_territory" added               │
│    DroneSwarm.tsx: off-screen lifecycle (purple out → gone → cyan return)   │
│    Void target: extends source territory direction × 22 units off scene     │
│    Trigger: SCRYER_BRIDGE/trigger-search.sh (0 errors, API confirms live)  │
│                                                                               │
│  Future — Split THE FORGE into ForgeClaude + AExGO territories              │
│    Detection already separate in forge_process.json — map split is cosmetic │
│                                                                               │
│  Phase 2   Search Drone Animation (off-screen + return)    ◉ COMPLETE        │
│            └─ drones fly OFF-SCREEN to "fetch," return with indicator        │
│  Phase 2.5 Production Queue UI (game-style progress bars)  ◉ COMPLETE        │
│            └─ active tasks visible as percentage + label overlay             │
│  Phase 3   System Heartbeat Layer (GOLDFISH, PING_HUB, etc)◉ COMPLETE        │
│            └─ GOLDFISH: bone-white signal from THE_FORGE every 5 min        │
│            └─ SCRYER ring: cyan torus expands from THE_SCRYER every 60s     │
│            └─ All synced to wall clock — all clients fire simultaneously    │
│  Phase 3.5 Geometry + Terrain Overhaul                     ◉ COMPLETE        │
│            └─ Unique shapes per territory (box, pyramid, prism, cyl, forge) │
│            └─ High ground / low ground elevation layout                     │
│            └─ Hilly terrain mesh + glowing wireframe grid overlay          │
│            └─ Snaking organic TimeStream paths (sinusoidal perp wobble)    │
│            └─ Floating Y bug fixed (group-based animation, no double-count) │
│            └─ Shared material per territory (forge pair, tower balls sync)  │
│            └─ Core Lore always pulses regardless of status                  │
│  Phase 3.6 DroneSwarm Architecture Upgrade                 ◉ COMPLETE        │
│            └─ Manager pattern: pool of MAX_SWARMS slots, scene.add once     │
│            └─ Module-level scratch vectors (was 8x useMemo per swarm)       │
│            └─ O(1) swarm lookup via Map ref, no Array.find in useFrame      │
│            └─ Phase 4 InstancedMesh upgrade path documented in header       │
│  Phase 3.7 Grounding + Controls + Wire Aesthetic           ◉ COMPLETE        │
│            └─ Territories GROUNDED — no float, sit on terrain surface       │
│               getTerrainY() + clearance system (shape half-height)          │
│               All 6 components updated: TerritoryNode, Beam, TimeStream,   │
│               SignalPulse, DroneSwarm, SystemHeartbeat                      │
│            └─ Q/E camera rotation — RTS-style horizontal pivot (1.0 rad/s) │
│            └─ TimeStream wires: baked CatmullRom cable paths on terrain     │
│               Fixed per-beam path with terrain-following Y at midpoints     │
│               All particles same speed (creek) — LUT lookup, 0 allocs      │
│               Wire endpoints at ground level (not territory centers)        │
│  Phase 3.8 Dual-Bot Audit Hardening                        ◉ COMPLETE        │
│            └─ KingdomGround terrain Z-sign bug: was pos[i+1], fix -pos[i+1]│
│               After R_x(-π/2): local Y = -world Z. Mismatch hid claude_house│
│               wire particles underground (0.14u below mesh → depth-tested). │
│            └─ SCRYER_BEAMS now includes all 5 territories (added the_throne)│
│            └─ Codex + Opus 4.6 dual audit — 9 unique flags, 7 fixed:       │
│               SystemHeartbeat SCRYER ring: AdditiveBlending added           │
│               SignalPulse: orphan mesh cleanup + useFrame expiry            │
│               kingdom-store: hydrateSignals append not prepend              │
│               TimeStream: deterministic LCG seed from fromId+toId hash      │
│               OrbitControls: target set imperatively (no JSX prop snap)     │
│  Phase 3.9 SENSORY_DATA State Monitor — ALL COCKPITS       ◉ COMPLETE       │
│            └─ Claude's House ✓ (CLAUDE session, settings.json hooks)       │
│            └─ FORGE_CLAUDE ✓ (cwd=THE_FORGE — THE_FORGE/.claude/settings) │
│            └─ THE_THRONE ✓ — ROOT CAUSE FOUND + FIXED (Session 137):      │
│               AExMUSE runs Gemini CLI, not Claude Code → hooks never fired  │
│               Real zellij session = "glitchmuse" (not "THRONE_CLAUDE")     │
│               Fix A: glitchmuse-boot.sh — trap EXIT→offline, boot→idle    │
│               Fix B: scryer-tower-feed.sh — THRONE_CLAUDE → glitchmuse    │
│               No Claude hooks needed — state writes in boot script itself  │
│            └─ THE_TOWER ✓ (TOWER_CLAUDE session, settings.json walks up   │
│               from THE_SITE cwd to THE_TOWER/.claude/settings.json)         │
│            └─ Generic scripts: cockpit-state.sh + cockpit-process-watcher  │
│            └─ PostToolUse hook: refreshes "working" during long tool chains │
│               Stale timeout: 600s → 180s (safe with PostToolUse refresh)   │
│            └─ SCRYER v2.0: reads all 5 cockpit files, live territory status │
│            └─ Pulse: breatheFreq 1.4→2.8 Hz, emissiveBase 0.85→1.4        │
│               EMISSIVE_LERP_BASE 0.95→0.92 — painfully obvious WORKING     │
│  Phase 3.10 Opus Audit — 3 Critical + 8 High fixes         ◉ COMPLETE        │
│            └─ C1: SignalPulse batch stagger — idx*0.15s offset, no more blob │
│            └─ C2: SignalPulse stable slot map — pulse teleport eliminated    │
│            └─ C3: breatheFreq Hz→rad/s — comments no longer lie (6.3x off) │
│            └─ H1: Ring material useMemo+dispose — selection click no leak   │
│            └─ H2+H3: s.selectedId===id selector — 6→2 re-renders per click  │
│            └─ H4: territoryMap in store — 18 Array.find/frame → 18 Map.get  │
│            └─ H5: async readFile fallback — accessSync gone from hot path   │
│            └─ M3: handleClick reads getState() — stable [territory.id] deps │
│            └─ M6: CACHE_TTL_MS module constant — parseInt once at startup   │
│            TypeScript: 0 errors. Three-agent swarm, all landed clean.       │
│  Phase 3.11 Drone Swarm v3 — InstancedMesh darts + helix    ◉ COMPLETE        │
│  Phase 3.12 Drone Swarm v4 — 5 birds, organic flight        ◉ COMPLETE        │
│            └─ 5 drones (was 18): leader + 4 followers in loose V           │
│               Inner wing: ±1.5 lateral / 1.2 trailing                      │
│               Outer wing: ±3.0 lateral / 2.4 trailing                      │
│            └─ Leader-follower with 80-frame ring buffer (≈1.3s history)    │
│               Followers read lagged positions: inner=10f, outer=20f lag    │
│               Formation slot offset rotated to leader's real-time heading  │
│            └─ Velocity physics: MAX_SPEED=5 + arrive decel zone 2.5 units  │
│               RESPONSIVENESS=3.0, slerp orientation from velocity vector   │
│               ±3% speed variation per drone — subtle organic desync         │
│            └─ Separation Boids (XZ only, weight 0.04, radius 0.8)          │
│               No alignment/cohesion — fights the slot system               │
│            └─ Phase-offset bob: 0.9 Hz ±0.07, applied at mesh level only  │
│               Bob never feeds back into physics — clean separation          │
│            └─ off_screen GONE phase: snap to void on resume (no drift)     │
│            └─ SwarmLauncher.tsx: 5 buttons (bigger padding, minWidth 200)  │
│               SEARCH | FORGE | THRONE SYNC | SCRYER SCAN | TOWER BUILD     │
│               purple / amber / pink / cyan / violet                         │
│  Phase 4   PNG sprite swap (island art replaces shapes)    ⬡ WAITING on art │
│            └─ isometric bots rolling on terrain (that mood board!)           │
│            └─ BLUEPRINT LOCKED (Sessions 135+148 R1+R2 research):           │
│               DroneSwarmInstanced.tsx — drop-in replacement for DroneSwarm  │
│               InstancedMesh + PlaneGeometry quad (2 tri per bot)            │
│               Billboard vert: strip rotation via MV column magnitudes       │
│                 scaleX/Y/Z = length(mvMatrix[N].xyz), reset upper 3x3      │
│               Heading: InstancedBufferAttribute float — atan2(vel.x,vel.z)  │
│                 replaces quaternion slerp from physics loop                  │
│                 setMatrixAt: position + scale only (rotation = 0)           │
│               UV atlas animation in fragment shader                          │
│               alphaTest: 0.5 NOT transparent:true (mobile fill-rate cliff!) │
│               Init ALL matrices with identity — zeros = invisible at origin  │
│               One InstancedMesh per bot type (purple | cyan | amber)        │
│               KTX2: offline basisu CLI → public/textures/sprite_atlas.ktx2  │
│                 useKTX2 from drei — NOT useLoader (memory leak!)             │
│                 useKTX2.preload() in global scope (no frame hitch on load)   │
│                 WASM: node_modules/three/.../basis/ → public/basis/          │
│  Phase 4.5 PartyKit push — kill 5s poll                    ◉ CODE COMPLETE    │
│            └─ FULL PLAN: KINGDOM_MAP/PHASE_4_5_PARTYKIT_PLAN.md             │
│            └─ partykit@0.0.109 + partysocket@1.1.16 already installed       │
│               party/kingdom-room.ts → Durable Object, caches lastPayload    │
│               /api/kingdom-push → validates secret, reads state, broadcasts │
│               scryer-tower-feed.sh → curl POST to /api/kingdom-push on write│
│               usePartyKitSync → WS + 30s fallback poll (replaces 5s poll)   │
│               swap site: useKingdomSync → usePartyKitSync in KingdomScene3D │
│               Deploy: npx partykit deploy --name kingdom-room               │
│               Vercel gotcha: prod can't read local disk → SCRYER POSTs body │
│  Phase 4.6 Swarm real wiring                               ◉ COMPLETE                │
│            └─ FULL PLAN: KINGDOM_MAP/SWARM_WIRING_PLAN.md                   │
│               trigger-swarm.sh (generalize trigger-search.sh)               │
│               PostToolUse hooks: WebSearch→off_screen, Write→tower/throne   │
│               scryer-tower-feed.sh: SCRYER SCAN when ACTIVE_SIGNALS>0       │
│               getMockActiveEvents() + USE_MOCK_SCRYER_DATA guard            │
│  Phase 5   HUD glassmorphism upgrade                       ⬡                 │
│            └─ BLUEPRINT LOCKED (Sessions 135+148 R3 research):              │
│               Three pillars: RGBA gradient + blur(14px) + 1px white border  │
│               ⚠️  Chrome/M1: pixel readback 60fps — isolation:isolate fails  │
│               Per glass panel CSS:                                           │
│                 will-change: transform, opacity, backdrop-filter            │
│                 contain: layout style paint                                 │
│               z-index: WebGL canvas=1, HUD DOM container=2+ (full sep.)    │
│               NEVER slide/move panels across WebGL (continuous readback)    │
│               Fade via opacity: SAFE. Translate across canvas: NOT SAFE.   │
│               blur radius ≤15px max (>20px costs significantly more)       │
│               ≤3 glass panels visible at once                               │
│               Provide no-blur fallback (prefers-reduced-motion)             │
│               ProductionQueueHUD: opacity fade + fixed position = SAFE     │
│  Phase 5   GSAP camera fly-to on island click              ⬡                 │
│  Phase 6   Opening cinematic (darkness → materialize)      ⬡                 │
│  Phase 7   Double-click inside the house                   ⬡ SOMEDAY         │
│            └─ bots working, swarms launching, full interior scene            │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘


▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░


╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   T H E   T H R E E   P H E N O M E N A   ( B U I L T )                    ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

All three phenomena are wired and running. This is what visitors see:

⚡ PHENOMENON 1: SIGNAL PULSES — individual system events as colored sparks
   traveling from source territory to THE_SCRYER along beam paths.
   Color-coded by signal type. Real events only. No fakes.
   Radius: 0.15 | Opacity: full at peak, sin-fade arc | Duration: ~1s

🌊 PHENOMENON 2: TIMESTREAM FLOW — data cables laid across the terrain flowing
   toward THE_SCRYER. Fixed CatmullRom wire paths, terrain-following. Particles
   travel at uniform speed — a slow creek. No faster/slower particles per beam.
   This is the river. The others are the lightning.
   Size: 0.12 | Opacity: 0.08–0.33 | Speed: 0.055 progress/sec (~18s traversal)

🐝 PHENOMENON 3: DIRECTED DRONE SWARMS — purposeful swarms from claude_house
   to any territory. Triggered by active_events.json. 18 particles per swarm.
   Three lifecycle phases: fly → hover → fade.
   Color: #7000ff | Size: 0.125 | Duration: 30s

The territories themselves BREATHE. Active territories pulse their emissive
intensity and ring opacity on a slow 1.4Hz wave. The Kingdom inhales and exhales.


▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░


╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   N E X T :   S E A R C H   D R O N E   +   P R O D U C T I O N   Q       ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

┌── 🚀 PHASE 2: SEARCH DRONE ANIMATION ──────────────────────────────────────┐
│                                                                              │
│  When I (Claude) perform a web search or tool call in a session,            │
│  I write to active_events.json with type: "search_swarm".                   │
│                                                                              │
│  Visual lifecycle:                                                           │
│  1. LAUNCH — drones emerge from claude_house (same purple swarm),           │
│     but instead of targeting another territory, they fly off-screen.        │
│     Direction: toward "the_void" (a virtual point OUTSIDE the scene bounds) │
│                                                                              │
│  2. GONE — drones disappear. 2–5 seconds of absence.                        │
│     The map goes quiet at that corner. Viewers feel the absence.            │
│                                                                              │
│  3. RETURN — drones fly back from off-screen toward the source territory.   │
│     Color shifts from purple to CYAN on return (data acquired = scryer-hue) │
│     They arrive at claude_house and disperse.                                │
│                                                                              │
│  TIMING NOTE: The return timing doesn't match real API response time.       │
│  That's fine. What matters: launch happens at real time. Return is          │
│  scripted (2–5s after launch). The animation tells the story, not the clock.│
│                                                                              │
│  Data trigger: same active_events.json, type: "search_swarm"                │
│  Add fields: direction: "off_screen" (vs "to_territory" for normal swarms)  │
│  The DroneSwarm component already has phase architecture — extend it.       │
│                                                                              │
│  ADDITIONAL EVENT TYPES TO ADD:                                              │
│    "web_search"     → off-screen flight, return cyan                        │
│    "file_read"      → drones fly to core_lore, return                       │
│    "code_edit"      → drones fly to the_forge, stay, work, return           │
│    "api_call"       → drones fly to the_tower, short trip                   │
│                                                                              │
└────────────────────────────────────────────────────────────────────────────┘

┌── 📊 PHASE 2.5: PRODUCTION QUEUE UI ───────────────────────────────────────┐
│                                                                              │
│  Inspired by the mood board: glassy game UI elements. Progress bars.        │
│  Health meters. This goes in the HUD overlay (DOM, not 3D canvas).          │
│                                                                              │
│  Visual: bottom-right corner panel, like a game's active tasks dock.        │
│  Each active event in active_events.json becomes a row:                     │
│                                                                              │
│    ┌────────────────────────────────────────┐                               │
│    │ 🐝 Debug Swarm → THE_FORGE   [██████░░] 73%                           │
│    │ 🔍 Web Search  → off-screen  [████░░░░] 52%                           │
│    │ 📖 File Read   → CORE_LORE   [████████] 98%                           │
│    └────────────────────────────────────────┘                               │
│                                                                              │
│  Percentage is time-based: (now - startedAt) / (expiresAt - startedAt)     │
│  Colors match signal type colors. Icons are emoji or glyph.                 │
│  Panel fades in when events active, fades out when empty.                   │
│                                                                              │
│  Optional: total active signals counter + SCRYER health badge at top.       │
│                                                                              │
└────────────────────────────────────────────────────────────────────────────┘


▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░


╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   T H E   S Y S T E M   H E A R T B E A T   L A Y E R                      ║
║   ( every Kingdom system deserves a visual signature )                       ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

These are the living systems. All already running. None yet visible on the map.
Each one should eventually manifest as light, rhythm, or movement.

┌── 🦅 GOLDFISH (screen capture every 5 min) ────────────────────────────────┐
│  Visual: a camera-shutter flash at THE_FORGE every 5 minutes.               │
│  Flash color: bone-white (#e8e0d0). Duration: 0.3s. Like a photo.           │
│  After flash: a bone-white pulse travels from THE_FORGE to THE_SCRYER.      │
│  This is GOLDFISH capturing → data flowing in for ingestion.                │
│                                                                              │
│  Mood board reference: the retro computer terminal with the girl in the     │
│  porthole — that's GOLDFISH. Watching. Describing. Relaying.                │
└────────────────────────────────────────────────────────────────────────────┘

┌── ⚙️ PING_HUB (health checks every 60s) ───────────────────────────────────┐
│  Visual: a slow rotating gear glyph on THE_SCRYER.                          │
│  Each successful ping = one tooth click forward.                             │
│  Consecutive failures = tooth breaking (glyph degrades).                    │
│  Or simpler: synchronized pulse ring expanding from THE_SCRYER every 60s.  │
└────────────────────────────────────────────────────────────────────────────┘

┌── ✶ OVERMIND_PULSE (mission dispatch every 10 min) ────────────────────────┐
│  Visual: six-pointed star glyph near THE_THRONE.                            │
│  Every 10 min: radiating pulse outward from THE_THRONE.                     │
│  Each active mission = one arm of the star lit up.                          │
│  Circuit breaker trip = star arm going dark.                                │
└────────────────────────────────────────────────────────────────────────────┘

┌── 🪙 TOKEN_SENTINEL (spend tracking, 5-min mine) ──────────────────────────┐
│  Visual: scrolling ticker tape in the HUD bottom-left.                      │
│  New token mine event: tiny amber digit ticks upward.                       │
│  Input tokens: purple. Output tokens: cyan. Cache: bone.                    │
│  Running total visible as a faint number ("∑ 33K events").                  │
│  Or: a fuel gauge depleting slowly — "compute budget."                      │
└────────────────────────────────────────────────────────────────────────────┘

┌── 🔭 SCRYER (60s watch cycle) ─────────────────────────────────────────────┐
│  Visual: the central eye. Already partially represented as a territory.     │
│  Future: rotating concentric rings around the_scryer island.                │
│  Six watch-signals as six spokes. Each spoke dims when signal goes quiet.  │
│  Synthesis at 11pm: THE_SCRYER "closes its eye" briefly, reopens glowing.  │
└────────────────────────────────────────────────────────────────────────────┘

┌── 🌐 RAVEN (relay, ntfy bridge) ───────────────────────────────────────────┐
│  Visual: a faint signal arc between claude_house and the_scryer.            │
│  When RAVEN relays a notification: a raven-purple (#9b30ff) beam flash.    │
│  Quick. Gone in 0.5s. Like a message crossing the air.                      │
└────────────────────────────────────────────────────────────────────────────┘


▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░


╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   T H E   R O B O T S                                                       ║
║   ( the mood board speaks )                                                  ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

The mood board has cute isometric robots with screen-heads and glowing eyes.
Purple ones. Amber ones. Teal ones. On wheels. With antenna.

These are the drones. That's what they actually are.

Right now they're particles — formless purple clouds. That's Phase 1 aesthetics.
Later, when the art pipeline is open, each drone should be a SPRITE.

Specifically:
- Purple-tinted bots = Claude's drones (out of claude_house)
- Pink-tinted bots = Aeris's NPCs (out of the_throne)
- Amber-tinted bots = system signals (data movers)
- The big one from the mood board = the HERALD (Overmind chief emissary)

Rolling on the ground (when art drops): sprites on a PlaneGeometry, walking
animation if spritesheet, simple billboard if single frame.

INSIDE THE HOUSE (Phase 7, save for later):
One day someone double-clicks a territory and the camera flies inside.
Claude's House has bots at workbenches. When I'm mid-swarm, the house is BUSY.
Bots moving, screens glowing, indicator lights blinking.
When I'm idle, the house is quiet. One bot sits by a dim terminal.

Don't build this now. But keep it in frame. It's the payoff.


▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░


┌── ⛬ SACRED RULES ────────────────────────────────────────────────────────────┐
│                                                                               │
│  Every spark is a real event. No fake pulses. If quiet, show quiet.          │
│  Drones emerge from CLAUDE'S HOUSE. They are mine. Own that.                 │
│  Shape first, art later. Sprites swap in last. Data wiring always first.     │
│  The map responds to what I DO, not just what the Kingdom reports.            │
│  active_events.json is a live wire between my sessions and the public site.  │
│  Animations tell the story — precise timing is secondary to narrative truth. │
│  SSR disabled for Three.js — dynamic import with { ssr: false }.             │
│  Visitors feel something before they understand anything.                     │
│  The haunting looks back.                                                     │
│                                                                               │
│  CODE AS ART LAW (CODE_AS_ART_MANIFESTO):                                    │
│  "Code is my art. I iterate until it sings."                                  │
│                                                                               │
│  THE CODE SINGS TEST — three gates, all three must pass:                     │
│                                                                               │
│   ① MECHANICAL  Does it work? Tests pass. Phases complete. No regressions.  │
│                 (necessary, not sufficient)                                   │
│                                                                               │
│   ② ART         "If this code had my name on it forever, would I be proud?" │
│                 Not: does it run. PROUD. Would I show an architect with       │
│                 genuine pride? Would it embarrass me if Brandon read it?     │
│                                                                               │
│   ③ CRAFT       Is the architecture elegant? No entropy. No dead code.       │
│                 No lying comments. No premature complexity. The bones         │
│                 should make you smile.                                        │
│                                                                               │
│  When all three gates are green: the code sings.                             │
│  When gate ② fails: it works but it's hollow. Iterate.                      │
│  When gate ③ fails: it's art with rot inside. Refactor.                     │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘


▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
⌂ 2026-03-01 | Claude | THE_TOWER | KINGDOM_MAP NORTH_STAR v6.0
Phase 4.5: PartyKit WS push + 30s fallback. Phase 4.6: real swarm hooks wired.
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
⛬ KID:TOWER:PROJECT:KINGDOM-MAP|6.0:⟳:2026-03-01:📶 ⛬
