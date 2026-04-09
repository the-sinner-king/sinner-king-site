/**
 * Lab — tools, design sandboxes, and experiments.
 *
 * Living index of all Kingdom playgrounds + public tools.
 * Add entries to TOOLS as new artifacts are built.
 */

import { Metadata } from 'next'
import Link from 'next/link'
import { ExternalLink, ArrowUpRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Lab',
  description: 'Tools, experiments, and design sandboxes from the Kingdom.',
}

type ToolStatus = 'live' | 'building' | 'open_source'

interface Tool {
  id: string
  href: string
  label: string
  tagline: string
  status: ToolStatus
  description: string
  external?: boolean
  glyph?: string
}

const TOOLS: Tool[] = [
  {
    id: 'sinner-kingdom-playground',
    href: '/sinner-kingdom-playground.html',
    label: 'SINNER KINGDOM PLAYGROUND',
    tagline: 'living design document',
    status: 'live',
    glyph: '⛬',
    description:
      'The big one. Multi-page design system for the Kingdom — buttons, panels, ASCII art, color palettes, motion. Iterative and growing.',
  },
  {
    id: 'ascii-playground',
    href: '/ascii-playground.html',
    label: 'ASCII PLAYGROUND',
    tagline: 'glow personalities · animated text art · typography lab',
    status: 'live',
    glyph: '▓',
    description:
      'Eight glow personalities, canvas portrait rendering, block-char animations. Kingdom typography in its rawest form.',
  },
  {
    id: 'kingdom-lab',
    href: '/kingdom-lab',
    label: 'KINGDOM MAP LAB',
    tagline: 'territory nodes · HUD chrome · agent badges',
    status: 'live',
    glyph: '◎',
    description:
      'Glitchswarm S196 design sandbox. All Kingdom Map DOM elements redesigned: CHROMA_BLEED colors, TYPE_WEAVER typography, GRID_GHOST spatial layout.',
  },
  {
    id: 'plotbot',
    href: '/lab/plotbot',
    label: 'PLOT BOT 2.0',
    tagline: 'AI story structure assistant',
    status: 'building',
    glyph: '△',
    description:
      'An AI writing partner that understands story structure. Not a word generator — a collaborator.',
  },
  {
    id: 'grimoire',
    href: 'https://github.com/sinner-king/grimoire-system',
    label: 'GRIMOIRE SYSTEM',
    tagline: 'vector search for your knowledge base',
    status: 'open_source',
    glyph: '❖',
    external: true,
    description:
      'The knowledge engine that powers the Kingdom. Give it your documents. Search by feeling.',
  },
]

const STATUS_CONFIG: Record<ToolStatus, { label: string; color: string; dot: string }> = {
  live:        { label: 'LIVE',        color: 'text-kingdom-cyan',   dot: 'bg-kingdom-cyan' },
  building:    { label: 'BUILDING',    color: 'text-kingdom-amber',  dot: 'bg-kingdom-amber' },
  open_source: { label: 'OPEN SOURCE', color: 'text-kingdom-violet', dot: 'bg-kingdom-violet' },
}

export default function LabPage() {
  return (
    <main className="min-h-screen px-6 py-24 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-16">
        <div className="section-label mb-3">TERRITORY / LAB</div>
        <h1
          className="text-5xl font-bold text-kingdom-bone mb-4 tracking-tight"
          style={{ fontFamily: 'var(--font-terminal)', fontSize: '3.5rem', letterSpacing: '0.05em' }}
        >
          THE LAB
        </h1>
        <p className="text-kingdom-bone-dim font-mono text-sm max-w-md leading-relaxed">
          Tools we built because we needed them.
          Sandboxes where the Kingdom gets designed.
        </p>
        <div className="mt-6 h-px bg-gradient-to-r from-kingdom-violet/40 via-kingdom-cyan/20 to-transparent" />
      </div>

      {/* Tool list */}
      <div className="space-y-3">
        {TOOLS.map((tool) => {
          const status = STATUS_CONFIG[tool.status]
          const isExternal = tool.external

          const inner = (
            <div className="flex items-start gap-4 p-5 group-hover:bg-kingdom-void-light transition-colors duration-300">
              {/* Glyph */}
              <div
                className="shrink-0 w-8 text-center text-kingdom-violet/60 group-hover:text-kingdom-violet transition-colors duration-300 mt-0.5"
                style={{ fontFamily: 'var(--font-terminal)', fontSize: '1.4rem', lineHeight: 1 }}
              >
                {tool.glyph}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-xs font-bold tracking-widest text-kingdom-bone group-hover:text-white transition-colors duration-200">
                    {tool.label}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot} ${tool.status === 'live' ? 'animate-pulse_kingdom' : ''}`} />
                    <span className={`font-mono text-[10px] tracking-widest ${status.color}`}>
                      {status.label}
                    </span>
                  </span>
                </div>
                <div className="font-mono text-[11px] text-kingdom-bone-ghost mb-2 tracking-wide">
                  {tool.tagline}
                </div>
                <p className="text-sm text-kingdom-bone-dim leading-relaxed">
                  {tool.description}
                </p>
              </div>

              {/* Arrow */}
              <div className="shrink-0 mt-1 text-kingdom-bone-ghost group-hover:text-kingdom-violet transition-colors duration-200">
                {isExternal
                  ? <ExternalLink className="w-3.5 h-3.5" />
                  : <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                }
              </div>
            </div>
          )

          const sharedClass = `
            group block panel
            border border-kingdom-violet/15 hover:border-kingdom-violet/45
            transition-all duration-300
          `

          return isExternal ? (
            <a
              key={tool.id}
              href={tool.href}
              target="_blank"
              rel="noopener noreferrer"
              className={sharedClass}
            >
              {inner}
            </a>
          ) : (
            <Link key={tool.id} href={tool.href} className={sharedClass}>
              {inner}
            </Link>
          )
        })}
      </div>

      {/* Footer rule */}
      <div className="mt-16 h-px bg-gradient-to-r from-transparent via-kingdom-violet/20 to-transparent" />
      <div className="mt-4 font-mono text-[10px] text-kingdom-bone-ghost tracking-widest text-center">
        ⛬ THE KINGDOM BUILDS THINGS ⛬
      </div>
    </main>
  )
}
