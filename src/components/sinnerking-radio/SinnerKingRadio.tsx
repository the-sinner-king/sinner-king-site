'use client'

/**
 * SinnerKingRadio.tsx
 *
 * Pirate radio station broadcasting from the Sinner Kingdom.
 * Synthwave AI covers of songs that shouldn't exist this way.
 *
 * NOT wired to any live route — this component exists but is not imported
 * anywhere until Brandon says go. Drop it on any page to activate.
 *
 * Features:
 *   - Random track on load (surprise every visit)
 *   - ASCII frequency visualizer via Web Audio API AnalyserNode
 *   - Download button: native <a href download>
 *   - Copy Prompt button: navigator.clipboard — steal the AI prompt
 *   - Play / pause / next / prev controls
 *
 * Audio engine: native HTMLAudioElement + Web Audio API
 *   AudioContext created on first play click (avoids autoplay policy block)
 *   crossOrigin="anonymous" required for AnalyserNode on Vercel-served files
 *
 * ASCII visualizer:
 *   128-bin FFT → 50 columns → ASCII_CHARS height mapping
 *   RAF pauses when document is hidden (no wasted CPU)
 *   Colors cycle through territory palette per column
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { RADIO_TRACKS, getRandomTrack } from './radio-tracks'
import type { RadioTrack } from './radio-tracks'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASCII_CHARS = ' .:-=+*#%@'   // 10 levels — space (silence) → @ (peak)
const CANVAS_W    = 260
const CANVAS_H    = 72
// 34 cols × ~7.6px each at CANVAS_W=260 — packed terminal look.
const COL_COUNT   = 34
const FONT_SIZE   = 8              // px — monospace

// Territory colors — cycles across visualizer columns
const TERRITORY_COLORS = [
  '#7000ff',  // claude_house  purple
  '#f0a500',  // the_forge     amber
  '#ff006e',  // the_throne    pink
  '#9b30ff',  // the_tower     violet
  '#00f3ff',  // the_scryer    cyan
  '#e8e0d0',  // core_lore     off-white
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ampToAscii(amplitude: number): string {
  // amplitude: 0–255 from getByteFrequencyData
  const idx = Math.floor((amplitude / 255) * (ASCII_CHARS.length - 1))
  return ASCII_CHARS[Math.max(0, Math.min(ASCII_CHARS.length - 1, idx))]
}

function fmt(seconds: number): string {
  if (!isFinite(seconds)) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SinnerKingRadioProps {
  /** If provided, start on this track ID instead of a random one */
  initialTrackId?: string
  /** If true, attempt to play on first canplaythrough event (browser may block) */
  autoPlay?: boolean
}

