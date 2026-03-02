'use client'

/**
 * KingdomErrorBoundary.tsx
 *
 * React error boundary for the KingdomScene3D subtree.
 *
 * Note: WebGL context failure is NOT caught here — that's a useLayoutEffect throw
 * which bypasses React error boundaries. The pre-flight WebGL gate in
 * app/kingdom-map/client.tsx handles that case before Canvas ever mounts.
 *
 * This boundary catches:
 *   - Render-phase exceptions from R3F scene components
 *   - Null dereferences during territory data hydration
 *   - Unexpected Three.js API mismatches
 *
 * Class component required — functional components cannot be error boundaries.
 */

import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export class KingdomErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            width: '100%',
            height: '100vh',
            background: '#0a0a0f',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'monospace',
            gap: 12,
          }}
        >
          <div style={{ color: '#7000ff', fontSize: 13, letterSpacing: '0.15em' }}>
            THE KINGDOM MAP
          </div>
          <div style={{ color: '#ff006e', fontSize: 11, letterSpacing: '0.12em' }}>
            ⬡ scene error
          </div>
          <div
            style={{
              color: '#504840',
              fontSize: 10,
              maxWidth: 360,
              textAlign: 'center',
              lineHeight: 1.7,
            }}
          >
            {this.state.error.message}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
