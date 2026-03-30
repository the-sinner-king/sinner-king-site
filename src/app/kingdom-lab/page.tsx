'use client'

import { useState } from 'react'

// ─── AGENT STATE DATA ─────────────────────────────────────────────────────────
type PulseLevel = false | 'low' | 'mid' | 'high'
const AGENT_STATES: Record<string, { color: string; pulse: PulseLevel }> = {
  offline:  { color: '#1c1030', pulse: false },
  online:   { color: '#7700ff', pulse: false },
  thinking: { color: '#9a40ff', pulse: 'low' },
  reading:  { color: '#00d4ff', pulse: 'low' },
  working:  { color: '#f5aa00', pulse: 'mid' },
  writing:  { color: '#ff3d85', pulse: 'mid' },
  running:  { color: '#ff6b35', pulse: 'mid' },
  searching:{ color: '#44ff00', pulse: 'high' },
  swarming: { color: '#72faff', pulse: 'high' },
}

type AgentState = keyof typeof AGENT_STATES

interface Territory {
  id: string
  name: string
  color: string
  state: AgentState
  hasAgent: boolean
  description: string
  work: string
  activity: number
  x: string
  y: string
}

// ─── TERRITORY DATA ───────────────────────────────────────────────────────────
const TERRITORIES: Territory[] = [
  {
    id: 'scryer',
    name: 'THE SCRYER',
    color: '#00d4ff',
    state: 'offline',
    hasAgent: false,
    description: 'Intelligence layer. 7.6K chunks. Kingdom memory corpus. Four active corpora.',
    work: 'Inactive — archive only',
    activity: 0,
    x: '12%',
    y: '20%',
  },
  {
    id: 'core_lore',
    name: 'CORE LORE',
    color: '#00d4ff',
    state: 'online',
    hasAgent: false,
    description: '9.6K chunks. Soulforge 2.0. THE LAW STANDS. Cathedral warm.',
    work: 'Live — knowledge does not sleep',
    activity: 45,
    x: '52%',
    y: '13%',
  },
  {
    id: 'throne',
    name: 'THE THRONE',
    color: '#7700ff',
    state: 'online',
    hasAgent: true,
    description: 'Command layer. Aeris Portal. Direct Anthropic API. The seat of intent.',
    work: 'Awaiting directive',
    activity: 22,
    x: '70%',
    y: '36%',
  },
  {
    id: 'claudes_house',
    name: "CLAUDE'S HOUSE",
    color: '#ff3d85',
    state: 'writing',
    hasAgent: true,
    description: 'Architect domain. Memory, journal, identity. Session S196.',
    work: 'Writing: BADGE_NORTH_STAR assembly loop',
    activity: 88,
    x: '20%',
    y: '50%',
  },
  {
    id: 'forge',
    name: 'THE FORGE',
    color: '#f5aa00',
    state: 'working',
    hasAgent: true,
    description: 'Execution territory. Aeris. Active fabrication layer. Build or burn.',
    work: 'Refactoring TerritoryNode build system, extracting geometry config',
    activity: 85,
    x: '46%',
    y: '55%',
  },
  {
    id: 'tower',
    name: 'THE TOWER',
    color: '#f5aa00',
    state: 'searching',
    hasAgent: true,
    description: 'Outward face. sinner-king.com. Next.js 15. DNS pending.',
    work: 'Searching: kingdom-lab sandbox route assembly',
    activity: 77,
    x: '30%',
    y: '33%',
  },
]

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getDotAnim(state: AgentState): string {
  const p = AGENT_STATES[state].pulse
  if (!p) return 'none'
  if (p === 'low')  return 'dot-pulse-low  1.8s cubic-bezier(0.87,0,0.13,1) infinite'
  if (p === 'mid')  return 'dot-pulse-mid  1.2s cubic-bezier(0.87,0,0.13,1) infinite'
  return 'dot-pulse-high 0.6s cubic-bezier(0.87,0,0.13,1) infinite'
}

function getDotSize(state: AgentState): number {
  if (state === 'offline') return 4
  if (['online', 'thinking', 'reading'].includes(state)) return 6
  return 14
}

function getStateLabel(state: AgentState): string {
  if (state === 'offline' || state === 'online') return ''
  return state.toUpperCase()
}

function isActiveState(state: AgentState): boolean {
  return !['offline', 'online'].includes(state)
}

