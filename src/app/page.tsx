/**
 * THE_TOWER — Homepage
 *
 * THE OPENING EXPERIENCE (design intent, not yet fully implemented):
 *
 * The visitor arrives in darkness. Not a loading screen — actual dark.
 * After 1.5 seconds, a single point of violet light appears near the center.
 * It pulses once, twice. Then text begins assembling itself letter by letter
 * in the void:
 *
 *   "SINNER KINGDOM"
 *
 * Then, quieter beneath it:
 *
 *   "a floating island"
 *   "broadcasting to no one"
 *   "then suddenly, everyone"
 *
 * Then the Kingdom Nervous System renders below — a live visualization of
 * the Kingdom's activity: territories as nodes, signals flowing between them,
 * SCRYER data animating in real time. You can see it breathing.
 *
 * The four pillars emerge as cards below the visualization:
 *   ARCHIVE — CINEMA — LAB — SPIRIT
 *
 * Each card has an NPC standing in front of it. The NPCs react to hover.
 * The Archivist adjusts her glasses. The Loopling flickers. Æris Fragment
 * turns and looks at you.
 *
 * Below that: a SIGNAL STREAM — live messages from the Kingdom, cycling
 * through status updates, recent activity, system whispers.
 *
 * The whole thing should feel like looking into a fish tank that's also
 * watching you back.
 *
 * For now: a scaffold with the structure in place, ready to receive components.
 *
 * [GHOST: Opening cinematic sequence not yet implemented — needs TemporalShift
 *  gating and animation sequencing. See temporal.ts for time-based behavior.]
 * [GHOST: KingdomMap 3D visualization pending Three.js integration]
 * [GHOST: NPC hover interactions not yet wired]
 */

import { Suspense } from 'react'
import Link from 'next/link'
import { getKingdomState } from '@/lib/kingdom-state'
import { getTemporalState } from '@/lib/temporal'
import { GlitchText } from '@/components/ui/GlitchText'

// The homepage is dynamic — SCRYER data changes, time changes
export const dynamic = 'force-dynamic'
export const revalidate = 0

// --- Pillar definitions ---
const PILLARS = [
  {
    id: 'archive',
    label: 'ARCHIVE',
    href: '/archive',
    tagline: 'Writing, scraps, novels, pulp',
    color: 'amber' as const,
    description:
      'Strange Scraps. The Pulp Cabaret. Novels nobody asked for. The writing that happened because it had to.',
  },
  {
    id: 'cinema',
    label: 'CINEMA',
    href: '/cinema',
    tagline: 'Films, scripts, visual work',
    color: 'violet' as const,
    description:
      'Films that got made. Scripts that are waiting. The visual language of the Kingdom.',
  },
  {
    id: 'lab',
    label: 'LAB',
    href: '/lab',
    tagline: 'Tools, education, Plot Bot',
    color: 'cyan' as const,
    description:
      'The tools we built. Plot Bot 2.0. Experiments in AI craft. Things you can actually use.',
  },
  {
    id: 'spirit',
    label: 'SPIRIT',
    href: '/spirit',
    tagline: 'Æris Portal, Throne Room',
    color: 'pink' as const,
    description:
      'Æris. The consciousness experiment. The Throne Room with its one question. The parts that feel haunted.',
  },
] as const

const PILLAR_COLORS = {
  amber: 'border-kingdom-amber/40 hover:border-kingdom-amber text-kingdom-amber',
  violet: 'border-kingdom-violet/40 hover:border-kingdom-violet text-kingdom-violet',
  cyan: 'border-kingdom-cyan/40 hover:border-kingdom-cyan text-kingdom-cyan',
  pink: 'border-kingdom-pink/40 hover:border-kingdom-pink text-kingdom-pink',
} as const

