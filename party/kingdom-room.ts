import type * as Party from 'partykit/server'

const PUSH_SECRET = process.env.KINGDOM_PUSH_SECRET

export default class KingdomRoom implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection) {
    // Send last cached state to late-joiners — instant update, no wait for next SCRYER cycle
    const stored = await this.room.storage.get<string>('lastPayload')
    if (stored) conn.send(stored)
  }

  async onRequest(req: Party.Request): Promise<Response> {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const secret = req.headers.get('x-kingdom-secret')
    if (PUSH_SECRET && secret !== PUSH_SECRET) {
      return new Response('Unauthorized', { status: 401 })
    }

    const payload = await req.text()
    try {
      JSON.parse(payload)
    } catch {
      return new Response('Invalid JSON', { status: 400 })
    }

    await this.room.storage.put('lastPayload', payload)
    this.room.broadcast(payload)

    return new Response('OK', { status: 200 })
  }

  async onMessage(message: string, sender: Party.Connection) {
    if (message === 'ping') {
      // Client requesting state refresh — send cached payload
      const stored = await this.room.storage.get<string>('lastPayload')
      if (stored) sender.send(stored)
    }
  }
}

KingdomRoom satisfies Party.Worker