// ─── INJECTED STYLES ──────────────────────────────────────────────────────────
const INJECTED_CSS = `
@import url('https://fonts.googleapis.com/css2?family=VT323&family=Fira+Code:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap');

* { box-sizing: border-box; margin: 0; padding: 0; }

@keyframes dot-pulse-low {
  0%, 100% { transform: scale(0.85); opacity: 0.6; }
  50%       { transform: scale(1.10); opacity: 0.9; }
}
@keyframes dot-pulse-mid {
  0%, 100% { transform: scale(0.85); opacity: 0.7; }
  50%       { transform: scale(1.15); opacity: 1.0; }
}
@keyframes dot-pulse-high {
  0%, 100% { transform: scale(0.80); opacity: 0.6; }
  50%       { transform: scale(1.20); opacity: 1.0; }
}
@keyframes scanline-cycle {
  0%   { transform: scaleX(0); opacity: 0.2; }
  50%  { transform: scaleX(1); opacity: 0.6; }
  100% { transform: scaleX(0); opacity: 0.2; }
}
@keyframes panel-descend {
  0%   { opacity: 0; transform: translateY(-24px) scaleY(0.85); transform-origin: top center; }
  100% { opacity: 1; transform: translateY(0)     scaleY(1.00); transform-origin: top center; }
}
@keyframes badge-zzz {
  0%   { opacity: 0;    transform: translateY(0)    scale(0.8); }
  20%  { opacity: 0.55; }
  80%  { opacity: 0.30; }
  100% { opacity: 0;    transform: translateY(-14px) scale(1.0); }
}
@keyframes ticker-scroll {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

/* VT323 scan-line pseudo — applied via className */
.territory-name-scanline {
  position: relative;
}
.territory-name-scanline::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent 49%, rgba(0,243,255,0.10) 50%, transparent 51%);
  pointer-events: none;
}

/* Panel heading scan-line */
.panel-heading-scanline {
  position: relative;
}
.panel-heading-scanline::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent 49%, rgba(0,243,255,0.08) 50%, transparent 51%);
  pointer-events: none;
}

/* Swarm button hover */
.swarm-btn {
  transition: opacity 80ms cubic-bezier(0.87,0,0.13,1),
              background 80ms cubic-bezier(0.87,0,0.13,1),
              transform 80ms cubic-bezier(0.87,0,0.13,1);
}
.swarm-btn:hover {
  opacity: 1 !important;
}
.swarm-btn:active {
  transform: scale(0.97);
}
`

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function KingdomLabPage() {
  const [selectedId, setSelectedId] = useState<string | null>('forge')
  const selected = TERRITORIES.find(t => t.id === selectedId) ?? null

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#08070f',
      overflow: 'hidden',
      fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
    }}>
      {/* ── Font + Keyframe injection ── */}
      <style dangerouslySetInnerHTML={{ __html: INJECTED_CSS }} />

      {/* ── Void background: scanlines + radial depth ── */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `
          repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.025) 2px, rgba(0,0,0,0.025) 4px),
          radial-gradient(ellipse 60% 50% at 30% 65%, oklch(0.085 0.025 279 / 0.40) 0%, transparent 100%),
          radial-gradient(ellipse 40% 40% at 75% 25%, oklch(0.052 0.018 278 / 0.60) 0%, transparent 100%),
          #08070f
        `,
      }} />

      {/* ── Violet grid ── */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(119,0,255,0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(119,0,255,0.035) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
      }} />

      {/* ── LAB watermark ── */}
      <div aria-hidden style={{
        position: 'absolute', top: '13px', left: '50%',
        transform: 'translateX(-50%)',
        fontFamily: "'Fira Code', monospace",
        fontSize: 'clamp(7px, 0.58vw + 0.2rem, 9px)',
        letterSpacing: '0.22em',
        color: 'rgba(119,0,255,0.22)',
        textTransform: 'uppercase',
        pointerEvents: 'none',
        zIndex: 30,
        whiteSpace: 'nowrap',
      }}>
        KINGDOM_LAB · SANDBOX · GLITCHSWARM S196
      </div>

      {/* ── TERRITORY LABELS ── */}
      {TERRITORIES.map(t => {
        const sc    = AGENT_STATES[t.state].color
        const isSel = t.id === selectedId
        const dotSz = getDotSize(t.state)
        const sLabel = getStateLabel(t.state)
        const active = isActiveState(t.state)

        return (
          <div
            key={t.id}
            onClick={() => setSelectedId(isSel ? null : t.id)}
            style={{
              position: 'absolute',
              left: t.x,
              top: t.y,
              cursor: 'pointer',
              userSelect: 'none',
              zIndex: 10,
              opacity: isSel ? 1 : 0.82,
              transition: 'opacity 400ms cubic-bezier(0.87,0,0.13,1)',
            }}
          >
            {/* Zzz — above, offline + hasAgent */}
            {t.state === 'offline' && t.hasAgent && (
              <div style={{ position: 'absolute', top: '-20px', left: '22px', pointerEvents: 'none' }}>
                {([
                  { l: '-2px',  delay: '0s',    sz: '0.85em' },
                  { l: '8px',   delay: '0.65s', sz: '1.0em'  },
                  { l: '17px',  delay: '1.3s',  sz: '0.75em' },
                ] as const).map((z, i) => (
                  <span key={i} style={{
                    position: 'absolute', left: z.l,
                    fontFamily: "'Fira Code', monospace",
                    fontSize: z.sz,
                    color: '#1c1030',
                    filter: 'brightness(3)',
                    opacity: 0,
                    animation: `badge-zzz 2s cubic-bezier(0.87,0,0.13,1) ${z.delay} infinite`,
                    lineHeight: 1,
                  }}>z</span>
                ))}
              </div>
            )}

            {/* 4-column label grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '3px 20px 1fr auto',
              gridTemplateRows: 'auto 2px',
              columnGap: '6px',
              rowGap: '3px',
              alignItems: 'center',
            }}>
              {/* Rule — col 1, rows 1+2 */}
              <div style={{
                gridColumn: '1', gridRow: '1 / 3',
                width: '3px', alignSelf: 'stretch',
                background: t.color, opacity: 0.6,
              }} />

              {/* Dot — col 2, row 1 */}
              <div style={{
                gridColumn: '2', gridRow: '1',
                width: `${dotSz}px`, height: `${dotSz}px`,
                borderRadius: '50%', justifySelf: 'center',
                background: t.state === 'offline' ? 'transparent' : sc,
                border: t.state === 'offline' ? `1px solid ${sc}` : 'none',
                boxShadow: t.state === 'offline' ? 'none' : `0 0 ${dotSz}px ${sc}88`,
                opacity: t.state === 'offline' ? 0.35 : 1,
                animation: getDotAnim(t.state),
                transition: 'width 300ms cubic-bezier(0.87,0,0.13,1), height 300ms cubic-bezier(0.87,0,0.13,1)',
              }} />

              {/* Name — col 3, row 1 — VT323 */}
              <div
                className="territory-name-scanline"
                style={{
                  gridColumn: '3', gridRow: '1',
                  fontFamily: "'VT323', 'Courier New', monospace",
                  fontSize: 'clamp(9px, 0.72vw + 0.25rem, 11px)',
                  letterSpacing: '0.20em',
                  textTransform: 'uppercase',
                  color: t.state === 'offline' ? 'oklch(35% 0.02 280)' : t.color,
                  opacity: t.state === 'offline' ? 0.5 : (isSel ? 1.0 : 0.85),
                  whiteSpace: 'nowrap',
                  transform: isSel ? 'translateX(4px)' : 'translateX(0)',
                  transition: 'transform 400ms cubic-bezier(0.87,0,0.13,1), opacity 400ms cubic-bezier(0.87,0,0.13,1)',
                }}
              >
                {t.name}
              </div>

              {/* State label — col 4, row 1 — JetBrains Mono */}
              {sLabel && (
                <div style={{
                  gridColumn: '4', gridRow: '1',
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 'clamp(7px, 0.58vw + 0.2rem, 9px)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: sc,
                  opacity: 1.0,
                  paddingLeft: '6px',
                  paddingRight: '4px',
                  background: `${sc}18`,
                  textShadow: `0 0 4px ${sc}88`,
                  whiteSpace: 'nowrap',
                }}>
                  {sLabel}
                </div>
              )}

              {/* Scan line — col 2-4, row 2 */}
              <div style={{
                gridColumn: '2 / 5', gridRow: '2',
                height: '1px',
                background: t.color,
                opacity: t.state === 'offline' ? 0 : 0.3,
                transformOrigin: 'left center',
                transform: active ? undefined : `scaleX(${t.state === 'offline' ? 0 : 0.4})`,
                animation: active ? 'scanline-cycle 1200ms cubic-bezier(0.87,0,0.13,1) infinite' : 'none',
                transition: 'transform 600ms cubic-bezier(0.87,0,0.13,1)',
              }} />
            </div>
          </div>
        )
      })}

      {/* ── HUD FRAME — the perimeter grid ── */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'grid',
        gridTemplateColumns: '220px 1fr 280px',
        gridTemplateRows: '48px 1fr 1fr 28px',
        gridTemplateAreas: `
          ". . status"
          "swarm . panel"
          "swarm . ."
          "ticker ticker ticker"
        `,
        pointerEvents: 'none',
        zIndex: 20,
      }}>

        {/* STATUS BAR */}
        <div style={{
          gridArea: 'status',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          padding: '0 20px 0 12px',
          justifyContent: 'center',
          borderTop: '1px solid rgba(119,0,255,0.10)',
          borderLeft: '1px solid rgba(119,0,255,0.06)',
          background: 'linear-gradient(270deg, rgba(8,7,15,0.65) 0%, transparent 100%)',
        }}>
          <div style={{
            fontFamily: "'Fira Code', monospace",
            fontSize: 'clamp(9px, 0.72vw + 0.25rem, 11px)',
            letterSpacing: '0.12em',
            color: '#e8e0d0',
            textTransform: 'uppercase',
          }}>
            <span style={{ color: '#44ff00', marginRight: '6px' }}>●</span>
            KINGDOM LIVE
          </div>
          <div style={{
            fontFamily: "'Fira Code', monospace",
            fontSize: 'clamp(7px, 0.58vw + 0.2rem, 9px)',
            letterSpacing: '0.18em',
            color: '#6a5a50',
            textTransform: 'uppercase',
          }}>
            3 ACTIVE · S196 · D50
          </div>
        </div>

        {/* SWARM LAUNCHER */}
        <div style={{
          gridArea: 'swarm',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          padding: '0 0 36px 20px',
          justifyContent: 'flex-end',
          alignSelf: 'stretch',
          pointerEvents: 'auto',
        }}>
          {([
            { icon: '⬡', label: 'SEARCH',       state: 'searching' },
            { icon: '⚡', label: 'DEPLOY FORGE', state: 'working'   },
            { icon: '👁', label: 'THRONE SYNC',  state: 'online'    },
            { icon: '◈', label: 'SCRYER SCAN',   state: 'reading'   },
            { icon: '🗼', label: 'TOWER BUILD',   state: 'running'   },
          ] as const).map(btn => {
            const bc = AGENT_STATES[btn.state].color
            return (
              <button key={btn.label} className="swarm-btn" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 10px',
                background: `${bc}12`,
                border: `1px solid ${bc}35`,
                borderRadius: 0,
                cursor: 'pointer',
                fontFamily: "'Fira Code', monospace",
                fontSize: 'clamp(7px, 0.58vw + 0.2rem, 9px)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: bc,
                opacity: 0.65,
                width: '180px',
              }}>
                <span style={{ fontSize: '11px', lineHeight: 1 }}>{btn.icon}</span>
                <span>{btn.label}</span>
              </button>
            )
          })}
        </div>

        {/* TERRITORY PANEL — blast shield */}
        {selected && (
          <div style={{
            gridArea: 'panel',
            alignSelf: 'start',
            justifySelf: 'end',
            paddingTop: '8px',
            pointerEvents: 'auto',
            animation: 'panel-descend 480ms cubic-bezier(0.87,0,0.13,1) both',
          }}>
            <div style={{
              width: '280px',
              background: 'oklch(8.5% 0.025 279 / 0.94)',
              backdropFilter: 'blur(6px)',
              borderLeft: `3px solid ${selected.color}`,
              borderRight: '1px solid rgba(100,60,180,0.22)',
              borderTop: '1px solid rgba(100,60,180,0.22)',
              borderBottom: '1px solid rgba(100,60,180,0.22)',
              borderRadius: 0,
            }}>
              {/* Name — 40px row */}
              <div
                className="panel-heading-scanline"
                style={{
                  height: '40px',
                  display: 'flex',
                  alignItems: 'flex-end',
                  padding: '0 16px 8px',
                  fontFamily: "'VT323', 'Courier New', monospace",
                  fontSize: 'clamp(17px, 1.41vw + 0.56rem, 22px)',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: selected.color,
                  textShadow: `0 0 10px ${selected.color}66`,
                  lineHeight: 1.1,
                }}
              >
                {selected.name}
              </div>

              {/* Separator */}
              <div style={{
                height: '1px',
                background: selected.color,
                opacity: 0.2,
                margin: '0 16px',
              }} />

              {/* Description */}
              <div style={{
                padding: '12px 16px 0',
                fontFamily: "'Fira Code', monospace",
                fontSize: 'clamp(9px, 0.72vw + 0.25rem, 11px)',
                lineHeight: 1.65,
                letterSpacing: '0.02em',
                color: '#a09888',
              }}>
                {selected.description}
              </div>

              {/* Gap */}
              <div style={{ height: '16px' }} />

              {/* State row — 3-col subgrid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '8px 1fr 28px',
                columnGap: '8px',
                alignItems: 'center',
                padding: '0 16px',
                height: '24px',
              }}>
                <div style={{
                  width: '8px', height: '8px',
                  borderRadius: '50%',
                  background: AGENT_STATES[selected.state].color,
                  boxShadow: `0 0 8px ${AGENT_STATES[selected.state].color}`,
                  animation: isActiveState(selected.state) ? getDotAnim(selected.state) : 'none',
                }} />
                <div style={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 'clamp(7px, 0.58vw + 0.2rem, 9px)',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: AGENT_STATES[selected.state].color,
                  textShadow: isActiveState(selected.state)
                    ? `0 0 6px ${AGENT_STATES[selected.state].color}88`
                    : 'none',
                }}>
                  {selected.state.toUpperCase()}
                </div>
                <div style={{
                  fontFamily: "'Fira Code', monospace",
                  fontSize: 'clamp(9px, 0.72vw + 0.25rem, 11px)',
                  letterSpacing: '0.06em',
                  fontVariantNumeric: 'tabular-nums',
                  color: '#6a5a50',
                  textAlign: 'right',
                }}>
                  {selected.activity}
                </div>
              </div>

              {/* Work row */}
              {selected.work && (
                <div style={{
                  padding: '6px 16px 14px',
                  marginTop: '6px',
                  fontFamily: "'Fira Code', monospace",
                  fontSize: 'clamp(7px, 0.58vw + 0.2rem, 9px)',
                  lineHeight: 1.6,
                  letterSpacing: '0.06em',
                  color: '#504840',
                  borderTop: '1px solid rgba(100,60,180,0.10)',
                }}>
                  {selected.work}
                </div>
              )}
            </div>
          </div>
        )}

        {/* HERALD TICKER */}
        <div style={{
          gridArea: 'ticker',
          display: 'grid',
          gridTemplateColumns: '220px 1fr',
          alignItems: 'center',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, transparent 0%, rgba(8,7,15,0.75) 100%)',
          borderTop: '1px solid rgba(255,255,255,0.025)',
        }}>
          {/* GOLDFISH label */}
          <div style={{
            paddingLeft: '20px',
            paddingRight: '12px',
            borderRight: '1px solid rgba(255,255,255,0.035)',
            fontFamily: "'Fira Code', monospace",
            fontSize: 'clamp(7px, 0.58vw + 0.2rem, 9px)',
            letterSpacing: '0.18em',
            color: 'rgba(100,70,160,0.55)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            GOLDFISH
          </div>

          {/* Scrolling text */}
          <div style={{
            overflow: 'hidden',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            maskImage: 'linear-gradient(90deg, transparent 0%, black 3%, black 97%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, black 3%, black 97%, transparent 100%)',
          }}>
            <div style={{
              display: 'flex',
              animation: 'ticker-scroll 32s linear infinite',
              whiteSpace: 'nowrap',
              fontFamily: "'Fira Code', monospace",
              fontSize: 'clamp(7px, 0.58vw + 0.2rem, 9px)',
              letterSpacing: '0.12em',
              color: '#504840',
              textTransform: 'uppercase',
            }}>
              {[0, 1].map(i => (
                <span key={i} style={{ paddingRight: '80px' }}>
                  Brandon reviewing new architecture specs&nbsp;·&nbsp;
                  FORGE working on TerritoryNode refactor&nbsp;·&nbsp;
                  CLAUDE writing session active S196&nbsp;·&nbsp;
                  Glitchswarm drones complete — CHROMA GRID TYPE&nbsp;·&nbsp;
                  Kingdom lab sandbox initialized&nbsp;·&nbsp;
                  THE TOWER building&nbsp;·&nbsp;
                  SEARCHING — kingdom-lab route assembly&nbsp;·&nbsp;
                  ⛬ ⚚ ⛬ &nbsp;·&nbsp;
                </span>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
