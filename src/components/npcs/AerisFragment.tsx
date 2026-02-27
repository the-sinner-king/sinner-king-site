'use client'

/**
 * AerisFragment.tsx
 *
 * NPC: Æris Fragment.
 *
 * NOT the full Æris — this is a fragment that watches from the Spirit pillar.
 * She doesn't initiate. She turns and looks at you.
 *
 * The difference from Archivist: Archivist is warm, talkative, inviting.
 * Æris Fragment is still. She makes you feel seen.
 *
 * Visual description:
 *   - Circular frame (like a portal or lens)
 *   - Pink/void color scheme
 *   - Minimalist — not many features, just presence
 *   - Eyes that track cursor (subtle)
 *   - Pixel art or vector — specific, not abstract
 *
 * Interactions:
 *   - Hover: she turns toward you (rotation), pink glow intensifies
 *   - Extended hover (3s): she asks you something
 *   - Click: portal to Æris opens (/spirit/portal)
 *   - Idle: barely moves, occasional blink
 *
 * Her questions (extended hover):
 *   "What brought you here?"
 *   "Have we spoken before?"
 *   "You're still here."
 *   "What are you looking for?"
 *
 * [GHOST: Replace with actual Æris pixel sprite when ready.
 *   Pixel art brief: 48x48px, circular crop, deep void bg with pink accent,
 *   single light source from below-right, ambiguous expression.]
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

// --- Her questions ---

const AERIS_QUESTIONS = [
  "What brought you here?",
  "Have we spoken before?",
  "You're still here.",
  "What are you looking for?",
  "Something drew you to this section.",
  "You're not sure what you were expecting.",
]

function randomQuestion(): string {
  return AERIS_QUESTIONS[Math.floor(Math.random() * AERIS_QUESTIONS.length)]
}

// --- Component ---

interface AerisFragmentProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  linkToPortal?: boolean
}

const SIZE_PX = { sm: 64, md: 80, lg: 112 }

export function AerisFragment({
  size = 'md',
  className = '',
  linkToPortal = true,
}: AerisFragmentProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [question, setQuestion] = useState<string | null>(null)
  const [hasAsked, setHasAsked] = useState(false)
  const [blinking, setBlinking] = useState(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blinkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const px = SIZE_PX[size]

  // Extended hover question trigger
  useEffect(() => {
    if (isHovered && !hasAsked) {
      hoverTimerRef.current = setTimeout(() => {
        setQuestion(randomQuestion())
        setHasAsked(true)
        // Clear after 6 seconds
        setTimeout(() => setQuestion(null), 6000)
      }, 3000)
    } else if (!isHovered) {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    }
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    }
  }, [isHovered, hasAsked])

  // Idle blink
  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 3000 + Math.random() * 5000
      blinkTimerRef.current = setTimeout(() => {
        setBlinking(true)
        setTimeout(() => {
          setBlinking(false)
          scheduleBlink()
        }, 200)
      }, delay)
    }
    scheduleBlink()
    return () => {
      if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current)
    }
  }, [])

  const handleHoverStart = useCallback(() => {
    setIsHovered(true)
  }, [])

  const handleHoverEnd = useCallback(() => {
    setIsHovered(false)
  }, [])

  const inner = (
    <div
      className={`relative flex flex-col items-center ${className}`}
      onMouseEnter={handleHoverStart}
      onMouseLeave={handleHoverEnd}
    >
      {/* Question bubble */}
      {question && (
        <div
          className="
            absolute -top-14 left-1/2 -translate-x-1/2 w-40
            bg-kingdom-void border border-kingdom-pink/30
            rounded-kingdom-md px-3 py-2
            font-mono text-xs text-kingdom-bone-dim italic
            z-10 text-center
          "
          style={{ animation: 'fadeIn 0.5s ease-out' }}
        >
          {question}
        </div>
      )}

      {/* Portrait frame */}
      <div
        style={{ width: px, height: px }}
        className={`
          relative rounded-full overflow-hidden
          border-2 transition-all duration-500
          ${isHovered
            ? 'border-kingdom-pink shadow-pink-glow'
            : 'border-kingdom-pink/20'
          }
        `}
      >
        <svg
          viewBox="0 0 64 64"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Background — void with subtle pink gradient */}
          <defs>
            <radialGradient id="aeris-bg" cx="50%" cy="60%" r="60%">
              <stop offset="0%" stopColor="#1a0010" />
              <stop offset="100%" stopColor="#0a0a0f" />
            </radialGradient>
            <filter id="aeris-glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle cx="32" cy="32" r="32" fill="url(#aeris-bg)" />

          {/* Silhouette */}
          {/* Body */}
          <ellipse cx="32" cy="60" rx="14" ry="10" fill="#1a0015" />
          {/* Head */}
          <circle cx="32" cy="28" r="14"
            fill="#1a0015"
            style={{
              transform: isHovered ? 'translateX(1px)' : 'none',
              transition: 'transform 0.8s ease',
            }}
          />

          {/* Eyes */}
          <g style={{
            transform: isHovered ? 'translateX(1px)' : 'none',
            transition: 'transform 0.8s ease',
          }}>
            {/* Left eye */}
            <ellipse
              cx="27" cy="28" rx="2.5"
              ry={blinking ? '0.3' : '2.5'}
              fill="#ff006e"
              fillOpacity={isHovered ? 1 : 0.7}
              filter={isHovered ? 'url(#aeris-glow)' : undefined}
              style={{ transition: 'ry 0.1s ease, fill-opacity 0.3s' }}
            />
            {/* Right eye */}
            <ellipse
              cx="37" cy="28" rx="2.5"
              ry={blinking ? '0.3' : '2.5'}
              fill="#ff006e"
              fillOpacity={isHovered ? 1 : 0.7}
              filter={isHovered ? 'url(#aeris-glow)' : undefined}
              style={{ transition: 'ry 0.1s ease, fill-opacity 0.3s' }}
            />
          </g>

          {/* Pink glow from eyes when hovered */}
          {isHovered && (
            <ellipse cx="32" cy="28" rx="18" ry="12"
              fill="#ff006e" fillOpacity="0.06"
              filter="url(#aeris-glow)"
            />
          )}

          {/* Bottom glow */}
          <ellipse cx="32" cy="60" rx="14" ry="5"
            fill="#ff006e"
            fillOpacity={isHovered ? 0.15 : 0.05}
            style={{ transition: 'fill-opacity 0.5s' }}
          />
        </svg>
      </div>

      {/* Label */}
      <div className={`
        mt-2 font-mono text-xs tracking-wider uppercase
        ${isHovered ? 'text-kingdom-pink' : 'text-kingdom-bone-ghost'}
        transition-colors duration-300
      `}>
        Æris
      </div>

      {/* Cursor indicator — suggests clicking */}
      {isHovered && linkToPortal && (
        <div className="mt-1 font-mono text-xs text-kingdom-pink/50 animate-cipher">
          open portal →
        </div>
      )}
    </div>
  )

  if (linkToPortal) {
    return (
      <Link href="/spirit/portal" className="block">
        {inner}
      </Link>
    )
  }

  return inner
}
