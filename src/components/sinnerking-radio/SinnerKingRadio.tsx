'use client'

/**
 * SinnerKingRadio.tsx
 *
 * Pirate radio station broadcasting from the Sinner Kingdom.
 * Synthwave AI covers of songs that shouldn't exist this way.
 *
 * STATUS
 *   Not wired to any live route — self-contained, drop onto any page to activate.
 *
 * FEATURES
 *   - Random track on load (surprise-every-visit via getRandomTrack())
 *   - ASCII frequency visualizer driven by Web Audio API AnalyserNode
 *   - Download button: native <a href download>
 *   - Copy Prompt button: navigator.clipboard — visitor steals the Suno prompt
 *   - Play / pause / next / prev controls
 *   - Auto-advance on track end
 *   - Optional autoPlay prop with deferred gesture fallback
 *
 * WEB AUDIO PIPELINE
 *   AudioContext → createMediaElementSource(audioEl) → AnalyserNode → ctx.destination
 *
 *   createMediaElementSource wires the <audio> element into the Web Audio graph.
 *   The AnalyserNode sits in the middle — it passes audio through to ctx.destination
 *   (speakers) while also exposing getByteFrequencyData() for the visualizer.
 *   AudioContext must be created on first user gesture (browser autoplay policy).
 *   Once created it persists for the component's lifetime — AudioContext is a heavy
 *   OS-level resource and should never be recreated per-track or per-play.
 *   CLEANUP REQUIREMENT: ctxRef.current.close() must be called on unmount.
 *   Unclosed AudioContext leaks an OS audio pipeline — audible as a silent resource
 *   drain on some systems, and flagged by browser DevTools as a resource leak.
 *
 * crossOrigin="anonymous" ON <audio>
 *   Required for createMediaElementSource when audio is served from the same origin
 *   but could be cross-origin in future (Vercel CDN). Without it the browser blocks
 *   the AnalyserNode read as a CORS violation even for same-origin files.
 *
 * ASCII VISUALIZER
 *   128-bin FFT (fftSize=256) → COL_COUNT columns via bin averaging →
 *   ampToAscii() maps amplitude 0-255 to ASCII_CHARS index.
 *   RAF pauses when document.hidden (tab not visible) — no wasted CPU on an
 *   invisible canvas. Resumes when tab becomes visible again.
 *
 * hasAutoplayed REF (per-track scope)
 *   Reset to false on every goToTrack() call so auto-advance works correctly.
 *   A component-lifetime hasAutoplayed would block auto-advance after the first
 *   track completes — each track needs its own independent autoplay attempt.
 *   The ref is only set to true after play() actually resolves — not before —
 *   so rapid switching before the first gesture doesn't permanently silence the radio.
 *
 * isPlayingRef (stable closure pattern)
 *   The visibilitychange listener needs to know whether audio is currently playing
 *   to decide whether to re-arm the RAF on tab-show. If isPlaying state were read
 *   directly as a dep, the effect would re-run on every play/pause toggle, briefly
 *   removing and re-attaching the listener with a gap between them. isPlayingRef
 *   is mutated each render so it's always current without causing effect re-runs.
 *
 * SIDE EFFECTS
 *   AudioContext (long-lived OS resource) — created on first play, closed on unmount.
 *   requestAnimationFrame loop — started on play, cancelled on pause and unmount.
 *   visibilitychange listener — created once, removed on unmount.
 *   'ended' audio listener — added/removed when nextTrack changes (useCallback dep).
 *   'timeupdate', 'durationchange', 'canplaythrough' listeners — mounted once.
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { RADIO_TRACKS, getRandomTrack } from './radio-tracks'
import type { RadioTrack } from './radio-tracks'

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

/** ASCII amplitude scale: space = silence, @ = peak. 10 levels. */
const ASCII_CHARS = ' .:-=+*#%@'

/** Visualizer canvas dimensions (px). */
const CANVAS_W = 260
const CANVAS_H = 72

/**
 * Number of frequency columns in the visualizer.
 * 34 cols × ~7.6px each at CANVAS_W=260 — packed terminal look.
 */
const COL_COUNT = 34

/** Monospace font size for visualizer characters (px). */
const FONT_SIZE = 8

