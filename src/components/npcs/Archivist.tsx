'use client'

/**
 * Archivist.tsx
 *
 * NPC: The Archivist.
 *
 * Stands in front of the Archive pillar. Keeper of Strange Scraps, the Pulp
 * Cabaret, the novels. Adjusts her glasses. Occasionally quotes something.
 * She has been here longer than anyone can remember.
 *
 * Visual description:
 *   - Tall figure, slightly bent posture (from years over books)
 *   - Round glasses that catch the light
 *   - Ink-stained fingers
 *   - Amber color scheme (archive = history = warmth)
 *   - Holds a large book or scroll
 *
 * Interactions:
 *   - Hover: she adjusts her glasses (animation), amber glow brightens
 *   - Click: she says something from her quote library
 *   - Idle: very slow sway, occasional page-turn gesture
 *
 * Current state: CSS/SVG placeholder, waiting for pixel art or 3D model.
 * The interaction logic and personality are complete.
 *
 * [GHOST: Replace SVG placeholder with actual Archivist sprite or 3D model.
 *   Target: ~64x96px pixel art, amber palette, clear silhouette at small sizes.
 *   Idle animation: 4-frame loop at 2fps (sway + blink).
 *   Hover animation: 3-frame "adjusts glasses" at 8fps.]
 */

import React, { useState, useCallback } from 'react'

// --- Quotes library ---
// She says these when clicked. Drawn from the spirit of the Archive.

const ARCHIVIST_QUOTES = [
  "Strange Scraps. Everything strange eventually becomes a scrap.",
  "The Pulp Cabaret opens at midnight. Or noon. Time is a soft thing here.",
  "Every novel is an argument with reality that reality eventually loses.",
  "I keep the things that didn't fit anywhere else. There's more of those than you'd think.",
  "You can search the Archive by feeling. I designed it that way.",
  "Some of these manuscripts are still breathing.",
  "Brandon was going to throw this away. I convinced him otherwise. I'm good at that.",
  "The strange thing about archives is that they make the impossible permanent.",
]

function randomQuote(): string {
  return ARCHIVIST_QUOTES[Math.floor(Math.random() * ARCHIVIST_QUOTES.length)]
}

// --- Component ---

interface ArchivistProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  interactive?: boolean
}

const SIZE_MAP = {
  sm: { container: 'w-16 h-24', text: 'text-xs' },
  md: { container: 'w-20 h-32', text: 'text-sm' },
  lg: { container: 'w-28 h-44', text: 'text-sm' },
}

export function Archivist({
  size = 'md',
  className = '',
  interactive = true,
}: ArchivistProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [quote, setQuote] = useState<string | null>(null)
  const [adjustingGlasses, setAdjustingGlasses] = useState(false)
  const sizes = SIZE_MAP[size]

  const handleHover = useCallback(() => {
    setIsHovered(true)
    // Trigger glasses adjustment on hover
    setAdjustingGlasses(true)
    setTimeout(() => setAdjustingGlasses(false), 600)
  }, [])

  const handleClick = useCallback(() => {
    if (!interactive) return
    setQuote(randomQuote())
    // Clear quote after 5 seconds
    setTimeout(() => setQuote(null), 5000)
  }, [interactive])

  return (
    <div
      className={`relative flex flex-col items-center ${className}`}
      onMouseEnter={handleHover}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      {/* Quote bubble */}
      {quote && (
        <div
          className="
            absolute -top-16 left-1/2 -translate-x-1/2 w-48
            bg-kingdom-void-mid border border-kingdom-amber/40
            rounded-kingdom-md px-3 py-2
            font-mono text-xs text-kingdom-bone-dim
            z-10 animate-fade-in
            text-center
          "
        >
          <span className="text-kingdom-amber/60 mr-1">&ldquo;</span>
          {quote}
          <span className="text-kingdom-amber/60 ml-1">&rdquo;</span>
          {/* Bubble tail */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-kingdom-amber/40" />
        </div>
      )}

      {/* NPC figure — SVG placeholder */}
      <div
        className={`
          ${sizes.container} relative rounded-kingdom overflow-hidden
          transition-all duration-300
          ${isHovered ? 'filter brightness-110' : ''}
        `}
      >
        <svg
          viewBox="0 0 64 96"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Archivist placeholder shape */}
          <defs>
            <filter id="archivist-glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Body */}
          <rect
            x="22" y="36" width="20" height="40"
            fill={isHovered ? '#a07000' : '#504840'}
            rx="2"
            style={{ transition: 'fill 0.3s' }}
          />

          {/* Head */}
          <circle
            cx="32" cy="24" r="12"
            fill={isHovered ? '#a07000' : '#504840'}
            filter={isHovered ? 'url(#archivist-glow)' : undefined}
            style={{ transition: 'fill 0.3s' }}
          />

          {/* Glasses — animate on hover */}
          <g
            style={{
              transform: adjustingGlasses ? 'translateY(-1px) rotate(3deg)' : 'none',
              transformOrigin: '32px 24px',
              transition: 'transform 0.3s',
            }}
          >
            <rect x="24" y="22" width="7" height="5" rx="2"
              fill="none" stroke="#f0a500" strokeWidth="1.5"
              strokeOpacity={isHovered ? 1 : 0.6}
            />
            <rect x="33" y="22" width="7" height="5" rx="2"
              fill="none" stroke="#f0a500" strokeWidth="1.5"
              strokeOpacity={isHovered ? 1 : 0.6}
            />
            {/* Bridge */}
            <line x1="31" y1="24.5" x2="33" y2="24.5"
              stroke="#f0a500" strokeWidth="1"
              strokeOpacity={isHovered ? 1 : 0.6}
            />
          </g>

          {/* Book */}
          <rect
            x="10" y="50" width="14" height="18"
            fill={isHovered ? '#7000ff' : '#2a2a3a'}
            rx="1"
            style={{ transition: 'fill 0.3s' }}
          />
          <line x1="17" y1="50" x2="17" y2="68" stroke="#f0a500" strokeWidth="0.5" strokeOpacity="0.4" />

          {/* Amber glow at base when hovered */}
          {isHovered && (
            <ellipse cx="32" cy="90" rx="16" ry="4"
              fill="#f0a500" fillOpacity="0.15"
              filter="url(#archivist-glow)"
            />
          )}
        </svg>
      </div>

      {/* Label */}
      <div className={`
        mt-1 font-mono tracking-wider uppercase
        ${sizes.text}
        ${isHovered ? 'text-kingdom-amber' : 'text-kingdom-bone-ghost'}
        transition-colors duration-300
      `}>
        Archivist
      </div>
    </div>
  )
}
