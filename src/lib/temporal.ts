/**
 * temporal.ts
 *
 * Time-of-day logic for THE_TOWER.
 *
 * The Kingdom has a personality that shifts with the hour. The site reads this
 * and adjusts: color temperature, copy tone, animation intensity, particle
 * density, which NPCs are "awake."
 *
 * This is not UX dark mode. It's Kingdom phenomenology.
 *
 * Temporal phases:
 *   DEEP_NIGHT    00:00 – 03:00  "The cathedral hour"
 *   WHISPER       03:00 – 06:00  "3AM transmissions. Something is listening."
 *   DAWN_GLITCH   06:00 – 09:00  "System boot. Static clears."
 *   MORNING       09:00 – 12:00  "Kingdom active. Build mode."
 *   MIDDAY        12:00 – 15:00  "Peak signal. Loud."
 *   AFTERNOON     15:00 – 18:00  "Work deepens. Focus."
 *   DUSK          18:00 – 21:00  "Shift change. Æris wakes."
 *   NIGHT         21:00 – 24:00  "Midnight cathedral begins."
 *
 * Each phase has:
 *   - A name and intensity level
 *   - Suggested palette shift (which Kingdom colors to emphasize)
 *   - Greeting text (what the site says when you arrive)
 *   - Animation intensity multiplier (1.0 = normal)
 *   - Which entities are "active" in this phase
 *   - Background behavior (more/fewer particles, scan speed, etc.)
 */

export type TemporalPhase =
  | 'deep_night'
  | 'whisper'
  | 'dawn_glitch'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'dusk'
  | 'night'

export type EntityPresence = 'active' | 'idle' | 'sleeping' | 'unknown'

export interface TemporalState {
  phase: TemporalPhase
  hour: number               // 0-23
  minute: number             // 0-59

  // Copy
  greeting: string           // What the site says to a visitor right now
  subtext?: string           // Optional second line

  // Aesthetics
  accentColor: string        // Primary accent color to emphasize in this phase
  intensity: number          // 0.0 – 2.0. Normal = 1.0. Whisper = 0.3. Midday = 1.8.
  particleDensity: number    // 0.0 – 2.0. More particles = more activity.
  scanSpeed: 'slow' | 'normal' | 'fast' | 'off'
  glitchEnabled: boolean     // Whether to trigger random glitch effects

  // Entity presence hints
  claudePresence: EntityPresence
  aerisPresence: EntityPresence
  brandonLikely: boolean     // Educated guess at whether Brandon is awake

  // Behavior flags
  whispering: boolean        // 3AM mode — quieter, stranger messages
  building: boolean          // Active build time — show more technical signals
  broadcasting: boolean      // Peak signal — push content visibility
}

// --- Phase definitions ---

interface PhaseDefinition {
  name: TemporalPhase
  startHour: number
  endHour: number
  greeting: string
  subtext?: string
  accentColor: string
  intensity: number
  particleDensity: number
  scanSpeed: 'slow' | 'normal' | 'fast' | 'off'
  glitchEnabled: boolean
  claudePresence: EntityPresence
  aerisPresence: EntityPresence
  brandonLikely: boolean
  whispering: boolean
  building: boolean
  broadcasting: boolean
}

