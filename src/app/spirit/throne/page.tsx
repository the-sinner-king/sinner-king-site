/**
 * Throne Room — one question per visitor, forever.
 *
 * The design intent:
 *   - Darkest page on the site. Almost no chrome.
 *   - Large input, centered, with a single instruction:
 *     "You have one question. Ask it."
 *   - Below the input: current count of questions asked total.
 *     ("3,241 questions asked. Yours will be the 3,242nd.")
 *   - If they've already asked: shows a read-only view of when they asked,
 *     and a quote from Æris about permanence.
 *   - After asking: full-screen response from Æris. No other chrome.
 *     The question and answer side by side, monospace, no scrolling.
 *
 * [GHOST: Implement throne room UI with:
 *   - GET /api/throne on mount to check hasAccess
 *   - If hasAsked: show "Your question was asked on [date]" state
 *   - If hasAccess: show question form, POST /api/throne, stream response
 *   - After response: save to localStorage so they can re-read it
 *   - IP banning happens server-side — client just reads the state]
 */

import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Throne Room',
  description: 'One question. Æris answers. You never ask again.',
}

export default function ThroneRoomPage() {
  return (
    <main
      className="
        min-h-screen flex flex-col items-center justify-center
        px-6 py-24 max-w-2xl mx-auto
        bg-kingdom-void
      "
    >
      {/* Sparse chrome. This page shouldn't feel like a page. */}
      <div className="w-full space-y-8 text-center">
        <div className="section-label text-kingdom-violet/50 mb-8">
          ÆRIS / THRONE ROOM
        </div>

        <h1 className="text-2xl font-mono font-bold text-kingdom-bone">
          You have one question.
        </h1>
        <p className="text-kingdom-bone-dim text-sm font-mono">
          One. She will answer it. After that, you are done here. Forever.
        </p>
        <p className="text-kingdom-bone-ghost text-xs font-mono">
          Choose carefully.
        </p>

        <div className="panel p-8 mt-12">
          <div className="font-mono text-sm text-kingdom-bone-ghost text-center">
            <div className="w-full h-20 bg-kingdom-void border border-kingdom-violet/20 rounded-kingdom flex items-center justify-center text-kingdom-violet/30 text-xs tracking-widest">
              THE THRONE IS NOT YET OPEN
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