export function SinnerKingRadio({ initialTrackId, autoPlay = false }: SinnerKingRadioProps) {
  const audioRef    = useRef<HTMLAudioElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef      = useRef<number>(0)
  const ctxRef      = useRef<AudioContext | null>(null)
  const sourceRef   = useRef<MediaElementAudioSourceNode | null>(null)

  const [currentTrack, setCurrentTrack] = useState<RadioTrack>(() => {
    if (initialTrackId) {
      return RADIO_TRACKS.find((t) => t.id === initialTrackId) ?? getRandomTrack()
    }
    return getRandomTrack()
  })
  const [isPlaying,    setIsPlaying]    = useState(false)
  // Stable ref — lets visibilitychange listener read current isPlaying without
  // being in the effect deps (prevents listener re-creation on every play/pause toggle).
  const isPlayingRef = useRef(false)
  isPlayingRef.current = isPlaying
  const [duration,     setDuration]     = useState(0)
  const [elapsed,      setElapsed]      = useState(0)
  const [copied,       setCopied]       = useState(false)
  const [audioReady,   setAudioReady]   = useState(false)

  // ---------------------------------------------------------------------------
  // ASCII visualizer RAF loop
  // ---------------------------------------------------------------------------

  const drawVisualizer = useCallback(() => {
    const canvas   = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return

    const ctx  = canvas.getContext('2d')
    if (!ctx) return

    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    ctx.font = `${FONT_SIZE}px monospace`

    const colW       = CANVAS_W / COL_COUNT
    const binsPerCol = Math.floor(data.length / COL_COUNT)
    const rowCount   = Math.floor(CANVAS_H / FONT_SIZE)

    for (let col = 0; col < COL_COUNT; col++) {
      // Average amplitude across bins in this column's frequency range
      let sum = 0
      for (let b = 0; b < binsPerCol; b++) {
        sum += data[col * binsPerCol + b]
      }
      const avg     = sum / binsPerCol
      const barRows = Math.floor((avg / 255) * rowCount)  // how many rows to fill

      const color = TERRITORY_COLORS[col % TERRITORY_COLORS.length]
      ctx.fillStyle   = color
      ctx.shadowColor = color   // glow — each column's color bleeds out around its characters
      ctx.shadowBlur  = 7

      // Gradient: top of bar (smallest row index) gets hottest ASCII char.
      // (rowCount - row) grows as row decreases → peak energy shown at bar apex.
      // ×2.5 overdrive: ensures the apex char reaches '@' for moderate signals.
      // Without it, avg=128 would only reach '=' even at peak — visually weak.
      for (let row = rowCount - 1; row >= rowCount - barRows; row--) {
        const char = ampToAscii((avg / rowCount) * (rowCount - row) * 2.5)
        ctx.fillText(char, col * colW, row * FONT_SIZE + FONT_SIZE)
      }
    }
    ctx.shadowBlur = 0  // reset after loop — don't bleed into clearRect next frame

    if (!document.hidden) {
      rafRef.current = requestAnimationFrame(drawVisualizer)
    }
  }, [])

  // Pause RAF when tab hidden, resume when visible.
  // REGRESSION GUARD: isPlaying is read via ref — NOT in deps array. If isPlaying
  // were a dep, this effect would re-run on every play/pause toggle, briefly
  // leaving the page unlistened between listener removal and re-attachment.
  // isPlayingRef.current is always current without causing re-registration.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current)
      } else if (isPlayingRef.current) {
        rafRef.current = requestAnimationFrame(drawVisualizer)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [drawVisualizer])

  // Clean up RAF on unmount
  useEffect(() => () => { cancelAnimationFrame(rafRef.current) }, [])

  // ---------------------------------------------------------------------------
  // Audio context setup — called on first play (avoids autoplay block)
  // ---------------------------------------------------------------------------

  const initAudioContext = useCallback(() => {
    if (ctxRef.current || !audioRef.current) return

    // Safari still ships webkitAudioContext — one-liner polyfill.
    const AudioCtx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) {
      // Web Audio not available (very old browser, SSR escape hatch).
      // Player still works for playback — visualizer canvas stays dark.
      console.warn('[SinnerKingRadio] Web Audio API unavailable — visualizer disabled')
      return
    }

    const ctx      = new AudioCtx()
    const analyser = ctx.createAnalyser()
    // fftSize 256 → 128 frequency bins. Minimum giving meaningful frequency
    // resolution while keeping getByteFrequencyData calls cheap per frame.
    analyser.fftSize = 256
    // 0.82: standard "feels smooth but still responsive" value for music visualizers.
    // Lower = more reactive jitter. Higher = slow smear. 0.82 tracks transients well.
    analyser.smoothingTimeConstant = 0.82

    const source = ctx.createMediaElementSource(audioRef.current)
    source.connect(analyser)
    analyser.connect(ctx.destination)

    ctxRef.current    = ctx
    analyserRef.current = analyser
    sourceRef.current = source
  }, [])

  // ---------------------------------------------------------------------------
  // Playback controls
  // ---------------------------------------------------------------------------

  const play = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return

    initAudioContext()

    // Resume suspended context (required by browser autoplay policy)
    if (ctxRef.current?.state === 'suspended') {
      await ctxRef.current.resume()
    }

    await audio.play()
    setIsPlaying(true)
    rafRef.current = requestAnimationFrame(drawVisualizer)
  }, [initAudioContext, drawVisualizer])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
    cancelAnimationFrame(rafRef.current)
  }, [])

  const togglePlay = useCallback(() => {
    isPlaying ? pause() : play()
  }, [isPlaying, play, pause])

  const goToTrack = useCallback((track: RadioTrack) => {
    pause()
    setCurrentTrack(track)
    setElapsed(0)
    setAudioReady(false)
    // <audio src> is bound to `/audio/${currentTrack.filename}` in JSX —
    // React updates the attribute on re-render when currentTrack changes.
  }, [pause])

  const nextTrack = useCallback(() => {
    const idx = RADIO_TRACKS.findIndex((t) => t.id === currentTrack.id)
    goToTrack(RADIO_TRACKS[(idx + 1) % RADIO_TRACKS.length])
  }, [currentTrack.id, goToTrack])

  const prevTrack = useCallback(() => {
    const idx = RADIO_TRACKS.findIndex((t) => t.id === currentTrack.id)
    goToTrack(RADIO_TRACKS[(idx - 1 + RADIO_TRACKS.length) % RADIO_TRACKS.length])
  }, [currentTrack.id, goToTrack])

  // Auto-advance on track end
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onEnded = () => nextTrack()
    audio.addEventListener('ended', onEnded)
    return () => audio.removeEventListener('ended', onEnded)
  }, [nextTrack])

  // Autoplay — deferred on browser block.
  // hasAutoplayed is only marked true after play() ACTUALLY SUCCEEDS — not before.
  // This ensures rapid track-switching before the first gesture doesn't silently
  // consume the "one shot" and leave the radio permanently muted.
  // Gesture listeners are cleaned up if the effect re-runs before they fire.
  const hasAutoplayed = useRef(false)
  useEffect(() => {
    if (!autoPlay || !audioReady || hasAutoplayed.current) return

    // Stash gesture listener ref so cleanup can remove it if effect re-runs
    let gestureHandler: (() => void) | null = null

    const cleanup = () => {
      if (gestureHandler) {
        document.removeEventListener('pointerdown', gestureHandler)
        document.removeEventListener('keydown',     gestureHandler)
        document.removeEventListener('wheel',       gestureHandler)
        gestureHandler = null
      }
    }

    play()
      .then(() => { hasAutoplayed.current = true })
      .catch(() => {
        // Browser blocked — arm deferred trigger on first user gesture
        gestureHandler = () => {
          play()
            .then(() => { hasAutoplayed.current = true })
            .catch(() => {})
          cleanup()
        }
        document.addEventListener('pointerdown', gestureHandler, { once: true })
        document.addEventListener('keydown',     gestureHandler, { once: true })
        document.addEventListener('wheel',       gestureHandler, { once: true })
      })

    return cleanup
  }, [autoPlay, audioReady, play])

  // Sync time display
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime     = () => setElapsed(audio.currentTime)
    const onDuration = () => setDuration(audio.duration)
    const onReady    = () => setAudioReady(true)
    audio.addEventListener('timeupdate',  onTime)
    audio.addEventListener('durationchange', onDuration)
    audio.addEventListener('canplaythrough', onReady)
    return () => {
      audio.removeEventListener('timeupdate',     onTime)
      audio.removeEventListener('durationchange', onDuration)
      audio.removeEventListener('canplaythrough', onReady)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Copy prompt
  // ---------------------------------------------------------------------------

  const copyPrompt = useCallback(async () => {
    await navigator.clipboard.writeText(currentTrack.prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [currentTrack.prompt])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const trackIdx = RADIO_TRACKS.findIndex((t) => t.id === currentTrack.id)

  return (
    <>
      {/* Next.js 14+ inline style tag: href = dedup key (prevents duplicate injection
          across instances/routes), precedence = CSS cascade layer. Valid pattern. */}
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
          background:    transparent;
          border:        1px solid rgba(112,0,255,0.35);
          color:         rgba(112,0,255,0.8);
          font-family:   monospace;
          font-size:     10px;
          letter-spacing: 0.12em;
          padding:       4px 8px;
          cursor:        pointer;
          transition:    border-color 0.15s, color 0.15s, box-shadow 0.15s;
        }
        .skr-btn:hover {
          border-color:  rgba(112,0,255,0.9);
          color:         #7000ff;
          box-shadow:    0 0 6px rgba(112,0,255,0.4);
        }
        .skr-btn-action {
          border-color:  rgba(0,211,255,0.4);
          color:         rgba(0,211,255,0.8);
        }
        .skr-btn-action:hover {
          border-color:  rgba(0,211,255,0.9);
          color:         #00d3ff;
          box-shadow:    0 0 6px rgba(0,211,255,0.4);
        }
        .skr-btn-copied {
          border-color:  rgba(0,243,255,0.9) !important;
          color:         #00f3ff !important;
          box-shadow:    0 0 10px rgba(0,243,255,0.6) !important;
        }
      `}</style>

      {/* Hidden audio element — crossOrigin required for Web Audio API AnalyserNode */}
      <audio
        ref={audioRef}
        src={`/audio/${currentTrack.filename}`}
        crossOrigin="anonymous"
        preload="metadata"
      />

      <div style={{
        display:        'flex',
        flexDirection:  'column',
        gap:            0,
        fontFamily:     'monospace',
        width:          CANVAS_W + 2,  // +2 for border
        animation:      'skr-in 0.5s ease-out',
      }}>

        {/* Main panel */}
        <div style={{
          background:    'rgba(3,0,10,0.96)',
          border:        '1px solid rgba(112,0,255,0.5)',
          boxShadow:     '0 0 20px rgba(112,0,255,0.15), inset 0 0 40px rgba(0,0,0,0.4)',
          padding:       '10px 12px 12px',
          position:      'relative',
          overflow:      'hidden',
        }}>

          {/* Scanline overlay */}
          <div style={{
            position:   'absolute',
            inset:      0,
            background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 4px)',
            pointerEvents: 'none',
            zIndex:     1,
          }} />

          {/* Header */}
          <div style={{
            display:        'flex',
            justifyContent: 'space-between',
            alignItems:     'baseline',
            paddingBottom:  6,
            marginBottom:   8,
            borderBottom:   '1px solid rgba(112,0,255,0.2)',
            position:       'relative',
            zIndex:         2,
          }}>
            <span style={{ color: '#7000ff', fontSize: 9, letterSpacing: '0.22em' }}>
              SINNER_KING.RADIO
            </span>
            <span style={{ color: 'rgba(112,0,255,0.4)', fontSize: 8, letterSpacing: '0.1em' }}>
              {trackIdx + 1}/{RADIO_TRACKS.length}
            </span>
          </div>

          {/* Track info */}
          <div style={{ position: 'relative', zIndex: 2, marginBottom: 8 }}>
            <div style={{
              color:         '#e8e0d0',
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
              color:         'rgba(112,0,255,0.55)',
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
                display:     'block',
                width:       '100%',
                height:      CANVAS_H,
                background:  'rgba(0,0,0,0.3)',
                border:      '1px solid rgba(112,0,255,0.12)',
                imageRendering: 'pixelated',
              }}
            />
            {/* Idle state overlay — shown when not playing */}
            {!isPlaying && (
              <div style={{
                position:      'absolute',
                inset:         0,
                display:       'flex',
                alignItems:    'center',
                justifyContent: 'center',
                color:         'rgba(112,0,255,0.25)',
                fontSize:      9,
                letterSpacing: '0.2em',
                pointerEvents: 'none',
              }}>
                {audioReady ? 'PRESS ▶ TO TRANSMIT' : 'LOADING...'}
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div style={{ position: 'relative', zIndex: 2, marginBottom: 10 }}>
            <div style={{
              height:       2,
              background:   'rgba(255,255,255,0.06)',
              borderRadius: 1,
              overflow:     'hidden',
            }}>
              <div style={{
                height:     '100%',
                width:      duration > 0 ? `${(elapsed / duration) * 100}%` : '0%',
                background: 'linear-gradient(90deg, #7000ff88, #7000ff)',
                boxShadow:  '0 0 4px #7000ff',
                transition: 'width 0.25s linear',
              }} />
            </div>
            <div style={{
              display:        'flex',
              justifyContent: 'space-between',
              marginTop:      3,
              color:          'rgba(112,0,255,0.35)',
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

        {/* Track list — collapsed beneath main panel */}
        <TrackList
          tracks={RADIO_TRACKS}
          currentId={currentTrack.id}
          onSelect={goToTrack}
        />

      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Track list sub-component
// ---------------------------------------------------------------------------

function TrackList({
  tracks, currentId, onSelect,
}: {
  tracks:    typeof RADIO_TRACKS
  currentId: string
  onSelect:  (track: (typeof RADIO_TRACKS)[0]) => void
}) {
  return (
    <div style={{
      background:   'rgba(3,0,10,0.88)',
      border:       '1px solid rgba(112,0,255,0.25)',
      borderTop:    'none',
      maxHeight:    140,
      overflowY:    'auto',
    }}>
      {tracks.map((track, i) => {
        const active = track.id === currentId
        return (
          <button
            key={track.id}
            onClick={() => onSelect(track)}
            style={{
              display:        'flex',
              alignItems:     'baseline',
              gap:            8,
              width:          '100%',
              background:     active ? 'rgba(112,0,255,0.10)' : 'transparent',
              border:         'none',
              borderBottom:   '1px solid rgba(112,0,255,0.07)',
              padding:        '5px 10px',
              cursor:         'pointer',
              textAlign:      'left',
              transition:     'background 0.1s',
            }}
          >
            <span style={{
              color:         active ? '#7000ff' : 'rgba(112,0,255,0.3)',
              fontSize:      8,
              minWidth:      14,
              letterSpacing: '0.06em',
            }}>
              {active ? '▶' : `${String(i + 1).padStart(2, '0')}`}
            </span>
            <span style={{
              color:         active ? '#e8e0d0' : 'rgba(200,190,210,0.45)',
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
            <span style={{
              color:         'rgba(112,0,255,0.25)',
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
