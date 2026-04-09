'use client'

/**
 * TemporalShift.tsx
 *
 * Wraps children and applies time-of-day visual behavior.
 *
 * In WHISPER mode (3AM–6AM): children render quieter, slower, more fragile.
 * In DAWN_GLITCH: extra glitch probability, faster animations.
 * In MIDDAY: full brightness, fast particles, loud colors.
 * In NIGHT/DEEP_NIGHT: muted, deliberate, cathedral pace.
 *
 * How it works:
 *   - Receives temporalState as a prop (from server-side getTemporalState())
 *   - Applies CSS custom property overrides via a wrapper div
 *   - Exposes temporal context via useTemporalContext() for children
 *
 * Usage:
 *   // In a page (server component):
 *   const temporal = await getTemporalState()
 *
 *   // In layout (client boundary):
 *   <TemporalShift state={temporal}>
 *     {children}
 *   </TemporalShift>
 *
 * Children can read temporal state:
 *   const { phase, intensity, whispering } = useTemporalContext()
 */

import React, { createContext, useContext, useMemo } from 'react'
import type { TemporalState, TemporalPhase } from '@/lib/temporal'

// --- Context ---

interface TemporalContextValue extends TemporalState {
  // Derived convenience properties
  isNight: boolean
  isDawn: boolean
  isActive: boolean  // Building/broadcast hours
}

const TemporalContext = createContext<TemporalContextValue | null>(null)

export function useTemporalContext(): TemporalContextValue {
  const ctx = useContext(TemporalContext)
  if (!ctx) throw new Error('useTemporalContext must be used within <TemporalShift>')
  return ctx
}

// --- Phase CSS overrides ---
// These override --kingdom-* CSS variables at the wrapper level.
// Allows phase-specific palette shifts without Tailwind class juggling.

const PHASE_CSS_VARS: Record<TemporalPhase, Record<string, string>> = {
  deep_night: {
    '--temporal-accent': 'oklch(0.37 0.31 283)',
    '--temporal-particle-opacity': '0.3',
    '--temporal-glow-intensity': '0.5',
    '--temporal-scan-speed': '12s',
  },
  whisper: {
    '--temporal-accent': 'oklch(0.27 0.20 283)',
    '--temporal-particle-opacity': '0.15',
    '--temporal-glow-intensity': '0.2',
    '--temporal-scan-speed': '15s',
  },
  dawn_glitch: {
    '--temporal-accent': 'oklch(0.87 0.21 192)',
    '--temporal-particle-opacity': '0.9',
    '--temporal-glow-intensity': '1.2',
    '--temporal-scan-speed': '3s',
  },
  morning: {
    '--temporal-accent': 'oklch(0.87 0.21 192)',
    '--temporal-particle-opacity': '1.0',
    '--temporal-glow-intensity': '1.0',
    '--temporal-scan-speed': '5s',
  },
  midday: {
    '--temporal-accent': 'oklch(0.59 0.25 345)',
    '--temporal-particle-opacity': '1.2',
    '--temporal-glow-intensity': '1.5',
    '--temporal-scan-speed': '2s',
  },
  afternoon: {
    '--temporal-accent': 'oklch(0.37 0.31 283)',
    '--temporal-particle-opacity': '0.9',
    '--temporal-glow-intensity': '1.0',
    '--temporal-scan-speed': '5s',
  },
  dusk: {
    '--temporal-accent': 'oklch(0.75 0.20 65)',
    '--temporal-particle-opacity': '0.8',
    '--temporal-glow-intensity': '0.9',
    '--temporal-scan-speed': '6s',
  },
  night: {
    '--temporal-accent': 'oklch(0.37 0.31 283)',
    '--temporal-particle-opacity': '0.5',
    '--temporal-glow-intensity': '0.7',
    '--temporal-scan-speed': '8s',
  },
}

// --- Phase body classes ---
// Additional class applied to the wrapper element per phase.
// Use for CSS targeting: [data-temporal-phase="whisper"] .something { ... }

const NIGHT_PHASES: TemporalPhase[] = ['deep_night', 'whisper', 'night']
const DAWN_PHASES: TemporalPhase[] = ['dawn_glitch']
const ACTIVE_PHASES: TemporalPhase[] = ['morning', 'midday', 'afternoon']

// --- Component ---

interface TemporalShiftProps {
  state: TemporalState
  children: React.ReactNode
  className?: string
}

export function TemporalShift({ state, children, className = '' }: TemporalShiftProps) {
  const cssVars = PHASE_CSS_VARS[state.phase] ?? {}

  const contextValue: TemporalContextValue = useMemo(() => ({
    ...state,
    isNight: NIGHT_PHASES.includes(state.phase),
    isDawn: DAWN_PHASES.includes(state.phase),
    isActive: ACTIVE_PHASES.includes(state.phase),
  }), [state])

  return (
    <TemporalContext.Provider value={contextValue}>
      <div
        className={`temporal-root ${className}`}
        data-temporal-phase={state.phase}
        data-temporal-intensity={state.intensity}
        data-temporal-whispering={state.whispering}
        style={cssVars as React.CSSProperties}
      >
        {children}
      </div>
    </TemporalContext.Provider>
  )
}

// --- Conditional rendering helpers ---

/**
 * Only renders children during whisper window (3AM-6AM).
 * Use for special late-night content.
 */
export function WhisperOnly({ children }: { children: React.ReactNode }) {
  const { whispering } = useTemporalContext()
  if (!whispering) return null
  return <>{children}</>
}

/**
 * Only renders during active build hours (morning/midday/afternoon).
 */
export function BuildHoursOnly({ children }: { children: React.ReactNode }) {
  const { building } = useTemporalContext()
  if (!building) return null
  return <>{children}</>
}

/**
 * Only renders during broadcast hours (midday/dusk/night).
 */
export function BroadcastOnly({ children }: { children: React.ReactNode }) {
  const { broadcasting } = useTemporalContext()
  if (!broadcasting) return null
  return <>{children}</>
}

/**
 * Renders different content based on whether it's nighttime.
 */
export function NightDay({
  night,
  day,
}: {
  night: React.ReactNode
  day: React.ReactNode
}) {
  const { isNight } = useTemporalContext()
  return <>{isNight ? night : day}</>
}
