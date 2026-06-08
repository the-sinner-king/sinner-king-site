/**
 * THE_TOWER — Homepage
 *
 * Serves the Sinner Kingdom landing page (public/index.html via iframe).
 * Previous R3F homepage preserved at /archive/homepage-v1.
 */

export const metadata = {
  title: {
    absolute: 'Sinner Kingdom',
  },
  description: 'A glitch cathedral disguised as a website. The outward face of the Sinner Kingdom — built by Brandon McCormick and Cla⌂de.',
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
        title="Sinner Kingdom"
      />
    </div>
  )
}