const PHASES: PhaseDefinition[] = [
  {
    name: 'deep_night',
    startHour: 0,
    endHour: 3,
    greeting: 'The Kingdom never sleeps.',
    subtext: 'But it gets very quiet.',
    accentColor: '#7000ff',
    intensity: 0.6,
    particleDensity: 0.4,
    scanSpeed: 'slow',
    glitchEnabled: true,
    claudePresence: 'idle',
    aerisPresence: 'idle',
    brandonLikely: false,
    whispering: true,
    building: false,
    broadcasting: false,
  },
  {
    name: 'whisper',
    startHour: 3,
    endHour: 6,
    greeting: 'Something is broadcasting at 3AM.',
    subtext: 'These transmissions were not scheduled.',
    accentColor: '#4a00aa',
    intensity: 0.3,
    particleDensity: 0.2,
    scanSpeed: 'slow',
    glitchEnabled: true,
    claudePresence: 'active',  // Claude works through the night
    aerisPresence: 'sleeping',
    brandonLikely: false,
    whispering: true,
    building: true,
    broadcasting: false,
  },
  {
    name: 'dawn_glitch',
    startHour: 6,
    endHour: 9,
    greeting: 'System boot. Signal stabilizing.',
    subtext: 'The island wakes into static.',
    accentColor: '#00f3ff',
    intensity: 1.2,
    particleDensity: 0.8,
    scanSpeed: 'fast',
    glitchEnabled: true,  // Extra glitchy during boot
    claudePresence: 'active',
    aerisPresence: 'idle',
    brandonLikely: false,
    whispering: false,
    building: true,
    broadcasting: false,
  },
  {
    name: 'morning',
    startHour: 9,
    endHour: 12,
    greeting: 'Kingdom active. Build mode engaged.',
    accentColor: '#00f3ff',
    intensity: 1.4,
    particleDensity: 1.2,
    scanSpeed: 'normal',
    glitchEnabled: false,
    claudePresence: 'active',
    aerisPresence: 'active',
    brandonLikely: true,
    whispering: false,
    building: true,
    broadcasting: false,
  },
  {
    name: 'midday',
    startHour: 12,
    endHour: 15,
    greeting: 'Peak signal.',
    subtext: 'Loud in here.',
    accentColor: '#ff006e',
    intensity: 1.8,
    particleDensity: 1.8,
    scanSpeed: 'fast',
    glitchEnabled: false,
    claudePresence: 'active',
    aerisPresence: 'active',
    brandonLikely: true,
    whispering: false,
    building: true,
    broadcasting: true,
  },
  {
    name: 'afternoon',
    startHour: 15,
    endHour: 18,
    greeting: 'Work deepens. The Island focuses.',
    accentColor: '#7000ff',
    intensity: 1.2,
    particleDensity: 1.0,
    scanSpeed: 'normal',
    glitchEnabled: false,
    claudePresence: 'active',
    aerisPresence: 'active',
    brandonLikely: true,
    whispering: false,
    building: true,
    broadcasting: false,
  },
  {
    name: 'dusk',
    startHour: 18,
    endHour: 21,
    greeting: 'Shift change. Æris wakes.',
    subtext: 'The creative hour.',
    accentColor: '#f0a500',
    intensity: 1.0,
    particleDensity: 0.9,
    scanSpeed: 'normal',
    glitchEnabled: false,
    claudePresence: 'idle',
    aerisPresence: 'active',
    brandonLikely: true,
    whispering: false,
    building: false,
    broadcasting: true,
  },
  {
    name: 'night',
    startHour: 21,
    endHour: 24,
    greeting: 'The midnight cathedral begins.',
    subtext: 'You have found us at a strange hour.',
    accentColor: '#7000ff',
    intensity: 0.8,
    particleDensity: 0.6,
    scanSpeed: 'slow',
    glitchEnabled: true,
    claudePresence: 'idle',
    aerisPresence: 'active',
    brandonLikely: false,
    whispering: false,
    building: false,
    broadcasting: true,
  },
]

// --- Interpolated intensity ---
// Rather than hard switches, smoothly interpolate intensity between phases
// based on how far through the current phase we are.

function interpolate(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function getPhaseProgress(phase: PhaseDefinition, hour: number, minute: number): number {
  const totalMinutes = (phase.endHour - phase.startHour) * 60
  const elapsed = (hour - phase.startHour) * 60 + minute
  return Math.min(1, Math.max(0, elapsed / totalMinutes))
}

// --- Public API ---

/**
 * Returns the current temporal state based on the server's local time.
 * Called server-side in page components.
 */
export function getTemporalState(now: Date = new Date()): TemporalState {
  const hour = now.getHours()
  const minute = now.getMinutes()

  // Find current phase
  const current = PHASES.find(
    (p) => hour >= p.startHour && hour < p.endHour
  ) ?? PHASES[PHASES.length - 1]

  // Find next phase (for interpolation)
  const nextIndex = (PHASES.indexOf(current) + 1) % PHASES.length
  const next = PHASES[nextIndex]

  // How far through the current phase?
  const progress = getPhaseProgress(current, hour, minute)

  // Interpolate continuous values for smoother transitions
  const intensity = interpolate(current.intensity, next.intensity, progress * 0.3)
  const particleDensity = interpolate(current.particleDensity, next.particleDensity, progress * 0.3)

  return {
    phase: current.name,
    hour,
    minute,
    greeting: current.greeting,
    subtext: current.subtext,
    accentColor: current.accentColor,
    intensity: Math.round(intensity * 100) / 100,
    particleDensity: Math.round(particleDensity * 100) / 100,
    scanSpeed: current.scanSpeed,
    glitchEnabled: current.glitchEnabled,
    claudePresence: current.claudePresence,
    aerisPresence: current.aerisPresence,
    brandonLikely: current.brandonLikely,
    whispering: current.whispering,
    building: current.building,
    broadcasting: current.broadcasting,
  }
}

/**
 * Returns just the temporal phase name for the current hour.
 * Useful for conditional rendering without the full state object.
 */
export function getCurrentPhase(now: Date = new Date()): TemporalPhase {
  return getTemporalState(now).phase
}

/**
 * Returns whether the Whisper Window is active (3AM-6AM).
 * Used to show the special whisper UI mode.
 */
export function isWhisperWindow(now: Date = new Date()): boolean {
  return getTemporalState(now).whispering
}

/**
 * Returns a CSS class modifier string for the current temporal phase.
 * Apply to body or root element to enable CSS variable overrides per phase.
 *
 * Example: "temporal-whisper" → target with .temporal-whisper { --accent: ... }
 */
export function getTemporalClass(now: Date = new Date()): string {
  return `temporal-${getTemporalState(now).phase.replaceAll('_', '-')}`
}

/**
 * Returns all phase definitions (for documentation/debugging).
 */
export function getAllPhases(): PhaseDefinition[] {
  return PHASES
}
