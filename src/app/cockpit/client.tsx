'use client'

/**
 * Kingdom Command — Admin Panel Client
 *
 * Live visitor feed via PartyKit visitor-room.
 * Kingdom state from PartyKit snapshot (existing pipeline).
 * Content queue from /api/cockpit/content.
 *
 * No auth — obscure URL only. Internal tool.
 */

import { useEffect, useReducer, useRef, useState } from 'react'
import PartySocket from 'partysocket'

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || '127.0.0.1:1999'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VisitorEntry {
  id: string
  page: string
  country: string
  city: string
  since: number
}

interface VisitorPayload {
  type: 'visitors'
  count: number
  visitors: VisitorEntry[]
  pages: Record<string, number>
}

interface ContentPost {
  id: string
  title: string
  slug: string
  status: 'published' | 'queued' | 'draft'
  publishAt?: string
  source: 'manual' | 'autoblog'
  excerpt?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

const FLAG: Record<string, string> = {
  US: '🇺🇸', GB: '🇬🇧', CA: '🇨🇦', AU: '🇦🇺', DE: '🇩🇪',
  FR: '🇫🇷', JP: '🇯🇵', BR: '🇧🇷', MX: '🇲🇽', NL: '🇳🇱',
  SE: '🇸🇪', NO: '🇳🇴', KR: '🇰🇷', IN: '🇮🇳', SG: '🇸🇬',
}
function flag(code: string) { return FLAG[code] ?? '🌐' }

// ---------------------------------------------------------------------------
// Panel components
// ---------------------------------------------------------------------------

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily:    'var(--font-mono, monospace)',
      fontSize:      10,
      letterSpacing: '0.15em',
      color:         'var(--bone-ghost, #504840)',
      textTransform: 'uppercase',
      marginBottom:  12,
    }}>
      {children}
    </div>
  )
}

function Dot({ color }: { color: string }) {
  return (
    <span style={{
      display:      'inline-block',
      width:        6,
      height:       6,
      borderRadius: '50%',
      background:   color,
      marginRight:  6,
      flexShrink:   0,
    }} />
  )
}

// ---------------------------------------------------------------------------
// Live Visitors Panel
// ---------------------------------------------------------------------------

