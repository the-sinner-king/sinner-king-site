'use client'

/**
 * KingdomHUDLab — Sulphur Kawaii HUD staging page
 *
 * AC1: Staging page showing all redesigned HUD elements in isolation.
 *
 * Shows:
 *  - New StatusBar with signal-strip header + SOVEREIGN presence glyphs
 *  - New AgentPanel with faceplate logic (all 9 states demoed)
 *  - New Radio panel chrome (OKLCH deep bruise, ASCII viz mock)
 *  - New TokenHUD with ▮▯ bar meters
 *  - CHROMA_BLEED OKLCH panel function classes
 *  - KINETIC keyframe vocabulary
 *
 * No live store dependency — mock data throughout.
 * Once approved, these designs install into the live map.
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { RADIO_TRACKS, getRandomTrack } from '@/components/sinnerking-radio/radio-tracks'
import type { RadioTrack } from '@/components/sinnerking-radio/radio-tracks'

// ---------------------------------------------------------------------------
// MOCK DATA
// ---------------------------------------------------------------------------

type AgentState =
  | 'offline' | 'online' | 'thinking' | 'reading'
  | 'working' | 'writing' | 'running' | 'searching' | 'swarming'

interface MockAgent {
  key: string
  label: string
  state: AgentState
  activity: number
  tool: string | null
}

const DEMO_AGENTS: MockAgent[] = [
  { key: 'forge',  label: 'FORGE',  state: 'swarming',  activity: 98, tool: 'Task'  },
  { key: 'tower',  label: 'TOWER',  state: 'writing',   activity: 85, tool: 'Write' },
  { key: 'house',  label: 'HOUSE',  state: 'searching', activity: 72, tool: 'Grep'  },
  { key: 'throne', label: 'THRONE', state: 'offline',   activity: 0,  tool: null    },
]

// Tool icon per tool name
const TOOL_ICON: Record<string, string> = {
  Task: '⚙', Write: '✍', Grep: '◎', Read: '◈', Bash: '⚡', Edit: '✦',
  Agent: '⬡', WebSearch: '◇', default: '◈',
}

// Full 9-state demo for faceplate showcase
const ALL_STATES: Array<{ state: AgentState; label: string; key: string; activity: number }> = [
  { state: 'offline',   label: 'THRONE', key: 'a', activity: 0  },
  { state: 'online',    label: 'HOUSE',  key: 'b', activity: 30 },
  { state: 'thinking',  label: 'TOWER',  key: 'c', activity: 55 },
  { state: 'reading',   label: 'FORGE',  key: 'd', activity: 60 },
  { state: 'working',   label: 'FORGE',  key: 'e', activity: 78 },
  { state: 'writing',   label: 'TOWER',  key: 'f', activity: 85 },
  { state: 'running',   label: 'HOUSE',  key: 'g', activity: 70 },
  { state: 'searching', label: 'FORGE',  key: 'h', activity: 90 },
  { state: 'swarming',  label: 'FORGE',  key: 'i', activity: 100 },
]

// ---------------------------------------------------------------------------
// COLOR SYSTEM — CHROMA_BLEED OKLCH
// ---------------------------------------------------------------------------

const STATE_COLORS: Record<AgentState, string> = {
  offline:   'oklch(0.160 0.028 281)',
  online:    'oklch(0.495 0.310 281)',
  thinking:  'oklch(0.560 0.250 281)',
  reading:   'oklch(0.820 0.140 194)',
  working:   'oklch(0.770 0.225 74)',
  writing:   'oklch(0.680 0.290 350)',
  running:   'oklch(0.670 0.210 43)',
  searching: 'oklch(0.905 0.305 142)',
  swarming:  'oklch(0.930 0.140 194)',
}

// TYPE_WEAVER daemon-naming convention — every state is a running process
const STATE_LABELS: Record<AgentState, string> = {
  offline:   '×_OFFLINE',
  online:    'IDLE.sys',
  thinking:  'THINK.proc',
  reading:   'READ.stream',
  working:   'WORK.exe',
  writing:   'WRITE.out',
  running:   'RUN.daemon',
  searching: 'SCAN.deep',
  swarming:  '▓▓ SWARM.max',
}

// CHROMA_BLEED per-state faceplate glow map
const FACEPLATE_GLOW: Record<AgentState, string> = {
  offline:   '0 0 2px oklch(0.160 0.028 281 / 0.30)',
  online:    '0 0 6px oklch(0.495 0.310 281), 0 0 14px oklch(0.495 0.310 281 / 0.30)',
  thinking:  '0 0 8px oklch(0.560 0.250 281), 0 0 18px oklch(0.560 0.250 281 / 0.25)',
  reading:   '0 0 8px oklch(0.820 0.140 194), 0 0 16px oklch(0.820 0.140 194 / 0.30)',
  working:   '0 0 10px oklch(0.770 0.225 74), 0 0 20px oklch(0.770 0.225 74 / 0.35), 0 0 4px oklch(0.640 0.300 350 / 0.15)',
  writing:   '0 0 10px oklch(0.680 0.290 350), 0 0 22px oklch(0.680 0.290 350 / 0.40), 0 0 40px oklch(0.680 0.290 350 / 0.12)',
  running:   '0 0 8px oklch(0.670 0.210 43), 0 0 16px oklch(0.670 0.210 43 / 0.30), 1px 0 3px oklch(0.670 0.210 43 / 0.25)',
  searching: '0 0 12px oklch(0.905 0.305 142), 0 0 26px oklch(0.905 0.305 142 / 0.40), 1px 0 3px oklch(0.640 0.300 350 / 0.20), -1px 0 3px oklch(0.640 0.300 350 / 0.20)',
  swarming:  '0 0 14px oklch(0.930 0.140 194), 0 0 30px oklch(0.930 0.140 194 / 0.45), 0 0 50px oklch(0.930 0.140 194 / 0.15), 2px 0 4px oklch(0.770 0.225 74 / 0.20), -2px 0 4px oklch(0.770 0.225 74 / 0.20)',
}

// Faceplate ASCII face expressions
const FACEPLATE: Record<AgentState, string> = {
  offline:   'x_x',
  online:    '-_-',
  thinking:  'o_o',
  reading:   'o_o',
  working:   '>_<',
  writing:   ';_;',
  running:   '>_>',
  searching: 'O_O',
  swarming:  '*_*',
}

// CSS animation class name per state
const STATE_ANIM: Record<AgentState, string> = {
  offline:   '',
  online:    '',
  thinking:  'anim-think',
  reading:   'anim-reading-eyes',
  working:   'anim-heartbeat',
  writing:   'anim-write-pulse',
  running:   'anim-running',
  searching: 'anim-searching',
  swarming:  'anim-swarming',
}

// Letter-spacing per state (TYPE_WEAVER kerning doctrine)
const STATE_KERNING: Record<AgentState, string> = {
  offline:   '0.14em',
  online:    '0.10em',
  thinking:  '0.14em',
  reading:   '0.10em',
  working:   '0.06em',   // tight — strain
  writing:   '0.06em',   // tight — urgent
  running:   '0.08em',
  searching: '0.22em',   // wide — scanning
  swarming:  '-0.01em',  // negative — maximum velocity
}

// Mock token data
const TOKEN_AGENTS = [
  { label: 'FORGE',  bar: 0.88, rate: '42k/hr', color: 'oklch(0.770 0.225 74)' },
  { label: 'TOWER',  bar: 0.65, rate: '28k/hr', color: 'oklch(0.495 0.310 281)' },
  { label: 'HOUSE',  bar: 0.40, rate: '18k/hr', color: 'oklch(0.560 0.250 281)' },
  { label: 'THRONE', bar: 0.05, rate: '0k/hr',  color: 'oklch(0.160 0.028 281)' },
]

// ---------------------------------------------------------------------------
// ASCII RADIO VISUALIZER (mock — static columns at varying heights)
// ---------------------------------------------------------------------------

const ASCII_CHARS = ' .:-=+*#%@'
const COL_COUNT = 34
const TERRITORY_COLORS = ['#7000ff','#f0a500','#ff006e','#9b30ff','#00f3ff','#e8e0d0']

function ampToAscii(amp: number): string {
  const idx = Math.floor((amp / 255) * (ASCII_CHARS.length - 1))
  return ASCII_CHARS[Math.max(0, Math.min(ASCII_CHARS.length - 1, idx))]
}

// ---------------------------------------------------------------------------
// RADIO COMPONENT (self-contained, new OKLCH chrome)
// ---------------------------------------------------------------------------

interface StagingRadioProps {
  initialTrackId?: string
  autoPlay?: boolean
}

function StagingRadio({ initialTrackId, autoPlay = false }: StagingRadioProps) {
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
  const [isPlaying,  setIsPlaying]  = useState(false)
  const [progress,   setProgress]   = useState(0)
  const [duration,   setDuration]   = useState(0)
  const [showTracks, setShowTracks] = useState(false)
  const isPlayingRef = useRef(false)
  isPlayingRef.current = isPlaying

  function fmt(s: number): string {
    if (!isFinite(s)) return '--:--'
    const m = Math.floor(s / 60), ss = Math.floor(s % 60)
    return `${m}:${ss.toString().padStart(2,'0')}`
  }

  const drawViz = useCallback(() => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)

    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = 'oklch(0.025 0.025 281 / 0.40)'
    ctx.fillRect(0, 0, W, H)

    const colW = Math.floor(W / COL_COUNT)
    const charH = 8

    // Get average amplitude for dynamic glow
    const avg = data.slice(0, COL_COUNT * 4).reduce((a, b) => a + b, 0) / (COL_COUNT * 4)
    const dynamicBlur = avg > 153 ? 9 : avg > 76 ? 7 : 5

    for (let i = 0; i < COL_COUNT; i++) {
      const binIdx = Math.floor(i * (data.length / COL_COUNT))
      const amp = data[binIdx]
      const rows = Math.max(1, Math.floor((amp / 255) * (H / charH)))
      const color = TERRITORY_COLORS[i % TERRITORY_COLORS.length]

      ctx.font = `${charH}px "JetBrains Mono", monospace`
      ctx.shadowColor = color
      ctx.shadowBlur = dynamicBlur
      ctx.fillStyle = color

      for (let r = 0; r < rows; r++) {
        const char = ampToAscii(Math.floor(amp * ((r + 1) / rows)))
        ctx.fillText(char, i * colW, H - r * charH)
      }
    }
  }, [])

  const startViz = useCallback(() => {
    const loop = () => {
      drawViz()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [drawViz])

  const stopViz = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
  }, [])

  const setupAudio = useCallback(() => {
    if (ctxRef.current || !audioRef.current) return
    const ctx = new AudioContext()
    ctxRef.current = ctx
    const src = ctx.createMediaElementSource(audioRef.current)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    src.connect(analyser)
    analyser.connect(ctx.destination)
    analyserRef.current = analyser
    sourceRef.current = src
  }, [])

  const play = useCallback(async () => {
    setupAudio()
    if (ctxRef.current?.state === 'suspended') await ctxRef.current.resume()
    await audioRef.current?.play().catch(() => {})
    setIsPlaying(true)
    startViz()
  }, [setupAudio, startViz])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
    stopViz()
  }, [stopViz])

  const toggle = () => (isPlaying ? pause() : play())

  const goNext = useCallback(() => {
    const idx = RADIO_TRACKS.findIndex((t) => t.id === currentTrack.id)
    const next = RADIO_TRACKS[(idx + 1) % RADIO_TRACKS.length]
    setCurrentTrack(next)
  }, [currentTrack])

  const goPrev = useCallback(() => {
    const idx = RADIO_TRACKS.findIndex((t) => t.id === currentTrack.id)
    const prev = RADIO_TRACKS[(idx - 1 + RADIO_TRACKS.length) % RADIO_TRACKS.length]
    setCurrentTrack(prev)
  }, [currentTrack])

  // Autoplay after track change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.src = `/audio/${currentTrack.filename}`
      audioRef.current.load()
      if (isPlaying || (autoPlay && !isPlayingRef.current)) {
        audioRef.current.addEventListener('canplaythrough', () => play(), { once: true })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack.id])

  useEffect(() => {
    return () => { stopViz(); ctxRef.current?.close() }
  }, [stopViz])

  // Draw idle static when not playing
  useEffect(() => {
    if (!isPlaying) {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'oklch(0.025 0.025 281 / 0.40)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const colW = Math.floor(canvas.width / COL_COUNT)
      ctx.font = '8px "JetBrains Mono", monospace'
      for (let i = 0; i < COL_COUNT; i++) {
        const color = TERRITORY_COLORS[i % TERRITORY_COLORS.length]
        ctx.shadowColor = color
        ctx.shadowBlur = 3
        ctx.fillStyle = color
        const h = Math.floor(Math.random() * 3) + 1
        ctx.fillText('.', i * colW, canvas.height - h * 8)
      }
    }
  }, [isPlaying])

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0

  return (
    <div
      className={isPlaying ? 'radio-alive' : ''}
      style={{
        background:   'oklch(0.040 0.035 281)',
        border:       '1px solid oklch(0.495 0.310 281 / 0.50)',
        boxShadow:    '0 0 20px oklch(0.495 0.310 281 / 0.25), 0 0 44px oklch(0.495 0.310 281 / 0.12), 0 0 80px oklch(0.495 0.310 281 / 0.05), inset 0 0 40px oklch(0.040 0.035 281 / 0.50), inset 0 1px 0 oklch(0.495 0.310 281 / 0.08)',
        borderRadius: 4,
        width:        288,
        fontFamily:   '"JetBrains Mono", monospace',
        overflow:     'hidden',
        position:     'relative',
      }}
    >
      {/* CRT scanlines */}
      <div style={{
        position:   'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
      }} />

      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onTimeUpdate={() => setProgress(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={goNext}
      />

      {/* Header */}
      <div style={{
        padding:      '8px 10px 6px',
        borderBottom: '1px solid oklch(0.520 0.080 10 / 0.12)',
        position:     'relative', zIndex: 2,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            color:         'oklch(0.880 0.000 0)',
            letterSpacing:  '0.24em',
            fontFamily:     '"VT323", monospace',
            fontSize:       11,
          }}>
            ≪⚡≫── SINNER_KING.RADIO ──≪⚡≫
          </span>
          <button
            onClick={() => setShowTracks(!showTracks)}
            style={{
              background: 'none', border: '1px solid oklch(0.340 0.210 281 / 0.40)',
              color: 'oklch(0.495 0.310 281)', cursor: 'pointer',
              fontFamily: '"JetBrains Mono", monospace', fontSize: 7,
              padding: '1px 5px', borderRadius: 2, letterSpacing: '0.1em',
            }}
          >
            {showTracks ? 'CLOSE' : 'TRACKS'}
          </button>
        </div>
        <div style={{ fontSize: 7, color: 'oklch(0.440 0.040 10)', letterSpacing: '0.12em', marginTop: 2 }}>
          ♪̊ {isPlaying ? 'ON AIR' : 'STANDBY'} / N / M / {isPlaying ? '▸ PLAYING' : 'PRESS ▸'}
        </div>
      </div>

      {/* ASCII Visualizer */}
      <div style={{ padding: '6px 10px', position: 'relative', zIndex: 2 }}>
        <canvas
          ref={canvasRef}
          width={268}
          height={72}
          style={{
            display: 'block',
            background: 'oklch(0.025 0.025 281 / 0.40)',
            borderRadius: 2,
            imageRendering: 'pixelated',
          }}
        />
      </div>

      {/* Track info */}
      <div style={{ padding: '0 10px 6px', position: 'relative', zIndex: 2 }}>
        <div style={{
          fontSize: 9,
          color: 'oklch(0.880 0.000 0)',
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          textShadow: '0 0 12px oklch(0.520 0.080 10 / 0.20)',
        }}>
          {currentTrack.title}
        </div>
        <div style={{
          fontSize: 7, color: 'oklch(0.440 0.040 10)',
          letterSpacing: '0.10em', marginTop: 2,
        }}>
          {currentTrack.originalArtist}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ padding: '0 10px', position: 'relative', zIndex: 2 }}>
        <div style={{
          height: 2, background: 'oklch(0.160 0.028 281 / 0.40)',
          borderRadius: 1, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${progressPct}%`,
            background: 'linear-gradient(90deg, oklch(0.340 0.210 281 / 0.50), oklch(0.495 0.310 281), oklch(0.680 0.290 350 / 0.60))',
            transition: 'width 0.5s linear',
          }} />
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 7, color: 'oklch(0.440 0.040 10)',
          letterSpacing: '0.08em', marginTop: 3,
        }}>
          <span>{fmt(progress)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: '6px 10px 10px', position: 'relative', zIndex: 2,
      }}>
        {(['◁◁', '▸', '▷▷'] as const).map((sym, i) => (
          <button
            key={sym}
            onClick={i === 0 ? goPrev : i === 1 ? toggle : goNext}
            style={{
              background:   i === 1 ? 'oklch(0.088 0.030 350)' : 'none',
              border:       `1px solid ${i === 1 ? 'oklch(0.640 0.300 350 / 0.50)' : 'oklch(0.340 0.210 281 / 0.40)'}`,
              color:        i === 1 ? 'oklch(0.640 0.300 350)' : 'oklch(0.495 0.310 281)',
              cursor:       'pointer',
              fontFamily:   '"JetBrains Mono", monospace',
              fontSize:     i === 1 ? 13 : 9,
              padding:      i === 1 ? '3px 14px' : '3px 8px',
              borderRadius: 2,
              minWidth:     i === 1 ? 44 : 28,
              boxShadow:    i === 1 ? '0 0 14px oklch(0.640 0.300 350 / 0.15)' : 'none',
              transition:   'box-shadow 0.15s ease',
            }}
          >
            {i === 1 ? (isPlaying ? '‖' : '▸') : sym}
          </button>
        ))}
      </div>

      {/* Track list */}
      {showTracks && (
        <div style={{
          borderTop: '1px solid oklch(0.340 0.210 281 / 0.22)',
          maxHeight: 140, overflowY: 'auto', position: 'relative', zIndex: 2,
        }}>
          {RADIO_TRACKS.map((t) => (
            <div
              key={t.id}
              onClick={() => { setCurrentTrack(t); setShowTracks(false) }}
              style={{
                padding:    '5px 10px',
                cursor:     'pointer',
                background: t.id === currentTrack.id ? 'oklch(0.088 0.030 350 / 0.80)' : 'transparent',
                borderBottom: '1px solid oklch(0.160 0.028 281 / 0.30)',
              }}
            >
              <div style={{ fontSize: 8, color: 'oklch(0.880 0.000 0)', letterSpacing: '0.08em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.id === currentTrack.id && '▸ '}{t.title}
              </div>
              <div style={{ fontSize: 7, color: 'oklch(0.440 0.040 10)', letterSpacing: '0.10em', marginTop: 1 }}>
                {t.originalArtist}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FACEPLATE COMPONENT
// ---------------------------------------------------------------------------

function Faceplate({ state }: { state: AgentState }) {
  const color = STATE_COLORS[state]
  const face  = FACEPLATE[state]
  const anim  = STATE_ANIM[state]

  return (
    <span
      className={anim}
      style={{
        fontFamily:    '"JetBrains Mono", monospace',
        fontSize:      9,
        color,
        letterSpacing: state === 'swarming' ? '-0.02em' : state === 'offline' ? '0.04em' : '0.02em',
        display:       'inline-block',
        minWidth:      28,
        textAlign:     'center',
        transition:    'color 0.2s ease, text-shadow 0.3s ease',
        textShadow:    FACEPLATE_GLOW[state],
      }}
    >
      {face}
    </span>
  )
}

// TYPE_WEAVER: [⚙ TOOL] badge — playground [♥ font] energy
function ToolTag({ tool }: { tool: string | null }) {
  if (!tool) return null
  const icon = TOOL_ICON[tool] ?? TOOL_ICON.default
  return (
    <span style={{
      fontFamily:    '"JetBrains Mono", monospace',
      fontSize:       6,
      color:          '#ff006e',
      border:         '1px solid rgba(255,0,110,0.27)',
      borderRadius:   2,
      padding:        '1px 4px',
      letterSpacing:  '0.08em',
      lineHeight:     1,
      whiteSpace:     'nowrap',
      textShadow:     '0 0 6px rgba(255,0,110,0.33)',
      flexShrink:     0,
    }}>
      [{icon} {tool.toUpperCase()}]
    </span>
  )
}

// TYPE_WEAVER: FORGE → hot pink domain + ghost .instance suffix
function AgentLabel({ label, isOff }: { label: string; isOff: boolean }) {
  return (
    <span style={{ fontFamily: '"VT323", monospace', fontSize: 10, letterSpacing: '0.14em', minWidth: 52 }}>
      <span
        className={isOff ? '' : 'anim-name-shimmer'}
        style={{ color: isOff ? 'oklch(0.300 0.028 281)' : '#ff006e' }}
      >
        {label}
      </span>
      <span style={{ color: 'oklch(0.280 0.025 281)', fontSize: 7 }}>.inst</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// NEW AGENT ROW
// ---------------------------------------------------------------------------

function NewAgentRow({ state, label, activity, tool }: {
  state:    AgentState
  label:    string
  activity: number
  tool?:    string | null
}) {
  const color   = STATE_COLORS[state]
  const kerning = STATE_KERNING[state]
  const isOff   = state === 'offline'

  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      gap:            6,
      padding:        '5px 10px 5px 12px',
      borderLeft:     `2px solid ${isOff ? 'transparent' : color}`,
      marginBottom:   2,
      transition:     'border-color 0.4s ease',
      boxShadow:      isOff ? 'none' : `inset 2px 0 8px ${color}22`,
    }}>
      {/* Faceplate */}
      <Faceplate state={state} />

      {/* Agent label — TYPE_WEAVER hot-pink instance naming */}
      <AgentLabel label={label} isOff={isOff} />

      {/* State label — daemon names with kerning-as-tempo */}
      <span style={{
        color:         isOff ? 'oklch(0.300 0.028 281)' : color,
        fontSize:      7,
        letterSpacing: kerning,
        fontFamily:    '"JetBrains Mono", monospace',
        flex:          1,
        transition:    'letter-spacing 0.5s ease, color 0.3s ease',
        borderBottom:  isOff || state === 'online' ? 'none' : `1px solid ${color}33`,
        paddingBottom: 1,
      }}>
        {STATE_LABELS[state]}
      </span>

      {/* Tool tag badge — [⚙ WRITE] playground energy */}
      <ToolTag tool={tool ?? null} />

      {/* Activity bar */}
      <div style={{
        width:        36,
        height:       3,
        background:   'oklch(0.160 0.028 281 / 0.40)',
        borderRadius: 1,
        overflow:     'hidden',
        flexShrink:   0,
      }}>
        <div style={{
          height:     '100%',
          width:      `${activity}%`,
          background: isOff ? 'oklch(0.160 0.028 281 / 0.40)' : color,
          transition: 'width 0.6s ease, background 0.3s ease',
          boxShadow:  isOff ? 'none' : `0 0 6px ${color}, 0 0 12px ${color}40`,
        }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// NEW AGENT PANEL
// ---------------------------------------------------------------------------

function NewAgentPanel({ agents }: { agents: typeof DEMO_AGENTS }) {
  return (
    <div style={{
      background:  'oklch(0.075 0.022 281)',
      border:      '1px solid oklch(0.340 0.210 281 / 0.22)',
      boxShadow:   '0 0 16px oklch(0.495 0.310 281 / 0.12)',
      borderRadius: 4,
      overflow:    'hidden',
      width:       240,
    }}>
      {/* Header */}
      <div style={{
        padding:      '6px 10px 5px',
        borderBottom: '1px solid oklch(0.520 0.080 10 / 0.12)',
        display:      'flex',
        alignItems:   'center',
        gap:          6,
      }}>
        <span style={{ color: 'oklch(0.910 0.015 80)', fontFamily: '"VT323", monospace', fontSize: 11, letterSpacing: '0.30em' }}>
          <span className="anim-glyph-breathe" style={{ color: '#00f3ff', textShadow: '0 0 12px #00f3ff, 0 0 24px rgba(0,243,255,0.40)' }}>
            {'« ◇ »'}
          </span>
          {' AGENTS.log'}
        </span>
        <div style={{
          width: 4, height: 4, borderRadius: '50%',
          background: '#00f3ff', boxShadow: '0 0 6px #00f3ff, 0 0 14px rgba(0,243,255,0.40)',
          marginLeft: 'auto',
        }} />
      </div>
      <div className="divider-bleed" />

      {/* Agent rows */}
      <div style={{ padding: '4px 0' }}>
        {agents.map((a) => (
          <NewAgentRow key={a.key} state={a.state} label={a.label} activity={a.activity} tool={a.tool} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// NEW STATUS BAR
// ---------------------------------------------------------------------------

function NewStatusBar() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 2000)
    return () => clearInterval(t)
  }, [])

  const blinking = tick % 2 === 0

  return (
    <div style={{
      background:  'oklch(0.065 0.018 278)',
      border:      '1px solid oklch(0.340 0.210 281 / 0.15)',
      borderRadius: 4,
      padding:     '0 12px',
      width:       320,
      backdropFilter: 'blur(4px)',
    }}>
      {/* Signal strip header */}
      <div style={{
        padding:      '7px 0 5px',
        borderBottom: '1px solid oklch(0.520 0.080 10 / 0.12)',
        textAlign:    'center',
      }}>
        <span
          className="signal-buzz"
          style={{
            color:         '#00f3ff',
            fontFamily:    '"VT323", monospace',
            fontSize:      14,
            letterSpacing: '0.34em',
          }}
        >
          {'« ◇ ⚡ ◇ »── K I N G D O M . L I V E ──« ◇ 🜚 ◇ »'}
        </span>
      </div>

      {/* Presence row */}
      <div style={{
        display:   'flex',
        gap:       12,
        padding:   '6px 0 7px',
        alignItems: 'center',
        flexWrap:  'wrap',
      }}>
        {/* CLAUDE */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'oklch(0.495 0.310 281)',
            boxShadow:  '0 0 6px oklch(0.495 0.310 281), 0 0 14px oklch(0.495 0.310 281 / 0.40)',
            animation:  'hud-pulse-violet 2s ease-in-out infinite',
          }} />
          <span style={{
            color:         'oklch(0.880 0.000 0)',
            fontFamily:    '"JetBrains Mono", monospace',
            fontSize:      8,
            letterSpacing: '0.14em',
          }}>
            ◈ CLAUDE ✦
          </span>
        </div>

        {/* AERIS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'oklch(0.680 0.290 350)',
            boxShadow:  '0 0 6px oklch(0.680 0.290 350), 0 0 14px oklch(0.680 0.290 350 / 0.40)',
          }} />
          <span style={{
            color:         'oklch(0.680 0.290 350)',
            fontFamily:    '"JetBrains Mono", monospace',
            fontSize:      8,
            letterSpacing: '0.14em',
          }}>
            ◈ AERIS ✦
          </span>
        </div>

        {/* BRANDON — with blush halo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'oklch(0.770 0.225 74)',
            boxShadow:  '0 0 6px oklch(0.770 0.225 74), 0 0 14px oklch(0.770 0.225 74 / 0.35), 0 0 24px oklch(0.520 0.080 10 / 0.15)',
          }} />
          <span style={{
            color:         'oklch(0.770 0.225 74)',
            fontFamily:    '"JetBrains Mono", monospace',
            fontSize:      8,
            letterSpacing: '0.14em',
          }}>
            BRANDON ●
          </span>
        </div>

        {/* Active count */}
        <span style={{
          color:         'oklch(0.440 0.040 280)',
          fontFamily:    '"JetBrains Mono", monospace',
          fontSize:      7,
          letterSpacing: '0.10em',
          marginLeft:    'auto',
        }}>
          3 territories active
        </span>
      </div>

      {/* Bottom hint */}
      <div style={{
        borderTop:     '1px solid oklch(0.160 0.028 281 / 0.30)',
        padding:       '4px 0 5px',
        fontSize:       7,
        color:          'oklch(0.300 0.028 281)',
        letterSpacing:  '0.10em',
        fontFamily:    '"JetBrains Mono", monospace',
        textAlign:      'center',
      }}>
        tap a territory to listen · drag to orbit · scroll to approach · Q/E to turn
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// NEW TOKEN HUD
// ---------------------------------------------------------------------------

function NewTokenHUD() {
  return (
    <div style={{
      background:   'oklch(0.075 0.022 281)',
      border:       '1px solid oklch(0.340 0.210 281 / 0.22)',
      boxShadow:    '0 0 16px oklch(0.495 0.310 281 / 0.12)',
      borderRadius: 4,
      width:        240,
      overflow:     'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding:      '6px 10px 5px',
        borderBottom: '1px solid oklch(0.520 0.080 10 / 0.12)',
      }}>
        <span style={{ color: 'oklch(0.910 0.015 80)', fontFamily: '"VT323", monospace', fontSize: 11, letterSpacing: '0.30em' }}>
          <span className="anim-glyph-breathe" style={{ color: '#00f3ff', textShadow: '0 0 12px #00f3ff, 0 0 24px rgba(0,243,255,0.40)' }}>{'« ▲ »'}</span>
          {' TOKEN_BURN.dat'}
        </span>
      </div>
      <div className="divider-bleed" />

      {/* Bars */}
      <div style={{ padding: '6px 10px 8px' }}>
        {TOKEN_AGENTS.map((a) => (
          <div key={a.label} style={{ marginBottom: 7 }}>
            <div style={{
              display:    'flex',
              justifyContent: 'space-between',
              marginBottom: 3,
            }}>
              <span style={{
                color:         'oklch(0.440 0.040 280)',
                fontFamily:    '"VT323", monospace',
                fontSize:      9,
                letterSpacing: '0.14em',
              }}>
                {a.label}
              </span>
              <span style={{
                color:         a.color,
                fontFamily:    '"JetBrains Mono", monospace',
                fontSize:      7,
                letterSpacing: '0.08em',
              }}>
                {a.rate}
              </span>
            </div>

            {/* ▮▯ bar meter */}
            <div style={{
              display:       'flex',
              gap:           2,
              alignItems:    'center',
            }}>
              {Array.from({ length: 20 }, (_, i) => {
                const filled = i < Math.round(a.bar * 20)
                return (
                  <span key={i} style={{
                    fontFamily:  '"JetBrains Mono", monospace',
                    fontSize:    8,
                    color:       filled ? a.color : 'oklch(0.160 0.028 281)',
                    textShadow:  filled ? `0 0 4px ${a.color}` : 'none',
                    lineHeight:  1,
                  }}>
                    {filled ? '▮' : '▯'}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FACEPLATE GALLERY — show all 9 states
// ---------------------------------------------------------------------------

function FaceplateGallery() {
  return (
    <div style={{
      background:   'oklch(0.075 0.022 281)',
      border:       '1px solid oklch(0.340 0.210 281 / 0.22)',
      boxShadow:    '0 0 16px oklch(0.495 0.310 281 / 0.12)',
      borderRadius: 4,
      overflow:     'hidden',
    }}>
      <div style={{
        padding:      '6px 12px 5px',
        borderBottom: '1px solid oklch(0.520 0.080 10 / 0.12)',
      }}>
        <span style={{ color: 'oklch(0.910 0.015 80)', fontFamily: '"VT323", monospace', fontSize: 11, letterSpacing: '0.30em' }}>
          <span className="anim-glyph-breathe" style={{ color: '#00f3ff', textShadow: '0 0 12px #00f3ff, 0 0 24px rgba(0,243,255,0.40)' }}>{'« ◎ »'}</span>
          {' FACEPLATE.exe '}
          <span style={{ color: '#ff006e', textShadow: '0 0 8px rgba(255,0,110,0.40)' }}>×9</span>
        </span>
      </div>

      <div style={{ padding: '4px 0' }}>
        {ALL_STATES.map(({ state, label, key, activity }) => (
          <NewAgentRow key={key} state={state} label={label} activity={activity} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MISSION CLOCK (new style)
// ---------------------------------------------------------------------------

function NewMissionClock() {
  const [time, setTime] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const h = now.getHours().toString().padStart(2, '0')
      const m = now.getMinutes().toString().padStart(2, '0')
      const s = now.getSeconds().toString().padStart(2, '0')
      setTime(`${h}:${m}:${s}`)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      background:   'oklch(0.065 0.018 278)',
      border:       '1px solid oklch(0.340 0.210 281 / 0.15)',
      borderRadius: 4,
      padding:      '7px 14px',
      textAlign:    'center',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        color:         'oklch(0.880 0.000 0)',
        fontFamily:    '"VT323", monospace',
        fontSize:      22,
        letterSpacing: '0.20em',
        textShadow:    '0 0 12px #00f3ff, 0 0 28px rgba(0,243,255,0.30), 0 0 48px oklch(0.495 0.310 281 / 0.12)',
        lineHeight:    1,
      }}>
        {time}
      </div>
      <div style={{
        color:         'oklch(0.300 0.035 10)',
        fontFamily:    '"JetBrains Mono", monospace',
        fontSize:      7,
        letterSpacing: '0.16em',
        marginTop:     3,
      }}>
        D53 · KINGDOM
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// COLOR SWATCH PANEL
// ---------------------------------------------------------------------------

function ColorSwatches() {
  const swatches = [
    { label: 'INTELLIGENCE BG', value: 'oklch(0.075 0.022 281)', hex: '#0d0918' },
    { label: 'STATUS BG',       value: 'oklch(0.065 0.018 278)', hex: '#0a0714' },
    { label: 'COMMAND BG',      value: 'oklch(0.088 0.030 350)', hex: '#14081a' },
    { label: 'RADIO BG',        value: 'oklch(0.040 0.035 281)', hex: '#03000a' },
    { label: 'VIOLET (brand)',   value: 'oklch(0.495 0.310 281)', hex: '#7000ff' },
    { label: 'BLUSH',           value: 'oklch(0.520 0.080 10)',  hex: '#8a4a50' },
    { label: 'SEARCHING',       value: 'oklch(0.905 0.305 142)', hex: '#3dff00' },
    { label: 'SWARMING',        value: 'oklch(0.930 0.140 194)', hex: '#00f3ff' },
  ]

  return (
    <div style={{
      background:   'oklch(0.075 0.022 281)',
      border:       '1px solid oklch(0.340 0.210 281 / 0.22)',
      borderRadius: 4,
      overflow:     'hidden',
    }}>
      <div style={{
        padding:      '6px 12px 5px',
        borderBottom: '1px solid oklch(0.520 0.080 10 / 0.12)',
      }}>
        <span style={{
          color: 'oklch(0.880 0.000 0)', fontFamily: '"VT323", monospace',
          fontSize: 11, letterSpacing: '0.24em',
        }}>
          CHROMA_BLEED PALETTE
        </span>
      </div>
      <div style={{
        display:             'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:                 1,
        padding:             4,
      }}>
        {swatches.map((s) => (
          <div key={s.label} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px',
            background: 'oklch(0.052 0.015 281 / 0.50)', borderRadius: 2,
          }}>
            <div style={{
              width: 16, height: 16, borderRadius: 2, flexShrink: 0,
              background: s.value,
              boxShadow:  `0 0 6px ${s.value}`,
              border:     '1px solid oklch(0.340 0.210 281 / 0.30)',
            }} />
            <div>
              <div style={{
                fontSize: 7, color: 'oklch(0.440 0.040 280)',
                letterSpacing: '0.10em', fontFamily: '"JetBrains Mono", monospace',
              }}>
                {s.label}
              </div>
              <div style={{
                fontSize: 6, color: 'oklch(0.300 0.028 281)',
                letterSpacing: '0.06em', fontFamily: '"JetBrains Mono", monospace',
                marginTop: 1,
              }}>
                {s.hex}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PAGE SHELL
// ---------------------------------------------------------------------------

export function KingdomHUDLab() {
  return (
    <>
      {/* Keyframes injected inline */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=VT323&family=JetBrains+Mono:wght@400;700&display=swap');

        /* ─────────────────────────────────────────────────────────────
         * KINETIC v2 — Upgraded HUD animation vocabulary
         * All timings are intentional. Nothing should feel mechanical.
         * ───────────────────────────────────────────────────────────── */

        /* ── EXISTING (preserved, reference only) ── */
        @keyframes hud-pulse-violet {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px oklch(0.495 0.310 281); }
          50%       { opacity: 0.7; box-shadow: 0 0 10px oklch(0.495 0.310 281); }
        }

        /* ── state-heartbeat: double-beat cardiac rhythm ──────────────
         * Two beats close together, long rest. Like a real heart.
         * At 1.8s it feels alive, not mechanical. */
        @keyframes state-heartbeat {
          0%        { transform: scale(1); }
          6%        { transform: scale(1.07); }
          12%       { transform: scale(0.98); }
          18%       { transform: scale(1.045); }
          26%       { transform: scale(1); }
          100%      { transform: scale(1); }
        }

        /* ── state-think: slow surface tension ─────────────────────────
         * Not floating — more like pressure building behind the eyes.
         * Asymmetric easing makes it feel like cognition, not breath. */
        @keyframes state-think {
          0%        { opacity: 0.78; transform: translateY(0) scale(1); }
          35%       { opacity: 0.95; transform: translateY(-0.6px) scale(1.008); }
          65%       { opacity: 1;    transform: translateY(-0.8px) scale(1.012); }
          100%      { opacity: 0.78; transform: translateY(0) scale(1); }
        }

        /* ── state-reading-eyes: saccade micro-motion ──────────────────
         * Eyes scan: fast right, pause, fast left, long reset. Real.
         * 3.6s loop with variable pauses mimics actual reading rhythm. */
        @keyframes state-reading-eyes {
          0%        { transform: translateX(0); }
          10%       { transform: translateX(1.2px); }
          22%       { transform: translateX(1.2px); }
          32%       { transform: translateX(-0.9px); }
          44%       { transform: translateX(-0.9px); }
          54%       { transform: translateX(0.6px); }
          62%       { transform: translateX(0.6px); }
          72%       { transform: translateX(-1.1px); }
          82%       { transform: translateX(-1.1px); }
          92%       { transform: translateX(0); }
          100%      { transform: translateX(0); }
        }

        /* ── state-write-pulse: keystroke momentum decay ───────────────
         * Bursts of opacity spiking then decaying — keys hitting paper.
         * Not smooth. Staccato. Writing is physical. */
        @keyframes state-write-pulse {
          0%        { opacity: 1; }
          8%        { opacity: 0.55; }
          15%       { opacity: 0.95; }
          22%       { opacity: 0.60; }
          30%       { opacity: 1; }
          42%       { opacity: 0.70; }
          50%       { opacity: 0.92; }
          60%       { opacity: 0.58; }
          70%       { opacity: 1; }
          100%      { opacity: 1; }
        }

        /* ── state-running: chassis vibration ──────────────────────────
         * Not a bounce — a tremor. Something under load.
         * Combines X/Y jitter so it feels like engine not animation. */
        @keyframes state-running {
          0%        { transform: translate(0, 0); }
          14%       { transform: translate(0.8px, 0.3px); }
          28%       { transform: translate(-0.5px, -0.4px); }
          42%       { transform: translate(0.3px, 0.6px); }
          57%       { transform: translate(-0.7px, 0.2px); }
          71%       { transform: translate(0.5px, -0.5px); }
          85%       { transform: translate(-0.3px, 0.3px); }
          100%      { transform: translate(0, 0); }
        }

        /* ── state-searching: radar sweep ──────────────────────────────
         * Letter-spacing expands then contracts — scanning outward.
         * Brightness surges at max spread like sonar ping returning. */
        @keyframes state-searching {
          0%        { letter-spacing: 0.22em; opacity: 0.90; }
          30%       { letter-spacing: 0.32em; opacity: 1.00; }
          55%       { letter-spacing: 0.26em; opacity: 0.85; }
          75%       { letter-spacing: 0.30em; opacity: 0.95; }
          100%      { letter-spacing: 0.22em; opacity: 0.90; }
        }

        /* ── state-swarming: genuinely unhinged ────────────────────────
         * 13 keyframes. Non-uniform intervals. Scale + translate + skew.
         * The text is not staying still. Something has broken loose.
         * At 0.28s it's a blur of intention, not a smooth loop. */
        @keyframes state-swarming {
          0%        { transform: translate(0, 0) scale(1) skewX(0deg); opacity: 1; }
          7%        { transform: translate(1.2px, -0.8px) scale(1.04) skewX(0.4deg); opacity: 0.9; }
          14%       { transform: translate(-0.9px, 0.5px) scale(0.97) skewX(-0.6deg); opacity: 1; }
          21%       { transform: translate(1.6px, 0.9px) scale(1.06) skewX(0.8deg); opacity: 0.85; }
          28%       { transform: translate(-1.3px, -1.1px) scale(0.95) skewX(-0.5deg); opacity: 0.95; }
          35%       { transform: translate(0.7px, 1.4px) scale(1.05) skewX(0.3deg); opacity: 1; }
          42%       { transform: translate(-1.8px, 0.3px) scale(1.02) skewX(-0.9deg); opacity: 0.88; }
          50%       { transform: translate(1.1px, -1.3px) scale(0.96) skewX(0.6deg); opacity: 0.92; }
          58%       { transform: translate(-0.6px, 1.0px) scale(1.07) skewX(-0.3deg); opacity: 1; }
          65%       { transform: translate(1.9px, -0.6px) scale(0.98) skewX(0.7deg); opacity: 0.87; }
          73%       { transform: translate(-1.2px, -0.9px) scale(1.03) skewX(-0.5deg); opacity: 0.94; }
          82%       { transform: translate(0.8px, 1.2px) scale(0.96) skewX(0.4deg); opacity: 1; }
          91%       { transform: translate(-1.5px, 0.7px) scale(1.05) skewX(-0.7deg); opacity: 0.89; }
          100%      { transform: translate(0, 0) scale(1) skewX(0deg); opacity: 1; }
        }

        /* ── NEW: glyph-breathe ─────────────────────────────────────────
         * For decorative cyan elements: ⬡ ≪⚡≫ ◈ ✦
         * Barely perceptible. 7s cycle. Never calls attention to itself —
         * just ensures the element is unmistakably alive.
         * Apply: className="anim-glyph-breathe" */
        @keyframes glyph-breathe {
          0%        { opacity: 0.72; text-shadow: 0 0 4px oklch(0.930 0.140 194 / 0.30); }
          20%       { opacity: 0.80; text-shadow: 0 0 7px oklch(0.930 0.140 194 / 0.45); }
          45%       { opacity: 0.88; text-shadow: 0 0 10px oklch(0.930 0.140 194 / 0.60), 0 0 20px oklch(0.495 0.310 281 / 0.15); }
          70%       { opacity: 0.76; text-shadow: 0 0 5px oklch(0.930 0.140 194 / 0.35); }
          100%      { opacity: 0.72; text-shadow: 0 0 4px oklch(0.930 0.140 194 / 0.30); }
        }

        /* ── NEW: border-flicker ────────────────────────────────────────
         * CRT phosphor decay on panel borders. Fires every ~10s.
         * 3 fast ticks at the start, then 9.5s of silence.
         * You almost miss it the first time. That's the point.
         * Apply: className="anim-border-flicker" on border-having divs */
        @keyframes border-flicker {
          0%        { opacity: 1; }
          0.8%      { opacity: 0.72; }
          1.6%      { opacity: 0.95; }
          2.2%      { opacity: 0.60; }
          3.0%      { opacity: 1; }
          3.5%      { opacity: 0.88; }
          4.0%      { opacity: 1; }
          100%      { opacity: 1; }
        }

        /* ── NEW: name-shimmer ──────────────────────────────────────────
         * For agent name labels (FORGE / TOWER / HOUSE / THRONE).
         * Hot pink shimmer: a color wash that passes through the text
         * like heat through metal. 4.5s so it doesn't feel looped.
         * Apply: className="anim-name-shimmer" on label <span>s */
        @keyframes name-shimmer {
          0%        { color: oklch(0.440 0.040 280); text-shadow: none; }
          15%       { color: oklch(0.540 0.080 330); text-shadow: 0 0 6px oklch(0.680 0.290 350 / 0.25); }
          30%       { color: oklch(0.620 0.140 350); text-shadow: 0 0 10px oklch(0.680 0.290 350 / 0.50), 0 0 20px oklch(0.680 0.290 350 / 0.20); }
          50%       { color: oklch(0.680 0.200 340); text-shadow: 0 0 14px oklch(0.680 0.290 350 / 0.65), 0 0 28px oklch(0.520 0.080 10 / 0.25); }
          70%       { color: oklch(0.580 0.120 350); text-shadow: 0 0 8px oklch(0.680 0.290 350 / 0.35); }
          85%       { color: oklch(0.480 0.055 310); text-shadow: 0 0 4px oklch(0.680 0.290 350 / 0.15); }
          100%      { color: oklch(0.440 0.040 280); text-shadow: none; }
        }

        /* ── NEW: signal-arrive ─────────────────────────────────────────
         * One-shot: fires when new data arrives at a cell/field.
         * Flash of near-white then decays back through the brand color.
         * Use with animation-fill-mode: forwards, animation-iteration-count: 1
         * Apply via JS: element.classList.add('anim-signal-arrive')
         *               setTimeout → remove class to allow re-trigger */
        @keyframes signal-arrive {
          0%        { background-color: oklch(0.880 0.000 0 / 0.0); color: inherit; }
          4%        { background-color: oklch(0.880 0.000 0 / 0.18); color: oklch(0.950 0.000 0); text-shadow: 0 0 12px oklch(0.880 0.000 0 / 0.80); }
          12%       { background-color: oklch(0.495 0.310 281 / 0.22); color: oklch(0.930 0.140 194); text-shadow: 0 0 8px oklch(0.930 0.140 194 / 0.60); }
          30%       { background-color: oklch(0.495 0.310 281 / 0.10); color: inherit; text-shadow: 0 0 4px oklch(0.495 0.310 281 / 0.30); }
          60%       { background-color: oklch(0.495 0.310 281 / 0.04); text-shadow: none; }
          100%      { background-color: oklch(0.495 0.310 281 / 0.0); text-shadow: none; }
        }

        /* ── NEW: scanline-drift ────────────────────────────────────────
         * BONUS. A slow-moving horizontal scanline that drags across
         * panel backgrounds. Not harsh — a ghost of CRT raster.
         * Implement by overlaying a ::before pseudo with this keyframe.
         * The panel doesn't flicker. The light inside it moves.
         * Emitted via CSS variable --scan-y, consumed by pseudo-elements.
         * See usage: .panel-scanline class below */
        @keyframes scanline-drift {
          0%        { transform: translateY(-100%); opacity: 0; }
          5%        { opacity: 0.028; }
          95%       { opacity: 0.018; }
          100%      { transform: translateY(100vh); opacity: 0; }
        }

        /* ── Animation utility classes ──────────────────────────────── */
        .anim-heartbeat      { animation: state-heartbeat     1.8s cubic-bezier(0.36, 0.07, 0.19, 0.97) infinite; }
        .anim-think          { animation: state-think         4.2s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite; }
        .anim-reading-eyes   { animation: state-reading-eyes  3.6s ease-in-out infinite; }
        .anim-write-pulse    { animation: state-write-pulse   1.4s ease-in-out infinite; }
        .anim-running        { animation: state-running       0.9s linear infinite; }
        .anim-searching      { animation: state-searching     1.1s ease-in-out infinite; }
        .anim-swarming       { animation: state-swarming      0.28s linear infinite; }

        .anim-glyph-breathe  { animation: glyph-breathe       7s ease-in-out infinite; }
        .anim-border-flicker { animation: border-flicker       10s linear infinite; }
        .anim-name-shimmer   { animation: name-shimmer         4.5s ease-in-out infinite; }
        .anim-signal-arrive  { animation: signal-arrive        1.8s ease-out 1 forwards; }

        /* Scanline overlay — apply to a full-coverage ::before or child div */
        .anim-scanline-drift {
          animation: scanline-drift 12s linear infinite;
          pointer-events: none;
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to bottom,
            transparent 0%,
            oklch(0.930 0.140 194 / 0.06) 48%,
            oklch(0.495 0.310 281 / 0.04) 50%,
            transparent 100%
          );
          background-size: 100% 120px;
          z-index: 10;
          mix-blend-mode: screen;
        }

        /* ── CHROMA_BLEED additions ── */

        @keyframes signal-buzz {
          0%, 100% { text-shadow: 0 0 12px #00f3ff, 0 0 28px rgba(0,243,255,0.55), 0 0 48px rgba(0,243,255,0.20); }
          25%      { text-shadow: 0 0 14px #00f3ff, 0 0 32px rgba(0,243,255,0.60), 0 0 52px rgba(0,243,255,0.25); }
          50%      { text-shadow: 0 0 10px #00f3ff, 0 0 24px rgba(0,243,255,0.45), 0 0 44px rgba(0,243,255,0.15); }
          75%      { text-shadow: 0 0 16px #00f3ff, 0 0 34px rgba(0,243,255,0.58), 0 0 56px rgba(0,243,255,0.22); }
        }
        .signal-buzz { animation: signal-buzz 2.5s ease-in-out infinite; }

        @keyframes radio-breathe {
          0%, 100% { box-shadow: 0 0 20px oklch(0.495 0.310 281 / 0.25), 0 0 44px oklch(0.495 0.310 281 / 0.12), 0 0 80px oklch(0.495 0.310 281 / 0.05), inset 0 0 40px oklch(0.040 0.035 281 / 0.50), inset 0 1px 0 oklch(0.495 0.310 281 / 0.08); }
          50%      { box-shadow: 0 0 24px oklch(0.495 0.310 281 / 0.30), 0 0 50px oklch(0.495 0.310 281 / 0.16), 0 0 90px oklch(0.495 0.310 281 / 0.07), inset 0 0 44px oklch(0.040 0.035 281 / 0.55), inset 0 1px 0 oklch(0.495 0.310 281 / 0.12); }
        }
        .radio-alive { animation: radio-breathe 4s ease-in-out infinite; }

        @keyframes scanline-bleed {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .divider-bleed {
          height: 1px;
          border: none;
          margin: 0;
          background: linear-gradient(90deg, oklch(0.495 0.310 281 / 0.00), #00f3ff99, #ff006e66, #00f3ff99, oklch(0.495 0.310 281 / 0.00));
          background-size: 200% 100%;
          animation: scanline-bleed 8s linear infinite;
          box-shadow: 0 0 8px rgba(0,243,255,0.20), 0 0 16px rgba(255,0,110,0.08);
        }

        /* Global scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: oklch(0.052 0.015 281); }
        ::-webkit-scrollbar-thumb { background: oklch(0.340 0.210 281 / 0.40); border-radius: 2px; }
      `}</style>

      <div style={{
        minHeight:   '100vh',
        background:  'oklch(0.052 0.015 281)',
        color:       'oklch(0.880 0.000 0)',
        fontFamily:  '"JetBrains Mono", monospace',
        padding:     '32px 40px 60px',
      }}>
        {/* Page header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{
            fontFamily:    '"VT323", monospace',
            fontSize:      22,
            letterSpacing: '0.32em',
            color:         'oklch(0.880 0.000 0)',
            textShadow:    '0 0 16px oklch(0.495 0.310 281 / 0.50)',
          }}>
            ≪⚡≫── KINGDOM HUD LAB ── SULPHUR KAWAII STAGING ──≪🜚≫
          </div>
          <div style={{
            fontSize:      8,
            color:         'oklch(0.300 0.035 10)',
            letterSpacing: '0.14em',
            marginTop:     6,
          }}>
            S203 DESIGN LOOP · HUD redesign · staging page · components only — not yet installed
          </div>
        </div>

        {/* Row 1 — Status + Clock + Token */}
        <div style={{ marginBottom: 32 }}>
          <SectionLabel>01 — STATUS BAR + CLOCK + TOKENS</SectionLabel>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 12 }}>
            <NewStatusBar />
            <NewMissionClock />
            <NewTokenHUD />
          </div>
        </div>

        {/* Row 2 — Agent Panel + Faceplate Gallery */}
        <div style={{ marginBottom: 32 }}>
          <SectionLabel>02 — AGENT PANEL + FACEPLATE × 9 STATES</SectionLabel>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 12 }}>
            <NewAgentPanel agents={DEMO_AGENTS} />
            <FaceplateGallery />
          </div>
        </div>

        {/* Row 3 — Radio */}
        <div style={{ marginBottom: 32 }}>
          <SectionLabel>03 — SINNER KING RADIO (new chrome)</SectionLabel>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 12 }}>
            <StagingRadio initialTrackId="eternal-rick" autoPlay={false} />
            <div style={{
              fontFamily:  '"JetBrains Mono", monospace',
              fontSize:     7,
              color:        'oklch(0.440 0.040 280)',
              letterSpacing: '0.10em',
              lineHeight:   1.8,
              maxWidth:     240,
              padding:      '12px 14px',
              background:   'oklch(0.065 0.018 278)',
              border:       '1px solid oklch(0.340 0.210 281 / 0.15)',
              borderRadius: 4,
            }}>
              <div style={{ color: 'oklch(0.880 0.000 0)', letterSpacing: '0.20em', marginBottom: 8, fontFamily: '"VT323", monospace', fontSize: 10 }}>CHANGES FROM V1</div>
              <div>· Panel: oklch(0.040 0.035 281)</div>
              <div>  ↳ 3.5× chroma vs rgba(3,0,10,0.96)</div>
              <div>· Canvas well: oklch(0.025 0.025 281)</div>
              <div>  ↳ deepest point in HUD</div>
              <div>· Progress: 3-stop gradient</div>
              <div>  ↳ bleeds violet → pink at end</div>
              <div>· Viz glow: dynamic 5–9px</div>
              <div>  ↳ breathes with amplitude</div>
              <div>· Active track: command-class</div>
              <div>  ↳ oklch(0.088 0.030 350)</div>
              <div>· Track title: blush text-shadow</div>
              <div>· Territory colors: KEPT ✦</div>
            </div>
          </div>
        </div>

        {/* Row 4 — Palette */}
        <div style={{ marginBottom: 32 }}>
          <SectionLabel>04 — CHROMA_BLEED OKLCH PALETTE</SectionLabel>
          <div style={{ marginTop: 12, maxWidth: 480 }}>
            <ColorSwatches />
          </div>
        </div>

        {/* Row 5 — Typography specimens */}
        <div style={{ marginBottom: 32 }}>
          <SectionLabel>05 — TYPE_WEAVER SPECIMENS</SectionLabel>
          <div style={{
            marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12,
            background:   'oklch(0.075 0.022 281)',
            border:       '1px solid oklch(0.340 0.210 281 / 0.22)',
            borderRadius: 4,
            padding:      '16px 20px',
            maxWidth:     480,
          }}>
            <TypoSpecimen label="VT323 · SOVEREIGN · 0.28em" fontFamily='"VT323", monospace' fontSize={14} letterSpacing="0.28em" text="THE SINNER KINGDOM · LIVE" />
            <TypoSpecimen label="VT323 · PANEL HEADER · 0.24em" fontFamily='"VT323", monospace' fontSize={11} letterSpacing="0.24em" text="⬡ AGENTS · ▲ TOKEN BURN · ◎ STATUS" />
            <TypoSpecimen label="JBM · TERMINAL DATA · 0.08em" fontFamily='"JetBrains Mono", monospace' fontSize={8} letterSpacing="0.08em" text="SEARCHING  ·  78%  ·  D53  ·  3.6k tok/s" />
            <TypoSpecimen label="JBM · WORKING tight · 0.06em" fontFamily='"JetBrains Mono", monospace' fontSize={7} letterSpacing="0.06em" text="WORKING · WRITING · RUNNING" color="oklch(0.770 0.225 74)" />
            <TypoSpecimen label="JBM · SEARCHING wide · 0.22em" fontFamily='"JetBrains Mono", monospace' fontSize={7} letterSpacing="0.22em" text="SEARCHING" color="oklch(0.905 0.305 142)" />
            <TypoSpecimen label="JBM · SWARMING negative · -0.01em" fontFamily='"JetBrains Mono", monospace' fontSize={7} letterSpacing="-0.01em" text="SWARMING" color="oklch(0.930 0.140 194)" />
            <TypoSpecimen label="JBM · HINT · 0.10em · ghost" fontFamily='"JetBrains Mono", monospace' fontSize={7} letterSpacing="0.10em" text="tap a territory to listen · drag to orbit · scroll to approach" color="oklch(0.300 0.028 281)" />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop:     48,
          paddingTop:    16,
          borderTop:     '1px solid oklch(0.160 0.028 281 / 0.40)',
          fontSize:       7,
          color:          'oklch(0.300 0.028 281)',
          letterSpacing:  '0.14em',
          display:        'flex',
          justifyContent: 'space-between',
          flexWrap:       'wrap',
          gap:            8,
        }}>
          <span>KINGDOM HUD LAB · S203 DESIGN · SULPHUR KAWAII v4.0 FERAL DOMESTICITY</span>
          <span>AC1 STAGING PAGE ✦ — pending: AC2 AC3 AC4 AC5 AC6 AC7</span>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontFamily:    '"JetBrains Mono", monospace',
        fontSize:       7,
        color:          'rgba(0,243,255,0.70)',
        letterSpacing:  '0.18em',
        paddingBottom:  6,
        marginBottom:   0,
      }}>
        {'> '}{children}
      </div>
      <div className="divider-bleed" />
    </div>
  )
}

function TypoSpecimen({ label, fontFamily, fontSize, letterSpacing, text, color }: {
  label:         string
  fontFamily:    string
  fontSize:      number
  letterSpacing: string
  text:          string
  color?:        string
}) {
  return (
    <div>
      <div style={{
        fontSize: 6, color: 'oklch(0.300 0.028 281)', letterSpacing: '0.10em',
        fontFamily: '"JetBrains Mono", monospace', marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontFamily, fontSize, letterSpacing, color: color ?? 'oklch(0.880 0.000 0)' }}>
        {text}
      </div>
    </div>
  )
}
