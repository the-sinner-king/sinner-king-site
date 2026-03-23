'use client'

/**
 * VisitorBeacon — passive presence tracker
 *
 * Mounts on every page. Fetches geo via /api/visitor-geo, then connects
 * to the visitor-room PartyKit party. Sends a join message. Disconnects
 * on unmount (page leave). Zero visible UI.
 *
 * SPA navigation: listens to pathname changes via usePathname and sends
 * a "navigate" update so the room always knows the current page.
 */

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import PartySocket from 'partysocket'

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || '127.0.0.1:1999'
const VISITOR_ROOM  = 'kingdom-visitors'

// Stable session ID — persists for the browser tab's lifetime
function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  const key = 'sk_visitor_sid'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionStorage.setItem(key, id)
  }
  return id
}

export function VisitorBeacon() {
  const pathname = usePathname()
  const socketRef = useRef<PartySocket | null>(null)
  const geoRef    = useRef<{ country: string; city: string } | null>(null)
  const readyRef  = useRef(false)

  // Connect once on mount, fetch geo, send join
  useEffect(() => {
    let cancelled = false

    async function connect() {
      // Fetch geo first
      try {
        const res = await fetch('/api/visitor-geo', { cache: 'no-store' })
        if (!cancelled && res.ok) {
          geoRef.current = await res.json() as { country: string; city: string }
        }
      } catch { /* non-fatal */ }

      if (cancelled) return

      const socket = new PartySocket({
        host:  PARTYKIT_HOST,
        room:  VISITOR_ROOM,
        party: 'visitors',
        id:    getSessionId(),
      })

      socket.addEventListener('open', () => {
        readyRef.current = true
        socket.send(JSON.stringify({
          type:    'join',
          page:    window.location.pathname,
          country: geoRef.current?.country ?? '??',
          city:    geoRef.current?.city    ?? 'Unknown',
        }))
      })

      // We don't consume messages — admin handles those
      socketRef.current = socket
    }

    void connect()

    return () => {
      cancelled = true
      socketRef.current?.close()
      socketRef.current = null
      readyRef.current  = false
    }
  }, [])

  // SPA navigation: send navigate update when pathname changes
  useEffect(() => {
    if (!readyRef.current || !socketRef.current) return
    socketRef.current.send(JSON.stringify({ type: 'navigate', page: pathname }))
  }, [pathname])

  return null
}
