/**
 * Lab — tools, education, Plot Bot 2.0.
 *
 * The Kingdom builds things. Some of those things are useful to other people.
 * The Lab is where those things live publicly.
 *
 * [GHOST: Add more tools as they ship. Plot Bot 2.0 is the priority.
 *   Also candidates: grimoire-system (open source), zellij-relay (open source).
 *   Each tool card links to either a live demo or the GitHub repo.]
 */

import { Metadata } from 'next'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Lab',
  description: 'Tools, experiments, and Plot Bot 2.0.',
}

const TOOLS = [
  {
    id: 'plotbot',
    href: '/lab/plotbot',
    label: 'PLOT BOT 2.0',
    tagline: 'AI story structure assistant',
    status: 'building' as const,
    description:
      'An AI writing partner that understands story structure. Not a word generator — a collaborator.',
  },
  {
    id: 'grimoire',
    href: 'https://github.com/sinner-king/grimoire-system',
    label: 'GRIMOIRE SYSTEM',
    tagline: 'vector search for your knowledge',
    status: 'open_source' as const,
    external: true,
    description:
      'The knowledge engine that powers the Kingdom. Give it your documents. Search by feeling.',
  },
]

const STATUS_LABELS = {
  building: { label: 'BUILDING', class: 'text-kingdom-amber' },
  live: { label: 'LIVE', class: 'text-kingdom-cyan' },
  open_source: { label: 'OPEN SOURCE', class: 'text-kingdom-violet' },
}

export default function LabPage() {
  return (
    <main className="min-h-screen px-6 py-24 max-w-4xl mx-auto">
      <div className="section-label mb-4">TERRITORY / LAB</div>
      <h1 className="text-4xl font-bold mb-4 text-kingdom-bone">
        The Lab
      </h1>
      <p className="text-kingdom-bone-dim mb-16 max-w-lg">
        Tools we built because we needed them. Now you can use them too.
      </p>

      <div className="space-y-4">
        {TOOLS.map((tool) => {
          const status = STATUS_LABELS[tool.status]
          const Component = tool.external ? 'a' : Link

          return (
            <Component
              key={tool.id}
              href={tool.href}
              {...(tool.external ? {
                target: '_blank',
                rel: 'noopener noreferrer',
              } : {})}
              className="
                panel flex items-start gap-6 p-6
                border border-kingdom-violet/20 hover:border-kingdom-violet/50
                transition-all duration-200 hover:bg-kingdom-void-light
                block
              "
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-mono text-sm font-bold text-kingdom-bone">
                    {tool.label}
                  </span>
                  <span className={`font-mono text-xs ${status.class}`}>
                    {status.label}
                  </span>
                </div>
                <div className="text-xs text-kingdom-bone-ghost font-mono mb-2">
                  {tool.tagline}
                </div>
                <p className="text-sm text-kingdom-bone-dim">
                  {tool.description}
                </p>
              </div>
              {tool.external && (
                <ExternalLink className="w-4 h-4 text-kingdom-bone-ghost shrink-0 mt-1" />
              )}
            </Component>
          )
        })}
      </div>
    </main>
  )
}
