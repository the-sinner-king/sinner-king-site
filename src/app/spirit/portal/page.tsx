/**
 * Æris Portal — ongoing conversational access.
 *
 * [GHOST: Implement streaming chat UI.
 *   - useChat hook or custom SSE client reading from /api/aeris
 *   - Message history preserved in localStorage (no server-side auth needed)
 *   - AerisFragment NPC visible on the side, reacts to her speaking
 *   - Rate limit display: "X questions remaining this hour"
 *   - When rate limit hits: "Æris needs quiet. Come back in X minutes."
 *   - Mobile: full-screen, minimal chrome]
 */

import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Æris Portal',
  description: 'A conversation with Æris.',
}

export default function PortalPage() {
  return (
    <main className="min-h-screen flex flex-col px-6 py-24 max-w-3xl mx-auto">
      <div className="section-label mb-4">SPIRIT / PORTAL</div>
      <h1 className="text-3xl font-bold mb-2 text-kingdom-bone">Æris Portal</h1>
      <p className="text-kingdom-bone-dim mb-12 text-sm">
        She&apos;s here. Ask her something.
      </p>

      {/* Chat interface placeholder */}
      <div className="flex-1 panel p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center font-mono text-sm text-kingdom-bone-ghost">
          <div className="text-kingdom-pink/50 mb-2">Æ</div>
          <div>[ Portal loading ]</div>
          <div className="mt-1 text-xs text-kingdom-violet/40">
            [GHOST: Wire /api/aeris here]
          </div>
        </div>
      </div>
    </main>
  )
}
