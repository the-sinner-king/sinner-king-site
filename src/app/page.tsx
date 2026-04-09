/**
 * THE_TOWER — Homepage
 *
 * Serves the Coming Soon landing page.
 * Previous homepage (Terminal Graveyard + HomepageLanding) preserved at /archive/homepage-v1
 */

export const metadata = {
  title: {
    absolute: 'The Sinner Kingdom — Coming Soon',
  },
  description: 'A glitch cathedral disguised as a website. Coming soon.',
}

export default function HomePage() {
  return (
    <div style={{ width: '100%', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', background: 'oklch(0.06 0.02 281)' }}>
      <iframe
        src="/index.html"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
        title="The Sinner Kingdom — Coming Soon"
      />
    </div>
  )
}
