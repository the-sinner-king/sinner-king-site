'use client'

/**
 * Loopling.tsx
 *
 * NPC: The Loopling.
 *
 * A small creature made of recursive loops. It represents the Kingdom's
 * internal process — the Ralph loops, the iteration, the thing that doesn't
 * stop until it's right. It flickers. It loops.
 *
 * The Loopling is not named — it's named after the concept.
 * It's been described as "a 3D model that could be attached to the cockpit."
 *
 * Visual description:
 *   - Small, abstract, made of glowing lines that loop back on themselves
 *   - Cyan primary color (data stream, active process)
 *   - No clear up or down — it rotates in all three axes
 *   - Occasionally flickers like a process that's mid-execution
 *
 * Interactions:
 *   - Hover: rotation speed increases, brightness increases
 *   - Click: emits a burst of light then returns to idle
 *   - Idle: slow rotation, occasional flicker
 *
 * Stands in front of the Lab pillar.
 *
 * [GHOST: This is the strongest candidate for a Three.js/R3F implementation.
 *   Concept: a torus knot (or custom knot geometry) with emissive cyan material,
 *   slow Y-rotation on idle, fast multi-axis rotation on hover.
 *   Current: SVG placeholder with CSS rotation animation.]
 */

import React, { useState, useCallback } from 'react'

// --- Component ---

interface LooplingProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_PX = { sm: 48, md: 64, lg: 96 }

export function Loopling({ size = 'md', className = '' }: LooplingProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isBursting, setIsBursting] = useState(false)

  const handleClick = useCallback(() => {
    setIsBursting(true)
    setTimeout(() => setIsBursting(false), 600)
  }, [])

  const px = SIZE_PX[size]

  return (
    <div
      className={`relative flex flex-col items-center cursor-pointer ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      {/* The Loopling */}
      <div
        style={{ width: px, height: px }}
        className={`
          relative flex items-center justify-center
          transition-all duration-300
          ${isBursting ? 'scale-125' : isHovered ? 'scale-110' : 'scale-100'}
        `}
      >
        <svg
          viewBox="0 0 64 64"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
          style={{
            animation: isHovered
              ? 'spin 0.8s linear infinite'
              : 'spin 4s linear infinite',
          }}
        >
          <defs>
            <filter id="loopling-glow">
              <feGaussianBlur stdDeviation={isHovered ? '4' : '2'} result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Outer ring */}
          <circle cx="32" cy="32" r="28"
            fill="none"
            stroke="#00f3ff"
            strokeWidth="1.5"
            strokeOpacity={isHovered ? 0.8 : 0.4}
            strokeDasharray="8 4"
            filter={isHovered ? 'url(#loopling-glow)' : undefined}
          />

          {/* Middle ring — counter-rotates via transform */}
          <g style={{ transformOrigin: '32px 32px', transform: 'rotate(45deg)' }}>
            <circle cx="32" cy="32" r="18"
              fill="none"
              stroke="#7000ff"
              strokeWidth="1.5"
              strokeOpacity={isHovered ? 0.9 : 0.5}
              strokeDasharray="12 6"
              filter={isHovered ? 'url(#loopling-glow)' : undefined}
            />
          </g>

          {/* Inner knot — approximate torus knot with bezier curves */}
          <g filter={isHovered ? 'url(#loopling-glow)' : undefined}>
            <path
              d="M32 16 C42 16 48 24 44 32 C40 40 32 40 28 32 C24 24 30 16 32 16"
              fill="none"
              stroke="#00f3ff"
              strokeWidth="2"
              strokeOpacity={isHovered ? 1 : 0.6}
            />
            <path
              d="M32 48 C22 48 16 40 20 32 C24 24 32 24 36 32 C40 40 34 48 32 48"
              fill="none"
              stroke="#7000ff"
              strokeWidth="2"
              strokeOpacity={isHovered ? 1 : 0.6}
            />
          </g>

          {/* Core */}
          <circle cx="32" cy="32" r="3"
            fill={isBursting ? '#e8e0d0' : isHovered ? '#00f3ff' : '#7000ff'}
            fillOpacity={isBursting ? 1 : 0.9}
            filter={isHovered ? 'url(#loopling-glow)' : undefined}
            style={{ transition: 'fill 0.2s' }}
          />

          {/* Burst particles */}
          {isBursting && (
            <>
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
                const rad = (angle * Math.PI) / 180
                const x2 = 32 + Math.cos(rad) * 20
                const y2 = 32 + Math.sin(rad) * 20
                return (
                  <line
                    key={angle}
                    x1="32" y1="32"
                    x2={x2} y2={y2}
                    stroke="#00f3ff"
                    strokeWidth="1"
                    strokeOpacity="0.8"
                  />
                )
              })}
            </>
          )}
        </svg>
      </div>

      {/* Label */}
      <div className={`
        mt-1 font-mono text-xs uppercase tracking-wider
        ${isHovered ? 'text-kingdom-cyan' : 'text-kingdom-bone-ghost'}
        transition-colors duration-300
      `}>
        Loopling
      </div>

    </div>
  )
}
