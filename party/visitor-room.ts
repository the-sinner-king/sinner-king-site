/**
 * visitor-room.ts — Live visitor presence tracking
 *
 * Visitors connect when a page loads, disconnect when they leave.
 * Admin panel subscribes and sees live count + per-page breakdown.
 *
 * Message protocol (client → room):
 *   { type: "join", page: "/blog/foo", country: "US", city: "Austin" }
 *   { type: "navigate", page: "/glyph" }    ← SPA nav update
 *   { type: "admin" }                        ← marks this conn as admin (hidden from count)
 *
 * Message protocol (room → client):
 *   { type: "visitors", count: 7, visitors: [...], pages: {...} }
 */

import type * as Party from 'partykit/server'

interface VisitorRecord {
  id: string
  page: string
  country: string
  city: string
  joinedAt: number
  isAdmin: boolean
}

export default class VisitorRoom implements Party.Server {
  // In-memory visitor map — lost on room hibernation, which is fine for presence
  private visitors: Map<string, VisitorRecord> = new Map()

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // Send current state immediately so admin sees data without waiting for a join message
    this.sendSnapshot(conn)
  }

  onMessage(message: string, sender: Party.Connection) {
    try {
      const data = JSON.parse(message) as Record<string, unknown>

      if (data.type === 'join') {
        this.visitors.set(sender.id, {
          id: sender.id,
          page:      typeof data.page    === 'string' ? data.page    : '/',
          country:   typeof data.country === 'string' ? data.country : '??',
          city:      typeof data.city    === 'string' ? data.city    : 'Unknown',
          joinedAt:  Date.now(),
          isAdmin:   data.isAdmin === true,
        })
        this.broadcast()
        return
      }

      if (data.type === 'navigate') {
        const existing = this.visitors.get(sender.id)
        if (existing && typeof data.page === 'string') {
          existing.page = data.page
          this.broadcast()
        }
        return
      }

      if (data.type === 'admin') {
        const existing = this.visitors.get(sender.id)
        if (existing) {
          existing.isAdmin = true
          this.broadcast()
        }
        return
      }

      if (data.type === 'ping') {
        this.sendSnapshot(sender)
        return
      }
    } catch {
      // Ignore malformed messages
    }
  }

  onClose(conn: Party.Connection) {
    this.visitors.delete(conn.id)
    this.broadcast()
  }

  onError(conn: Party.Connection) {
    this.visitors.delete(conn.id)
    this.broadcast()
  }

  // Build payload visible to all — admin connections excluded from count/list
  private buildPayload() {
    const active = Array.from(this.visitors.values()).filter(v => !v.isAdmin)

    // Page breakdown: { "/blog/foo": 3, "/glyph": 2 }
    const pages: Record<string, number> = {}
    for (const v of active) {
      pages[v.page] = (pages[v.page] ?? 0) + 1
    }

    return {
      type:     'visitors',
      count:    active.length,
      visitors: active.map(v => ({
        id:       v.id.slice(0, 8),  // truncated for display
        page:     v.page,
        country:  v.country,
        city:     v.city,
        since:    v.joinedAt,
      })),
      pages,
    }
  }

  private broadcast() {
    const msg = JSON.stringify(this.buildPayload())
    this.room.broadcast(msg)
  }

  private sendSnapshot(conn: Party.Connection) {
    conn.send(JSON.stringify(this.buildPayload()))
  }
}

VisitorRoom satisfies Party.Worker
