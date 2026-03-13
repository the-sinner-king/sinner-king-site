/**
 * Kingdom Wiki — sinner-k.ing/kingdom-wiki
 * Serves the CORE LORE wiki (WIKI.html) at this route.
 */

export const metadata = {
  title: 'Kingdom Wiki — The Sinner Kingdom',
  description: 'The CORE LORE of the Sinner Kingdom. Laws, systems, entities, and protocols.',
}

export default function KingdomWikiPage() {
  return (
    <div style={{ width: '100%', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', background: '#0a0a0f' }}>
      <iframe
        src="/kingdom-wiki.html"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
        title="The Sinner Kingdom — CORE LORE Wiki"
      />
    </div>
  )
}