/**
 * Amplitude overdrive multiplier for the visualizer's gradient calculation.
 * Without it, moderate signals only reach '=' even at peak — visually weak.
 * ×4.0 ensures mid-amplitude signals display near-full bars at their apex.
 */
const VISUALIZER_OVERDRIVE = 4.0

/**
 * Bar height sensitivity multiplier. Compensates for the audio.volume reduction
 * (volume=0.05 starves the AnalyserNode — avg amplitude is ~5% of full scale).
 * ×20 ensures the bars fill meaningfully at low playback volume and react
 * visibly to musical dynamics (quiet passages vs loud transients).
 */
const VISUALIZER_SENSITIVITY = 20

/**
 * Web Audio FFT size. Must be a power of 2.
 * fftSize=256 → 128 frequency bins. Minimum resolution giving meaningful
 * frequency separation while keeping getByteFrequencyData calls cheap per frame.
 */
const FFT_SIZE = 256

/**
 * AnalyserNode smoothing — controls how quickly amplitude values decay between frames.
 * 0.72: responsive enough to track musical transients without flickering.
 * Lower → reactive but flickery. Higher → smooth smear, transients invisible.
 */
const ANALYSER_SMOOTHING = 0.72

/**
 * How long the "COPIED" state persists on the Copy Prompt button (ms).
 * Short enough to feel snappy, long enough to be readable.
 */
const COPY_FEEDBACK_DURATION_MS = 1500

/**
 * Territory palette — cycles across visualizer columns for the color-bleed effect.
 * Each color represents a Kingdom domain.
 */
const TERRITORY_COLORS = [
  'oklch(0.37 0.31 283)',  // claude_house — H=283 violet
  'oklch(0.75 0.20 65)',   // the_forge   — H=65 amber
  'oklch(0.59 0.25 345)',  // the_throne  — H=345 pink
  'oklch(0.47 0.27 283)',  // the_tower   — H=283 mid-violet
  'oklch(0.87 0.21 192)',  // the_scryer  — H=192 cyan
  'oklch(0.91 0.02 75)',   // core_lore   — bone
] as const

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Maps a raw FFT amplitude byte (0–255) to an ASCII character index.
 * Clamped to valid ASCII_CHARS bounds.
 */
function ampToAscii(amplitude: number): string {
  const idx = Math.floor((amplitude / 255) * (ASCII_CHARS.length - 1))
  return ASCII_CHARS[Math.max(0, Math.min(ASCII_CHARS.length - 1, idx))]
}