function VisitorsPanel() {
  const [data, setData]       = useState<VisitorPayload | null>(null)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<PartySocket | null>(null)

  useEffect(() => {
    const socket = new PartySocket({
      host:  PARTYKIT_HOST,
      room:  'kingdom-visitors',
      party: 'visitors',
    })

    socket.addEventListener('open', () => {
      setConnected(true)
      // Identify as admin so we're excluded from visitor count
      socket.send(JSON.stringify({ type: 'join', isAdmin: true, page: '/admin' }))
      socket.send(JSON.stringify({ type: 'admin' }))
    })

    socket.addEventListener('message', (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as VisitorPayload
        if (msg.type === 'visitors') setData(msg)
      } catch { /* ignore */ }
    })

    socket.addEventListener('close', () => setConnected(false))

    socketRef.current = socket
    return () => { socket.close(); socketRef.current = null }
  }, [])

  const visitors = data?.visitors ?? []
  const pages    = data?.pages ?? {}
  const count    = data?.count ?? 0

  return (
    <div style={{
      background:  'var(--void-mid, #12121a)',
      border:      '1px solid oklch(0.87 0.21 192 / 0.20)',
      padding:     20,
      flex:        1,
      minWidth:    280,
    }}>
      <PanelLabel>
        <Dot color={connected ? 'var(--cyan, #00f3ff)' : 'oklch(0.37 0.02 45)'} />
        Live Visitors
      </PanelLabel>

      {/* Big count */}
      <div style={{
        fontFamily:  'var(--font-mono, monospace)',
        fontSize:    52,
        fontWeight:  700,
        color:       count > 0 ? 'var(--cyan, #00f3ff)' : 'var(--bone-ghost, #504840)',
        lineHeight:  1,
        marginBottom: 4,
      }}>
        {count.toString().padStart(2, '0')}
      </div>
      <div style={{
        fontFamily:  'var(--font-mono, monospace)',
        fontSize:    11,
        color:       'var(--bone-dim, #a09888)',
        marginBottom: 20,
      }}>
        {count === 1 ? 'person on site' : 'people on site'}
      </div>

      {/* Page breakdown */}
      {Object.keys(pages).length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {Object.entries(pages)
            .sort(([, a], [, b]) => b - a)
            .map(([page, n]) => (
              <div key={page} style={{
                display:       'flex',
                justifyContent: 'space-between',
                alignItems:    'center',
                fontFamily:    'var(--font-mono, monospace)',
                fontSize:      11,
                color:         'var(--bone-dim, #a09888)',
                paddingBottom: 4,
                marginBottom:  4,
                borderBottom:  '1px solid oklch(1 0 0 / 0.04)',
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                  {page}
                </span>
                <span style={{ color: 'var(--cyan, #00f3ff)', marginLeft: 8 }}>{n}</span>
              </div>
            ))}
        </div>
      )}

      {/* Visitor list */}
      {visitors.length > 0 && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'oklch(0.37 0.02 45)', letterSpacing: '0.1em', marginBottom: 8 }}>
            ACTIVE
          </div>
          {visitors.map(v => (
            <div key={v.id} style={{
              display:      'flex',
              alignItems:   'center',
              gap:          8,
              fontSize:     11,
              fontFamily:   'var(--font-mono, monospace)',
              color:        'var(--bone-dim, #a09888)',
              marginBottom: 6,
            }}>
              <span style={{ fontSize: 14 }}>{flag(v.country)}</span>
              <span style={{ color: 'var(--bone, #e8e0d0)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.city !== 'Unknown' ? v.city : v.country}
              </span>
              <span style={{ color: 'oklch(0.37 0.02 45)', fontSize: 10 }}>{v.page}</span>
              <span style={{ color: 'oklch(0.37 0.02 45)', fontSize: 9, whiteSpace: 'nowrap' }}>{timeAgo(v.since)}</span>
            </div>
          ))}
        </div>
      )}

      {visitors.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'oklch(0.37 0.02 45)' }}>
          — no visitors —
        </div>
      )}

      {/* Connection status */}
      <div style={{
        marginTop:  20,
        fontFamily: 'var(--font-mono, monospace)',
        fontSize:   9,
        color:      connected ? 'oklch(0.87 0.21 192 / 0.40)' : 'oklch(0.37 0.02 45)',
        letterSpacing: '0.1em',
      }}>
        {connected ? '◉ LIVE' : '○ CONNECTING...'}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kingdom State Panel
// ---------------------------------------------------------------------------

function KingdomStatePanel() {
  const [snap, setSnap] = useState<Record<string, unknown> | null>(null)
  const [age, setAge]   = useState<number | null>(null)

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch('/api/partykit-snapshot', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as { ok: boolean; liveData?: Record<string, unknown>; cached_at?: number }
        if (data.ok && data.liveData) {
          setSnap(data.liveData)
          if (data.cached_at) setAge(Date.now() - data.cached_at)
        }
      } catch { /* ignore */ }
    }
    void poll()
    const id = setInterval(() => void poll(), 20_000)
    return () => clearInterval(id)
  }, [])

  const live = (snap?.kingdom_live ?? {}) as Record<string, unknown>
  const mood = (live?.mood ?? {}) as Record<string, unknown>
  const agents = (snap?.agents_status as { agents?: Record<string, unknown> })?.agents ?? {}

  const moodColor = (mood?.synesthesia_hex as string) || 'var(--violet)'
  const voltage   = mood?.voltage as number | null

  return (
    <div style={{
      background: 'var(--void-mid, #12121a)',
      border:     '1px solid oklch(0.37 0.31 283 / 0.25)',
      padding:    20,
      flex:       1,
      minWidth:   240,
    }}>
      <PanelLabel>
        <Dot color="var(--violet, #7000ff)" />
        Kingdom State
      </PanelLabel>

      {snap ? (
        <>
          {/* Mood */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'oklch(0.37 0.02 45)', letterSpacing: '0.1em', marginBottom: 6 }}>MOOD</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: moodColor, boxShadow: `0 0 6px ${moodColor}` }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--bone)' }}>
                {(mood?.state as string) || 'unknown'}
              </span>
            </div>
            {voltage != null && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--bone-dim)', marginTop: 4 }}>
                voltage {voltage.toFixed(2)}
              </div>
            )}
            {typeof mood?.texture === 'string' && mood.texture && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'oklch(0.37 0.02 45)', marginTop: 2 }}>
                {mood.texture}
              </div>
            )}
          </div>

          {/* Health */}
          {live?.health && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'oklch(0.37 0.02 45)', letterSpacing: '0.1em', marginBottom: 4 }}>HEALTH</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--bone-dim)' }}>{live.health as string}</div>
            </div>
          )}

          {/* Activity */}
          {live?.current_activity && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'oklch(0.37 0.02 45)', letterSpacing: '0.1em', marginBottom: 4 }}>ACTIVITY</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--amber)', lineHeight: 1.4 }}>
                {live.current_activity as string}
              </div>
            </div>
          )}

          {/* Agents */}
          {Object.keys(agents).length > 0 && (
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'oklch(0.37 0.02 45)', letterSpacing: '0.1em', marginBottom: 6 }}>AGENTS</div>
              {Object.entries(agents).slice(0, 6).map(([name, agent]) => {
                const a = agent as Record<string, unknown>
                const online = a.status === 'online' || a.status === 'active'
                return (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--bone-dim)', marginBottom: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Dot color={online ? 'var(--cyan)' : 'oklch(0.37 0.02 45)'} />
                      {name}
                    </span>
                    <span style={{ color: 'oklch(0.37 0.02 45)' }}>{a.status as string}</span>
                  </div>
                )
              })}
            </div>
          )}

          {age != null && (
            <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'oklch(0.37 0.02 45)' }}>
              snapshot {Math.round(age / 1000)}s old
            </div>
          )}
        </>
      ) : (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'oklch(0.37 0.02 45)' }}>loading...</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Content Queue Panel
