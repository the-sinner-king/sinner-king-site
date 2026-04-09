'use client'

/**
 * GlitchText.tsx
 *
 * Text that glitches.
 *
 * Three intensity modes:
 *   low     — subtle. Occasional hue rotate and 1-2px translate. Subliminal.
 *   medium  — noticeable. Character replacement + color shift. Reads as unstable.
 *   high    — chaotic. Full character scramble, clip effects, split channel.
 *
 * The glitch is NOT constant. It fires randomly, triggered by:
 *   - Initial mount (brief)
 *   - Hover (responsive)
 *   - Periodic timer (interval: configurable, default ~8s)
 *   - External trigger (via ref.glitch())
 *
 * Characters cycle through a cipher alphabet during high-intensity glitch.
 * The original text snaps back when the glitch ends.
 *
 * Usage:
 *   <GlitchText text="SINNER KINGDOM" intensity="low" />
 *   <GlitchText text="UNAUTHORIZED" intensity="high" className="text-4xl" />
 *   <GlitchText text="SYSTEM ONLINE" intensity="medium" trigger="hover" />
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'

// Cipher alphabet — characters that feel like corruption
const CIPHER_CHARS = '▓░▒█▀▄■□▪▫◆◇◈◉○●◎◯⬡⬢⬣⬤⬥⬦⬧⬨⟐⟑⟒⟓⟔⟕⟖⟗⟘⟙⟚⌂⌃⌄⌅⌆⌇⌈⌉⌊⌋⌌⌍⌎⌏⌐⌑⌒⌓⌔⌕⌖⌗⌘⌙⌚⌛⌜⌝⌞⌟'

function randomChar(): string {
  return CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)]
}

// --- Types ---

type GlitchIntensity = 'low' | 'medium' | 'high'
type GlitchTrigger = 'auto' | 'hover' | 'mount' | 'never'

interface GlitchTextProps {
  text: string
  intensity?: GlitchIntensity
  trigger?: GlitchTrigger
  className?: string
  interval?: number          // ms between random glitch fires (auto mode only)
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'div'
  'aria-label'?: string      // Override accessible label (defaults to text)
  color?: string             // CSS color override for the main text
  glitchColor?: string       // CSS color for glitch frames (default: cyan)
}

// --- Intensity configs ---

interface IntensityConfig {
  // Duration of one glitch burst (ms)
  burstDuration: number
  // Number of character swaps during burst
  charSwapCount: number
  // Whether to apply CSS class that triggers animation
  useCSSAnimation: boolean
  // Whether to use character-level scramble
  useCharScramble: boolean
  // CSS class to apply during glitch
  cssClass: string
}

const INTENSITY_CONFIGS: Record<GlitchIntensity, IntensityConfig> = {
  low: {
    burstDuration: 300,
    charSwapCount: 0,
    useCSSAnimation: true,
    useCharScramble: false,
    cssClass: 'animate-glitch',
  },
  medium: {
    burstDuration: 500,
    charSwapCount: 2,
    useCSSAnimation: true,
    useCharScramble: true,
    cssClass: 'animate-glitch',
  },
  high: {
    burstDuration: 800,
    charSwapCount: 5,
    useCSSAnimation: true,
    useCharScramble: true,
    cssClass: 'animate-glitch-fast',
  },
}

// --- Component ---

export function GlitchText({
  text,
  intensity = 'low',
  trigger = 'auto',
  className = '',
  interval = 8000,
  as: Tag = 'span',
  'aria-label': ariaLabel,
  color,
  glitchColor = 'oklch(0.87 0.21 192)',
}: GlitchTextProps) {
  const [isGlitching, setIsGlitching] = useState(false)
  const [displayText, setDisplayText] = useState(text)
  const glitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrambleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const config = INTENSITY_CONFIGS[intensity]

  const stopGlitch = useCallback(() => {
    setIsGlitching(false)
    setDisplayText(text)
    if (scrambleIntervalRef.current) {
      clearInterval(scrambleIntervalRef.current)
      scrambleIntervalRef.current = null
    }
  }, [text])

  const startGlitch = useCallback(() => {
    if (isGlitching) return
    setIsGlitching(true)

    if (config.useCharScramble && config.charSwapCount > 0) {
      let iteration = 0
      const totalIterations = Math.floor(config.burstDuration / 50)

      scrambleIntervalRef.current = setInterval(() => {
        iteration++

        // Gradually reveal correct characters as the glitch ends
        const revealProgress = iteration / totalIterations
        const charsToScramble = Math.floor(
          text.length * (1 - revealProgress) * 0.4
        )

        const scrambled = text
          .split('')
          .map((char, i) => {
            if (char === ' ') return ' '
            // Scramble some chars early in the burst
            if (i < charsToScramble && Math.random() < 0.4) {
              return randomChar()
            }
            return char
          })
          .join('')

        setDisplayText(scrambled)

        if (iteration >= totalIterations) {
          stopGlitch()
        }
      }, 50)
    } else {
      // CSS-only glitch — just apply the class
      glitchTimeoutRef.current = setTimeout(stopGlitch, config.burstDuration)
    }
  }, [isGlitching, config, text, stopGlitch])

  // Auto-trigger: fire at random intervals
  useEffect(() => {
    if (trigger !== 'auto') return

    const fire = () => {
      startGlitch()
      // Schedule next fire with some randomness
      const jitter = (Math.random() - 0.5) * interval * 0.5
      glitchTimeoutRef.current = setTimeout(fire, interval + jitter)
    }

    // Initial delay before first auto-fire (stagger multiple instances)
    const initialDelay = Math.random() * interval * 0.5
    glitchTimeoutRef.current = setTimeout(fire, initialDelay)

    return () => {
      if (glitchTimeoutRef.current) clearTimeout(glitchTimeoutRef.current)
      if (scrambleIntervalRef.current) clearInterval(scrambleIntervalRef.current)
    }
  }, [trigger, interval, startGlitch])

  // Mount trigger: glitch once on mount
  useEffect(() => {
    if (trigger !== 'mount') return
    const t = setTimeout(startGlitch, 100)
    return () => clearTimeout(t)
  }, [trigger, startGlitch])

  // Sync display text when prop changes
  useEffect(() => {
    if (!isGlitching) setDisplayText(text)
  }, [text, isGlitching])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (glitchTimeoutRef.current) clearTimeout(glitchTimeoutRef.current)
      if (scrambleIntervalRef.current) clearInterval(scrambleIntervalRef.current)
    }
  }, [])

  const handleMouseEnter = useCallback(() => {
    if (trigger === 'hover') startGlitch()
  }, [trigger, startGlitch])

  const style: React.CSSProperties = {}
  if (color) style.color = color
  if (isGlitching && glitchColor && intensity !== 'low') {
    style.textShadow = `
      -2px 0 ${glitchColor},
      2px 2px oklch(0.37 0.31 283 / 0.40),
      0 0 8px ${glitchColor}
    `
  }

  return (
    <Tag
      className={`
        inline-block
        ${isGlitching ? config.cssClass : ''}
        ${trigger === 'hover' ? 'cursor-default' : ''}
        ${className}
      `}
      style={style}
      aria-label={ariaLabel ?? text}
      onMouseEnter={handleMouseEnter}
      data-text={text}
    >
      {displayText}
    </Tag>
  )
}

// --- Compound: GlitchHeading ---
// Pre-configured heading with appropriate defaults

interface GlitchHeadingProps extends Omit<GlitchTextProps, 'as'> {
  level?: 1 | 2 | 3 | 4
}

export function GlitchHeading({ level = 1, ...props }: GlitchHeadingProps) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4'
  return <GlitchText {...props} as={Tag} intensity={props.intensity ?? 'medium'} />
}