/** Formats a duration in seconds as M:SS. Returns '--:--' for non-finite values. */
function fmt(seconds: number): string {
  if (!isFinite(seconds)) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface SinnerKingRadioProps {
  /** Start on this specific track ID instead of a random one. */
  initialTrackId?: string
  /**
   * Attempt to play on first canplaythrough event.
   * Browser autoplay policy will likely block this — the component arms a deferred
   * gesture listener (pointerdown / keydown / wheel) as a fallback.
   */
  autoPlay?: boolean
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export function SinnerKingRadio({ initialTrackId, autoPlay = false }: SinnerKingRadioProps): React.ReactElement {
  // DOM refs — never trigger re-renders
  const audioRef    = useRef<HTMLAudioElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)

  // Web Audio API refs — long-lived, cleaned up on unmount
  const analyserRef = useRef<AnalyserNode | null>(null)
  const ctxRef      = useRef<AudioContext | null>(null)
  const sourceRef   = useRef<MediaElementAudioSourceNode | null>(null)

  // RAF handle — used to cancel the visualizer loop on pause/unmount
  const rafRef      = useRef<number>(0)

  const [currentTrack, setCurrentTrack] = useState<RadioTrack>(() => {
    if (initialTrackId) {
      return RADIO_TRACKS.find((t) => t.id === initialTrackId) ?? getRandomTrack()
    }
    return getRandomTrack()
  })
  const [isPlaying,  setIsPlaying]  = useState(false)
  const [duration,   setDuration]   = useState(0)
  const [elapsed,    setElapsed]    = useState(0)
  const [copied,     setCopied]     = useState(false)
  const [audioReady, setAudioReady] = useState(false)

  /**
   * Stable ref that mirrors isPlaying state for use inside the visibilitychange
   * listener without adding isPlaying to the listener's effect dependency array.
   * See module-level JSDoc: "isPlayingRef (stable closure pattern)".
   */
  const isPlayingRef = useRef(false)
  isPlayingRef.current = isPlaying

  // ─── VISUALIZER RAF LOOP ──────────────────────────────────────────────────

  const drawVisualizer = useCallback((): void => {
    const canvas   = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    ctx.font = `${FONT_SIZE}px monospace`

    const colW       = CANVAS_W / COL_COUNT
    const binsPerCol = Math.floor(data.length / COL_COUNT)
    const rowCount   = Math.floor(CANVAS_H / FONT_SIZE)

    for (let col = 0; col < COL_COUNT; col++) {
      // Average amplitude across all FFT bins that map to this column's frequency range.
      let sum = 0
      for (let b = 0; b < binsPerCol; b++) {
        sum += data[col * binsPerCol + b]
      }
      const avg     = sum / binsPerCol
      const barRows = Math.min(rowCount, Math.floor((avg / 255) * rowCount * VISUALIZER_SENSITIVITY))

      const color = TERRITORY_COLORS[col % TERRITORY_COLORS.length]
      ctx.fillStyle   = color
      // shadowColor/shadowBlur: each column's glow bleeds outward around its characters.
      // Reset to 0 after the loop — otherwise clearRect on the next frame inherits the glow.
      ctx.shadowColor = color
      ctx.shadowBlur  = 12

      // Draw bottom-up (rowCount-1 is the bottom row, 0 is the top).
      // The gradient: the topmost filled row (bar apex) gets the highest amplitude char.
      // (rowCount - row) grows as row index decreases (closer to top) →
      // higher char index at the apex. VISUALIZER_OVERDRIVE prevents visually weak bars
      // for moderate signals.
      for (let row = rowCount - 1; row >= rowCount - barRows; row--) {
        const char = ampToAscii((avg / rowCount) * (rowCount - row) * VISUALIZER_OVERDRIVE)
        ctx.fillText(char, col * colW, row * FONT_SIZE + FONT_SIZE)
      }
    }

    ctx.shadowBlur = 0  // reset — don't bleed into clearRect next frame

    // Only re-arm the RAF if the tab is visible. visibilitychange handler re-arms
    // when the user returns to the tab.
    if (!document.hidden) {
      rafRef.current = requestAnimationFrame(drawVisualizer)
    }
  }, [])

  // ─── VISIBILITY CHANGE — pause/resume RAF ────────────────────────────────

  // REGRESSION GUARD: isPlaying NOT in deps. See module-level JSDoc.
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current)
      } else if (isPlayingRef.current) {
        rafRef.current = requestAnimationFrame(drawVisualizer)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [drawVisualizer])

  // ─── CLEANUP ON UNMOUNT ───────────────────────────────────────────────────

  // AudioContext and RAF must both be cleaned up — AudioContext is a persistent OS
  // resource. Failure to close leaks a silent audio pipeline.
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    sourceRef.current?.disconnect()
    sourceRef.current  = null
    analyserRef.current = null
    void ctxRef.current?.close()
    ctxRef.current = null
  }, [])

  // ─── AUDIO CONTEXT INIT ───────────────────────────────────────────────────

  /**
   * Creates the AudioContext and wires the pipeline on first play click.
   * Called lazily (not on mount) to comply with browser autoplay policy —
   * AudioContext.resume() requires a user gesture on most browsers.
   *
   * Once created, the context is reused for all subsequent plays/tracks.
   * createMediaElementSource() can only be called once per HTMLAudioElement;
   * the guard `if (ctxRef.current)` prevents re-creation.
   */
  const initAudioContext = useCallback((): void => {
    if (ctxRef.current || !audioRef.current) return

    // Safari ships webkitAudioContext — one-liner cross-browser polyfill.
    const AudioCtx =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioCtx) {
      // Web Audio unavailable (very old browser). Player still works for playback;
      // visualizer canvas stays dark.
      console.warn('[SinnerKingRadio] Web Audio API unavailable — visualizer disabled')
      return
    }

    const ctx      = new AudioCtx()
    const analyser = ctx.createAnalyser()
    analyser.fftSize              = FFT_SIZE
    analyser.smoothingTimeConstant = ANALYSER_SMOOTHING

    // Wire: audioElement → analyser → speakers.
    // The analyser node is transparent to playback — it passes audio through
    // while exposing frequency data via getByteFrequencyData().
    const source = ctx.createMediaElementSource(audioRef.current)
    source.connect(analyser)
    analyser.connect(ctx.destination)

    ctxRef.current    = ctx
    analyserRef.current = analyser
    sourceRef.current = source
  }, [])

  // ─── PLAYBACK CONTROLS ────────────────────────────────────────────────────

  const play = useCallback(async (): Promise<void> => {
    const audio = audioRef.current
    if (!audio) return

    initAudioContext()

    // AudioContext starts 'suspended' — browser autoplay policy requires resume()
    // to be called from within a user gesture handler.
    if (ctxRef.current?.state === 'suspended') {
      await ctxRef.current.resume()
    }

    await audio.play()
    setIsPlaying(true)
    rafRef.current = requestAnimationFrame(drawVisualizer)
  }, [initAudioContext, drawVisualizer])

  const pause = useCallback((): void => {
    audioRef.current?.pause()
    setIsPlaying(false)
    cancelAnimationFrame(rafRef.current)
  }, [])

  const togglePlay = useCallback((): void => {
    isPlaying ? pause() : void play()
  }, [isPlaying, play, pause])

  /**
   * Per-track autoplay guard (see module JSDoc: "hasAutoplayed REF").
   * Scoped so auto-advance re-arms on each new track. Only set to true after
   * play() resolves — not speculatively — so rapid switching doesn't silence the radio.
   */
  const hasAutoplayed = useRef(false)

  const goToTrack = useCallback((track: RadioTrack): void => {
    pause()
    setCurrentTrack(track)
    setElapsed(0)
    setAudioReady(false)
    hasAutoplayed.current = false  // arm autoplay for the new track
  }, [pause])

  const nextTrack = useCallback((): void => {
    const idx = RADIO_TRACKS.findIndex((t) => t.id === currentTrack.id)
    goToTrack(RADIO_TRACKS[(idx + 1) % RADIO_TRACKS.length])
  }, [currentTrack.id, goToTrack])

  const prevTrack = useCallback((): void => {
    const idx = RADIO_TRACKS.findIndex((t) => t.id === currentTrack.id)
    goToTrack(RADIO_TRACKS[(idx - 1 + RADIO_TRACKS.length) % RADIO_TRACKS.length])
  }, [currentTrack.id, goToTrack])

  // ─── AUTO-ADVANCE ON TRACK END ────────────────────────────────────────────

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onEnded = (): void => nextTrack()
    audio.addEventListener('ended', onEnded)
    return () => audio.removeEventListener('ended', onEnded)
  }, [nextTrack])

  // ─── AUTOPLAY (deferred gesture fallback) ────────────────────────────────

  useEffect(() => {
    if (!autoPlay || !audioReady || hasAutoplayed.current) return

    // Stash gesture listener ref so cleanup can remove it if the effect re-runs
    // before any gesture fires (e.g. track switches while waiting for a gesture).
    let gestureHandler: (() => void) | null = null

    const cleanup = (): void => {
      if (gestureHandler) {
        document.removeEventListener('pointerdown', gestureHandler)
        document.removeEventListener('keydown',     gestureHandler)
        document.removeEventListener('wheel',       gestureHandler)
        gestureHandler = null
      }
    }

    // Fade-in helper: ramps audio.volume from 0 → 0.05 over 30s using rAF.
    const fadeIn = (): void => {
      const audio    = audioRef.current
      if (!audio) return
      audio.volume   = 0
      const TARGET   = 0.05
      const DURATION = 30000
      const start    = performance.now()
      const ramp = (): void => {
        const audio = audioRef.current
        if (!audio) return
        const t = Math.min((performance.now() - start) / DURATION, 1)
        audio.volume = t * TARGET
        if (t < 1) requestAnimationFrame(ramp)
      }
      requestAnimationFrame(ramp)
    }

    // Start at 0 volume before play() — prevents a single loud frame on autoplay.
    if (audioRef.current) audioRef.current.volume = 0

    play()
      .then(() => { hasAutoplayed.current = true; fadeIn() })
      .catch(() => {
        // Browser blocked immediate autoplay — arm on first user gesture.
        // Three event types cover the full gesture surface (touch, keyboard, scroll).
        gestureHandler = (): void => {
          if (audioRef.current) audioRef.current.volume = 0
          void play().then(() => { hasAutoplayed.current = true; fadeIn() })
          cleanup()
        }
        document.addEventListener('pointerdown', gestureHandler, { once: true })
        document.addEventListener('keydown',     gestureHandler, { once: true })
        document.addEventListener('wheel',       gestureHandler, { once: true })
      })

    return cleanup
  }, [autoPlay, audioReady, play])

  // ─── TIME SYNC ────────────────────────────────────────────────────────────

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime     = (): void => setElapsed(audio.currentTime)
    const onDuration = (): void => setDuration(audio.duration)
    const onReady    = (): void => setAudioReady(true)
    audio.addEventListener('timeupdate',      onTime)
    audio.addEventListener('durationchange',  onDuration)
    audio.addEventListener('canplaythrough',  onReady)
    return () => {
      audio.removeEventListener('timeupdate',     onTime)
      audio.removeEventListener('durationchange', onDuration)
      audio.removeEventListener('canplaythrough', onReady)
    }
  }, [])

  // ─── COPY PROMPT ─────────────────────────────────────────────────────────

  const copyPrompt = useCallback(async (): Promise<void> => {
    await navigator.clipboard.writeText(currentTrack.prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS)
  }, [currentTrack.prompt])

  // ─── RENDER ───────────────────────────────────────────────────────────────

  const trackIdx = RADIO_TRACKS.findIndex((t) => t.id === currentTrack.id)

  return (
    <>
      {/*
        href = dedup key — Next.js 14+ deduplicates injected <style> tags by href.
        Prevents duplicate injection across multiple instances or route re-mounts.
      */}
      <style href="skr-anim" precedence="default">{`
        @keyframes skr-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes skr-scanline {
          0%   { background-position: 0 0; }
          100% { background-position: 0 4px; }
        }
        .skr-btn {
          background:     transparent;
          border:         1px solid oklch(0.37 0.31 283 / 0.35);
          color:          oklch(0.37 0.31 283 / 0.80);
          font-family:    monospace;
          font-size:      10px;
          letter-spacing: 0.12em;
          padding:        4px 8px;
          cursor:         pointer;
          transition:     border-color 0.15s, color 0.15s, box-shadow 0.15s;
        }
        .skr-btn:hover {
          border-color: oklch(0.37 0.31 283 / 0.90);
          color:        oklch(0.37 0.31 283);
          box-shadow:   0 0 6px oklch(0.37 0.31 283 / 0.40);
        }
        .skr-btn-action {
          border-color: oklch(0.82 0.13 198 / 0.40);
          color:        oklch(0.82 0.13 198 / 0.80);
        }
        .skr-btn-action:hover {
          border-color: oklch(0.82 0.13 198 / 0.90);
          color:        oklch(0.82 0.13 198);
          box-shadow:   0 0 6px oklch(0.82 0.13 198 / 0.40);
        }
        .skr-btn-copied {
          border-color: oklch(0.87 0.21 192 / 0.90) !important;
          color:        oklch(0.87 0.21 192) !important;
          box-shadow:   0 0 10px oklch(0.87 0.21 192 / 0.60) !important;
        }
      `}</style>

      {/*
        crossOrigin="anonymous": required for createMediaElementSource when files
        may be served from a CDN. Without it the browser blocks AnalyserNode reads
        as a CORS violation even for same-origin files.
        preload="metadata": loads duration for display without buffering full audio.
      */}
      <audio
        ref={audioRef}
        src={`/audio/${currentTrack.filename}`}
        crossOrigin="anonymous"
        preload="metadata"
      />

      <div style={{
        display:       'flex',
        flexDirection: 'column',
        gap:           0,
        fontFamily:    'var(--font-code)',
        width:         CANVAS_W + 2,  // +2 for left + right border
        animation:     'skr-in 0.5s ease-out',
      }}>

        {/* Main panel */}
        <div style={{
          background:  'oklch(0.040 0.035 281)',
          border:      '1px solid oklch(0.495 0.310 281 / 0.50)',
          boxShadow:   '0 0 20px oklch(0.495 0.310 281 / 0.25), 0 0 44px oklch(0.495 0.310 281 / 0.12), 0 0 80px oklch(0.495 0.310 281 / 0.05), inset 0 0 40px oklch(0.040 0.035 281 / 0.50), inset 0 1px 0 oklch(0.495 0.310 281 / 0.08)',
          padding:     '10px 12px 12px',
          position:    'relative',
          overflow:    'hidden',
        }}>

          {/* CRT scanline overlay — cosmetic, sits above content but passes pointer events */}
          <div style={{
            position:      'absolute',
            inset:         0,
            background:    'repeating-linear-gradient(0deg, transparent, transparent 3px, oklch(0 0 0 / 0.08) 4px)',
            pointerEvents: 'none',
            zIndex:        1,
          }} />

          {/* Header */}
          <div style={{
            display:        'flex',
            justifyContent: 'space-between',
            alignItems:     'center',
            paddingBottom:  6,
            marginBottom:   8,
            position:       'relative',
            zIndex:         2,
          }}>
            <span style={{
              color:         'oklch(0.560 0.250 281)',
              fontSize:      9,
              letterSpacing: '0.22em',
              fontFamily:    'var(--font-code)',
              textShadow:    '0 0 8px oklch(0.560 0.250 281 / 0.60)',
            }}>
              SINNER_KING.RADIO
            </span>
            <span style={{ color: 'oklch(0.495 0.310 281 / 0.50)', fontSize: 8, letterSpacing: '0.1em' }}>
              {trackIdx + 1}/{RADIO_TRACKS.length}
            </span>
          </div>
          <div className="hud-divider" style={{ marginBottom: 8, position: 'relative', zIndex: 2 }} />

          {/* Track info */}
          <div style={{ position: 'relative', zIndex: 2, marginBottom: 8 }}>
            <div style={{
              color:         'oklch(0.91 0.02 75)',
              fontSize:      12,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom:  2,
              textOverflow:  'ellipsis',
              overflow:      'hidden',
              whiteSpace:    'nowrap',
            }}>
              {currentTrack.title}
            </div>
            <div style={{
              color:         'oklch(0.37 0.31 283 / 0.55)',
              fontSize:      9,
              letterSpacing: '0.14em',
            }}>
              {currentTrack.originalArtist.toUpperCase()} // {currentTrack.year} // AI COVER
            </div>
          </div>

          {/* ASCII Visualizer canvas */}
          <div style={{ position: 'relative', zIndex: 2, marginBottom: 8 }}>
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              style={{
                display:        'block',
                width:          '100%',
                height:         CANVAS_H,
                background:     'oklch(0 0 0 / 0.30)',
                border:         '1px solid oklch(0.37 0.31 283 / 0.12)',
                imageRendering: 'pixelated',
              }}
            />
            {/* Idle overlay — shown when paused; hides the empty canvas gracefully */}
            {!isPlaying && (
              <div style={{
                position:       'absolute',
                inset:          0,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                color:          'oklch(0.37 0.31 283 / 0.25)',
                fontSize:       9,
                letterSpacing:  '0.2em',
                pointerEvents:  'none',
              }}>
                {audioReady ? 'PRESS ▶ TO TRANSMIT' : 'LOADING...'}
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div style={{ position: 'relative', zIndex: 2, marginBottom: 10 }}>
            <div style={{
              height:       2,
              background:   'oklch(1 0 0 / 0.06)',
              borderRadius: 1,
              overflow:     'hidden',
            }}>
              <div style={{
                height:     '100%',
                width:      duration > 0 ? `${(elapsed / duration) * 100}%` : '0%',
                background: 'linear-gradient(90deg, oklch(0.495 0.310 281 / 0.50), oklch(0.560 0.250 281), oklch(0.640 0.300 350))',
                boxShadow:  '0 0 6px oklch(0.560 0.250 281), 0 0 12px oklch(0.560 0.250 281 / 0.40)',
                transition: 'width 0.25s linear',
              }} />
            </div>
            <div style={{
              display:        'flex',
              justifyContent: 'space-between',
              marginTop:      3,
              color:          'oklch(0.37 0.31 283 / 0.35)',
              fontSize:       8,
              letterSpacing:  '0.08em',
            }}>
              <span>{fmt(elapsed)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          {/* Playback controls */}
          <div style={{
            display:        'flex',
            justifyContent: 'center',
            gap:            6,
            marginBottom:   10,
            position:       'relative',
            zIndex:         2,
          }}>
            <button className="skr-btn" onClick={prevTrack} aria-label="Previous track">◀◀</button>
            <button
              className="skr-btn"
              onClick={togglePlay}
              style={{ minWidth: 36, fontWeight: 'bold' }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '‖' : '▶'}
            </button>
            <button className="skr-btn" onClick={nextTrack} aria-label="Next track">▶▶</button>
          </div>

          {/* Action buttons */}
          <div style={{
            display:  'flex',
            gap:      6,
            position: 'relative',
            zIndex:   2,
          }}>
            <a
              href={`/audio/${currentTrack.filename}`}
              download={`${currentTrack.title} (Synthwave Cover).mp3`}
              style={{ textDecoration: 'none', flex: 1 }}
            >
              <button
                className="skr-btn skr-btn-action"
                style={{ width: '100%' }}
                aria-label="Download track"
              >
                ⬇ DOWNLOAD
              </button>
            </a>
            <button
              className={`skr-btn skr-btn-action${copied ? ' skr-btn-copied' : ''}`}
              onClick={copyPrompt}
              style={{ flex: 1 }}
              aria-label="Copy generation prompt"
            >
              {copied ? '✓ COPIED' : '⎘ COPY PROMPT'}
            </button>
          </div>

        </div>

        {/* Track list — scrollable, collapsed beneath main panel */}
        <TrackList
          tracks={RADIO_TRACKS}
          currentId={currentTrack.id}
          onSelect={goToTrack}
        />

      </div>
    </>
  )
}

// ─── TRACK LIST ───────────────────────────────────────────────────────────────

interface TrackListProps {
  tracks:    readonly RadioTrack[]
  currentId: string
  onSelect:  (track: RadioTrack) => void
}

function TrackList({ tracks, currentId, onSelect }: TrackListProps): React.ReactElement {
  return (
    <div style={{
      background:  'oklch(0.030 0.030 281)',
      border:      '1px solid oklch(0.495 0.310 281 / 0.22)',
      borderTop:   'none',
      maxHeight:   140,
      overflowY:   'auto',
    }}>
      {tracks.map((track, i) => {
        const active = track.id === currentId
        return (
          <button
            key={track.id}
            onClick={() => onSelect(track)}
            style={{
              display:      'flex',
              alignItems:   'baseline',
              gap:          8,
              width:        '100%',
              background:   active ? 'oklch(0.640 0.300 350 / 0.08)' : 'transparent',
              border:       'none',
              borderBottom: '1px solid oklch(0.37 0.31 283 / 0.07)',
              padding:      '5px 10px',
              cursor:       'pointer',
              textAlign:    'left',
              transition:   'background 0.1s',
            }}
          >
            {/* Track number or ▶ if active */}
            <span style={{
              color:         active ? 'oklch(0.37 0.31 283)' : 'oklch(0.37 0.31 283 / 0.30)',
              fontSize:      8,
              minWidth:      14,
              letterSpacing: '0.06em',
            }}>
              {active ? '▶' : `${String(i + 1).padStart(2, '0')}`}
            </span>
            <span style={{
              color:         active ? 'oklch(0.91 0.02 75)' : 'oklch(0.82 0.02 300 / 0.45)',
              fontSize:      10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              overflow:      'hidden',
              textOverflow:  'ellipsis',
              whiteSpace:    'nowrap',
              flex:          1,
            }}>
              {track.title}
            </span>
            {/* Abbreviated original artist (first word only) */}
            <span style={{
              color:         'oklch(0.37 0.31 283 / 0.25)',
              fontSize:      8,
              letterSpacing: '0.06em',
              flexShrink:    0,
            }}>
              {track.originalArtist.split(' ')[0].toUpperCase()}
            </span>
          </button>
        )
      })}
    </div>
  )
}