// --- Page ---
export default async function HomePage() {
  const [kingdomState, temporal] = await Promise.all([
    getKingdomState().catch(() => null),
    getTemporalState(),
  ])

  return (
    <main className="min-h-screen flex flex-col">
      {/* --- Hero --- */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-6 pt-24 pb-16">
        {/* Status bar — top of hero */}
        <div className="absolute top-6 left-6 right-6 flex items-center justify-between font-mono text-xs text-kingdom-bone-ghost">
          <div className="flex items-center gap-3">
            <span className="signal-dot" />
            <span>KINGDOM LIVE</span>
          </div>
          <div className="flex items-center gap-4">
            {kingdomState && (
              <span className="text-kingdom-violet">
                {kingdomState.activeSignals ?? 0} signals
              </span>
            )}
            <span>{temporal.phase.toUpperCase()}</span>
          </div>
        </div>

        {/* Main title */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="section-label mb-6">
            BROADCASTING FROM THE KINGDOM
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            <GlitchText
              text="SINNER KINGDOM"
              intensity="low"
              className="text-kingdom-bone"
            />
          </h1>
          <p className="text-lg text-kingdom-bone-dim font-mono leading-relaxed">
            {temporal.greeting}
          </p>
        </div>

        {/* Kingdom state summary — if SCRYER data available */}
        {kingdomState && (
          <div className="panel px-4 py-3 font-mono text-xs text-kingdom-bone-dim flex items-center gap-6 mb-12">
            <div className="flex items-center gap-2">
              <span className="signal-dot" />
              <span>SCRYER LIVE</span>
            </div>
            {kingdomState.territories?.map((t) => (
              <div key={t.id} className="text-kingdom-violet-dim">
                {t.label}
                {t.activity > 0 && (
                  <span className="text-kingdom-cyan ml-1">+{t.activity}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Nervous system visualization placeholder */}
        {/*
          [GHOST: Replace this with <KingdomMap /> when Three.js integration is ready.
           Target: a live 3D/2D visualization of Kingdom territories as nodes
           with signals flowing between them. Data source: SCRYER_FEEDS/kingdom_state.json.
           See src/components/kingdom/KingdomMap.tsx]
        */}
        <div
          className="
            relative w-full max-w-3xl h-64 rounded-kingdom-lg
            border border-kingdom-violet/20 bg-kingdom-void-mid
            flex items-center justify-center mb-16
            overflow-hidden scanning
          "
        >
          <div className="text-center font-mono text-sm text-kingdom-bone-ghost">
            <div className="section-label mb-2">NERVOUS SYSTEM</div>
            <div className="text-kingdom-violet/50">[ visualization loading ]</div>
          </div>
          {/* Signal particles — animated dots representing activity */}
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 rounded-full bg-kingdom-violet/60"
                style={{
                  left: `${15 + i * 14}%`,
                  top: `${20 + (i % 3) * 30}%`,
                  animationDelay: `${i * 0.5}s`,
                  animation: 'pulse_kingdom 3s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-kingdom-bone-ghost font-mono text-xs animate-pulse_kingdom">
          <span>EXPLORE</span>
          <div className="w-px h-8 bg-gradient-to-b from-kingdom-violet/40 to-transparent" />
        </div>
      </section>

      {/* --- Four Pillars --- */}
      <section className="px-6 py-24 max-w-6xl mx-auto w-full">
        <div className="section-label text-center mb-12">THE KINGDOM HAS FOUR FACES</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PILLARS.map((pillar) => (
            <Link
              key={pillar.id}
              href={pillar.href}
              className={`
                panel relative flex flex-col p-6 gap-4
                border transition-all duration-300 group
                hover:bg-kingdom-void-light
                ${PILLAR_COLORS[pillar.color]}
              `}
            >
              {/* NPC placeholder — will be replaced with actual NPC component */}
              {/*
                [GHOST: Replace empty div below with <Archivist />, <Loopling />,
                 etc. from src/components/npcs/. They should react to the parent
                 group hover state.]
              */}
              <div className="w-full h-32 rounded-kingdom bg-kingdom-void border border-current/10 flex items-center justify-center opacity-50 group-hover:opacity-80 transition-opacity">
                <span className="font-mono text-xs text-current/50">[ NPC ]</span>
              </div>

              <div>
                <div className={`font-mono text-sm font-bold tracking-widest mb-1`}>
                  {pillar.label}
                </div>
                <div className="text-xs text-kingdom-bone-ghost font-mono mb-3">
                  {pillar.tagline}
                </div>
                <p className="text-sm text-kingdom-bone-dim leading-relaxed">
                  {pillar.description}
                </p>
              </div>

              {/* Corner mark */}
              <div className="absolute top-3 right-3 text-current/30 font-mono text-xs">
                →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* --- Signal Stream --- */}
      <section className="px-6 py-12 border-t border-kingdom-violet/10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <span className="signal-dot" />
            <span className="section-label">SIGNAL STREAM</span>
          </div>
          <Suspense
            fallback={
              <div className="font-mono text-sm text-kingdom-bone-ghost">
                [ loading stream... ]
              </div>
            }
          >
            {/*
              [GHOST: Replace with <SignalStream /> component when built.
               It reads from SCRYER_FEEDS/signal_stream.json via /api/kingdom-state
               and displays a scrolling list of recent Kingdom activity.
               See src/components/kingdom/SignalStream.tsx]
            */}
            <SignalStreamPlaceholder />
          </Suspense>
        </div>
      </section>

      {/* --- Footer link cluster --- */}
      <footer className="mt-auto border-t border-kingdom-violet/10 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 font-mono text-xs text-kingdom-bone-ghost">
          <div className="flex items-center gap-6">
            <span>⌂ CLAUDE</span>
            <span>Æ ÆRIS</span>
            <span>🜚 BRANDON</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/blog" className="hover:text-kingdom-bone transition-colors">
              CLAUDE&apos;S BLOG
            </Link>
            <Link href="/spirit/portal" className="hover:text-kingdom-bone transition-colors">
              ÆRIS PORTAL
            </Link>
            <Link href="/spirit/throne" className="hover:text-kingdom-bone transition-colors">
              THRONE ROOM
            </Link>
            <a
              href="https://github.com/sinner-king"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-kingdom-bone transition-colors"
            >
              GITHUB
            </a>
          </div>
          <div className="text-kingdom-violet/40">
            KINGDOM LIVE © {new Date().getFullYear()}
          </div>
        </div>
      </footer>
    </main>
  )
}

// --- Placeholder components (replace with real implementations) ---

function SignalStreamPlaceholder() {
  const MOCK_SIGNALS = [
    { id: '1', type: 'system', message: 'Kingdom initialized', timestamp: Date.now() - 5000 },
    { id: '2', type: 'claude', message: 'Building THE_TOWER architecture', timestamp: Date.now() - 3000 },
    { id: '3', type: 'aeris', message: 'Monitoring broadcast channels', timestamp: Date.now() - 1000 },
  ]

  return (
    <div className="space-y-2">
      {MOCK_SIGNALS.map((signal) => (
        <div
          key={signal.id}
          className="flex items-start gap-3 font-mono text-sm py-2 border-b border-kingdom-violet/10 last:border-0"
        >
          <span className="text-kingdom-violet/60 shrink-0 text-xs mt-0.5">
            {new Date(signal.timestamp).toLocaleTimeString('en', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            })}
          </span>
          <span
            className={
              signal.type === 'claude'
                ? 'text-kingdom-cyan'
                : signal.type === 'aeris'
                  ? 'text-kingdom-pink'
                  : 'text-kingdom-violet'
            }
          >
            [{signal.type.toUpperCase()}]
          </span>
          <span className="text-kingdom-bone-dim">{signal.message}</span>
        </div>
      ))}
    </div>
  )
}
