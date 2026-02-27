/**
 * Plot Bot 2.0 — AI story structure assistant.
 * [GHOST: Build the actual Plot Bot UI here. This is a priority Lab feature.]
 */
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Plot Bot 2.0',
  description: 'An AI writing partner that understands story structure.',
}

export default function PlotBotPage() {
  return (
    <main className="min-h-screen px-6 py-24 max-w-4xl mx-auto">
      <div className="section-label mb-4">LAB / PLOT BOT 2.0</div>
      <h1 className="text-4xl font-bold mb-4 text-kingdom-bone">Plot Bot 2.0</h1>
      <p className="text-kingdom-bone-dim mb-6 max-w-lg">
        An AI writing partner that understands story structure. Not a word generator.
        A collaborator.
      </p>
      <div className="inline-flex items-center gap-2 font-mono text-xs text-kingdom-amber mb-12">
        <div className="w-2 h-2 rounded-full bg-kingdom-amber animate-pulse_kingdom" />
        BUILDING
      </div>
      <div className="panel p-8 text-center font-mono text-sm text-kingdom-bone-ghost">
        [ Plot Bot 2.0 interface — coming to this page ]
      </div>
    </main>
  )
}