// ---------------------------------------------------------------------------

function ContentPanel() {
  const [posts, setPosts] = useState<ContentPost[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/cockpit/content', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json() as { posts: ContentPost[] }
          setPosts(data.posts)
        }
      } catch { /* ignore */ }
      setLoaded(true)
    }
    void load()
  }, [])

  const published = posts.filter(p => p.status === 'published')
  const queued    = posts.filter(p => p.status === 'queued')
  const drafts    = posts.filter(p => p.status === 'draft')

  return (
    <div style={{
      background: 'var(--void-mid, #12121a)',
      border:     '1px solid oklch(0.75 0.20 65 / 0.20)',
      padding:    20,
      flex:       1,
      minWidth:   260,
    }}>
      <PanelLabel>
        <Dot color="var(--amber, #f0a500)" />
        Content Queue
      </PanelLabel>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
        {[
          { label: 'LIVE',   count: published.length, color: 'var(--cyan)' },
          { label: 'QUEUED', count: queued.length,    color: 'var(--amber)' },
          { label: 'DRAFT',  count: drafts.length,    color: 'oklch(0.37 0.02 45)' },
        ].map(({ label, count, color }) => (
          <div key={label}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{count}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'oklch(0.37 0.02 45)', letterSpacing: '0.1em' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Queued posts */}
      {queued.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'oklch(0.37 0.02 45)', letterSpacing: '0.1em', marginBottom: 8 }}>QUEUED</div>
          {queued.map(p => (
            <div key={p.id} style={{
              borderLeft:    '2px solid var(--amber)',
              paddingLeft:   10,
              marginBottom:  10,
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--bone)' }}>{p.title}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'oklch(0.37 0.02 45)', marginTop: 2 }}>
                {p.source === 'autoblog' ? '⟐ autoblog' : '✎ manual'}
                {p.publishAt && ` · ${new Date(p.publishAt).toLocaleDateString()}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent published */}
      {published.length > 0 && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'oklch(0.37 0.02 45)', letterSpacing: '0.1em', marginBottom: 8 }}>RECENT</div>
          {published.slice(0, 5).map(p => (
            <div key={p.id} style={{
              fontFamily:    'var(--font-mono)',
              fontSize:      11,
              color:         'var(--bone-dim)',
              marginBottom:  6,
              display:       'flex',
              justifyContent: 'space-between',
              alignItems:    'center',
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.title}</span>
              <span style={{ color: 'oklch(0.37 0.02 45)', fontSize: 9, marginLeft: 8, whiteSpace: 'nowrap' }}>
                {p.source === 'autoblog' ? '⟐' : '✎'}
              </span>
            </div>
          ))}
        </div>
      )}

      {loaded && posts.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'oklch(0.37 0.02 45)' }}>— no posts yet —</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SCOUT.MINUTE Panel
// ---------------------------------------------------------------------------

interface ScoutData {
  ok:            boolean
  timestamp?:    string
  spark?:        string
  chronicle?:    string
  model?:        string
  context_chars?: number
  error?:        string
}

function ScoutMinutePanel() {
  const [data, setData] = useState<ScoutData | null>(null)
  const [age, setAge]   = useState<number | null>(null)

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch('/api/cockpit/scout', { cache: 'no-store' })
        const json = await res.json() as ScoutData
        setData(json)
        if (json.timestamp) {
          setAge(Date.now() - new Date(json.timestamp).getTime())
        }
      } catch { /* ignore */ }
    }
    void poll()
    const id = setInterval(() => void poll(), 30_000)
    return () => clearInterval(id)
  }, [])

  const spark     = data?.spark ?? ''
  const chronicle = data?.chronicle ?? ''
  const stale     = age != null && age > 10 * 60 * 1000  // >10 min = stale

  return (
    <div style={{
      background:  'var(--void-mid, #12121a)',
      border:      `1px solid oklch(0.87 0.21 192 / ${stale ? '0.10' : '0.25'})`,
      padding:     20,
      width:       '100%',
    }}>
      <PanelLabel>
        <Dot color={stale ? 'oklch(0.37 0.02 45)' : 'var(--cyan, #00f3ff)'} />
        SCOUT.MINUTE
        {age != null && (
          <span style={{ marginLeft: 10, color: stale ? 'var(--amber)' : 'oklch(0.87 0.21 192 / 0.40)' }}>
            {Math.round(age / 60000)}m ago
          </span>
        )}
      </PanelLabel>

      {data?.ok ? (
        <>
          {/* THE SPARK */}
          {spark && (
            <div style={{
              fontFamily:   'var(--font-mono, monospace)',
              fontSize:     15,
              fontWeight:   600,
              color:        'var(--bone, #e8e0d0)',
              lineHeight:   1.4,
              marginBottom: 12,
              borderLeft:   '2px solid var(--cyan, #00f3ff)',
              paddingLeft:  12,
            }}>
              {spark}
            </div>
          )}

          {/* THE CHRONICLE */}
          {chronicle && (
            <div style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize:   11,
              color:      'var(--bone-dim, #a09888)',
              lineHeight: 1.6,
            }}>
              {chronicle}
            </div>
          )}

          {/* Meta */}
          <div style={{
            marginTop:    10,
            fontFamily:   'var(--font-mono, monospace)',
            fontSize:      9,
            color:        'oklch(0.37 0.02 45)',
            letterSpacing: '0.1em',
            display:      'flex',
            gap:          16,
          }}>
            <span>{data.model}</span>
            <span>{data.context_chars?.toLocaleString()} ctx chars</span>
            {data.timestamp && (
              <span>{new Date(data.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </div>
        </>
      ) : (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'oklch(0.37 0.02 45)' }}>
          {data ? 'SCOUT.MINUTE offline' : 'loading...'}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root — Admin Shell
// ---------------------------------------------------------------------------

export function AdminClient() {
  // Tick for relative times — fires every 10s so child timeAgo() calls stay fresh.
  const [, tickTimeRefresh] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const id = setInterval(tickTimeRefresh, 10_000)
    return () => clearInterval(id)
  }, [])

  return (
    <main style={{
      minHeight:      '100vh',
      background:     'var(--void, #0a0a0f)',
      color:          'var(--bone, #e8e0d0)',
      fontFamily:     'var(--font-mono, monospace)',
      padding:        '32px 24px',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.2em', color: 'oklch(0.37 0.02 45)', marginBottom: 6 }}>
          ⛬ SINNER KINGDOM
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--bone)', margin: 0, letterSpacing: '0.05em' }}>
          KINGDOM COMMAND
        </h1>
        <div style={{ fontSize: 10, color: 'oklch(0.37 0.02 45)', marginTop: 4, letterSpacing: '0.1em' }}>
          {new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).toUpperCase()}
        </div>
      </div>

      {/* Panels */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ScoutMinutePanel />
        <div style={{
          display:    'flex',
          gap:        16,
          flexWrap:   'wrap',
          alignItems: 'flex-start',
        }}>
          <VisitorsPanel />
          <KingdomStatePanel />
          <ContentPanel />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop:     40,
        paddingTop:    20,
        borderTop:     '1px solid oklch(1 0 0 / 0.04)',
        fontSize:      9,
        color:         'oklch(0.37 0.02 45)',
        letterSpacing: '0.1em',
      }}>
        ⛬⚚⛬ INTERNAL · THE SINNER KINGDOM · THE LAW STANDS
      </div>
    </main>
  )
}
