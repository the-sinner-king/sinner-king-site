'use client'

/**
 * /glyph — GLYPH Demo Page (client layer)
 *
 * Hosted demo of GLYPH: cyberpunk ASCII template generator.
 * Server-side Gemini key via /api/glyph/generate. 3-turn limit enforced
 * via localStorage. After 3 turns: CTA to the open-source GLYPH repo.
 *
 * NEGATIVE CONTRACT:
 * - NEVER imports from THE_FORGE or any path outside this project
 * - NEVER uses streaming (one-shot fetch only)
 * - NEVER builds non-demo features (history, favorites, settings, share)
 * - NEVER reads localStorage outside useEffect (SSR guard — Next.js App Router)
 * - NEVER shows API key modal (key is server-side)
 */

import { useState, useEffect, useCallback } from 'react'

// =============================================================================
// CONSTANTS
// =============================================================================

const TURNS_KEY = 'glyph-demo-turns'
const MAX_TURNS = 3

const STYLES = ['SOVEREIGN', 'WRAITH', 'RELIC', 'FERAL', 'SIEGE'] as const
type StyleId = typeof STYLES[number]

const SIZES = ['COMPACT', 'STANDARD', 'WIDE', 'BANNER'] as const
type SizeId = typeof SIZES[number]

const BORDERS = ['SINGLE', 'DOUBLE', 'HEAVY', 'ROUNDED'] as const
type BorderId = typeof BORDERS[number]

// =============================================================================
// CTA COMPONENT — shown after 3 turns exhausted
// =============================================================================

function CTABox() {
  return (
    <div
      style={{
        backgroundColor: 'oklch(0.06 0 0)',
        color: 'oklch(0.77 0.19 70)',
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: '14px',
        lineHeight: '1.6',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
      }}
    >
      <pre
        style={{
          color: 'oklch(0.77 0.19 70)',
          backgroundColor: 'transparent',
          border: 'none',
          margin: 0,
          padding: 0,
          whiteSpace: 'pre',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: 'inherit',
        }}
      >
        {`╔══ GENERATION LIMIT REACHED ══════════════════╗
║ You've used your 3 free generations.         ║
║                                              ║
║ Want unlimited?                              ║
║ `}
        <a
          href="https://github.com/the-sinner-king/glyph"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'oklch(0.83 0.19 84)', textDecoration: 'underline' }}
        >
          {`→ github.com/the-sinner-king/glyph`}
        </a>
        {`           ║
║                                              ║
║ Bring your own Gemini API key. Zero backend. ║
║ Free forever. MIT license.                   ║
╚══════════════════════════════════════════════╝`}
      </pre>
    </div>
  )
}

// =============================================================================
// STYLE SELECTOR
// =============================================================================

interface SelectorProps<T extends string> {
  label: string
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  disabled?: boolean
}

function Selector<T extends string>({ label, options, value, onChange, disabled }: SelectorProps<T>) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div
        style={{
          color: 'oklch(0.53 0.02 56)',
          fontSize: '11px',
          letterSpacing: '0.1em',
          marginBottom: '6px',
          fontFamily: '"Courier New", Courier, monospace',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            disabled={disabled}
            style={{
              backgroundColor: value === opt ? 'oklch(0.77 0.19 70)' : 'transparent',
              color: value === opt ? 'oklch(0.06 0 0)' : 'oklch(0.67 0.01 57)',
              border: `1px solid ${value === opt ? 'oklch(0.77 0.19 70)' : 'oklch(0.32 0.01 293)'}`,
              padding: '4px 10px',
              fontFamily: '"Courier New", Courier, monospace',
              fontSize: '12px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              letterSpacing: '0.05em',
              opacity: disabled ? 0.5 : 1,
              transition: 'all 0.1s ease',
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// MAIN CLIENT COMPONENT
// =============================================================================

export function GlyphClient() {
  // --- Turn counter state (SSR-safe localStorage) ---
  // @GHOST_NODE: reason="localStorage SSR guard — reads gated inside useEffect. typeof window !== 'undefined' is not used directly; useEffect runs only client-side in Next.js App Router." severity="deferred" deadline="null"
  const [turnsUsed, setTurnsUsed] = useState(0)
  const [turnsLoaded, setTurnsLoaded] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TURNS_KEY)
      setTurnsUsed(stored ? parseInt(stored, 10) : 0)
    } catch {
      // localStorage unavailable (private mode, SSR, etc.) — default to 0
      setTurnsUsed(0)
    }
    setTurnsLoaded(true)
  }, [])

  // --- Generator state ---
  const [style, setStyle] = useState<StyleId>('SOVEREIGN')
  const [size, setSize] = useState<SizeId>('STANDARD')
  const [border, setBorder] = useState<BorderId>('SINGLE')
  const [prompt, setPrompt] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  // --- Generate handler ---
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError('')
    setOutput('')

    try {
      const res = await fetch('/api/glyph/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          style: style.toLowerCase(),
          size: size.toLowerCase(),
          border: border.toLowerCase(),
        }),
      })

      const data = await res.json() as { content?: string; error?: string }

      if (!res.ok || data.error) {
        setError(data.error ?? 'Generation failed. Try again.')
        return
      }

      if (data.content) {
        setOutput(data.content)
        // Increment turn counter only on success
        const newTurns = turnsUsed + 1
        setTurnsUsed(newTurns)
        try {
          localStorage.setItem(TURNS_KEY, String(newTurns))
        } catch {
          // localStorage write failed — silently continue
        }
      }
    } catch {
      setError('Network error. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [prompt, loading, style, size, border, turnsUsed])

  // --- Copy handler ---
  const handleCopy = useCallback(async () => {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable — silently fail
    }
  }, [output])

  // =============================================================================
  // RENDER
  // =============================================================================

  // Show nothing until localStorage is loaded (avoids SSR mismatch flicker)
  if (!turnsLoaded) {
    return (
      <div
        style={{
          backgroundColor: 'oklch(0.06 0 0)',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'oklch(0.32 0.01 293)',
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: '12px',
        }}
      >
        INITIALIZING...
      </div>
    )
  }

  // Show CTA if limit reached
  if (turnsUsed >= MAX_TURNS) {
    return (
      <div style={{ backgroundColor: 'oklch(0.06 0 0)', minHeight: '100vh' }}>
        <CTABox />
      </div>
    )
  }

  // Show generator
  const isDisabled = loading || !prompt.trim()
  const turnsRemaining = MAX_TURNS - turnsUsed

  return (
    <div
      style={{
        backgroundColor: 'oklch(0.06 0 0)',
        minHeight: '100vh',
        color: 'oklch(0.77 0.19 70)',
        fontFamily: '"Courier New", Courier, monospace',
        padding: '2rem',
        maxWidth: '900px',
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '2rem', borderBottom: '1px solid oklch(0.23 0.01 57)', paddingBottom: '1.5rem' }}>
        <div
          style={{
            fontSize: '22px',
            fontWeight: 'bold',
            letterSpacing: '0.15em',
            color: 'oklch(0.83 0.19 84)',
            marginBottom: '6px',
          }}
        >
          ◈ GLYPH
        </div>
        <div style={{ fontSize: '12px', color: 'oklch(0.53 0.02 56)', letterSpacing: '0.05em' }}>
          ASCII / UNICODE TEMPLATE ARCHITECT — DEMO
        </div>
        {turnsLoaded && (
          <div
            style={{
              marginTop: '8px',
              fontSize: '11px',
              color: turnsRemaining <= 1 ? 'oklch(0.63 0.24 26)' : 'oklch(0.53 0.02 56)',
              letterSpacing: '0.05em',
            }}
          >
            {Array.from({ length: MAX_TURNS }, (_, i) => (
              <span key={i} style={{ marginRight: '4px' }}>
                {i < turnsUsed ? '◆' : '◇'}
              </span>
            ))}
            {turnsUsed}/{MAX_TURNS} generations used
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Selector label="STYLE" options={STYLES} value={style} onChange={setStyle} disabled={loading} />
        <Selector label="SIZE" options={SIZES} value={size} onChange={setSize} disabled={loading} />
        <Selector label="BORDER" options={BORDERS} value={border} onChange={setBorder} disabled={loading} />
      </div>

      {/* Prompt input */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            color: 'oklch(0.53 0.02 56)',
            fontSize: '11px',
            letterSpacing: '0.1em',
            marginBottom: '6px',
          }}
        >
          PROMPT
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your template — e.g. mission control dashboard, hacker terminal, system status panel..."
          disabled={loading}
          rows={3}
          style={{
            width: '100%',
            backgroundColor: 'oklch(0.08 0 0)',
            color: 'oklch(0.91 0.01 57)',
            border: '1px solid oklch(0.32 0.01 293)',
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '13px',
            padding: '10px 12px',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
            opacity: loading ? 0.6 : 1,
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) handleGenerate()
          }}
        />
        <div style={{ fontSize: '10px', color: 'oklch(0.33 0.01 58)', marginTop: '4px' }}>
          Ctrl+Enter to generate
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={isDisabled}
        style={{
          backgroundColor: isDisabled ? 'oklch(0.15 0.01 56)' : 'oklch(0.77 0.19 70)',
          color: isDisabled ? 'oklch(0.33 0.01 58)' : 'oklch(0.06 0 0)',
          border: `1px solid ${isDisabled ? 'oklch(0.23 0.01 57)' : 'oklch(0.77 0.19 70)'}`,
          padding: '10px 24px',
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: '13px',
          fontWeight: 'bold',
          letterSpacing: '0.1em',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.1s ease',
          marginBottom: '2rem',
        }}
      >
        {loading ? '[ GENERATING... ]' : '[ GENERATE ]'}
      </button>

      {/* Error */}
      {error && (
        <div
          style={{
            backgroundColor: 'oklch(0.11 0.04 20)',
            border: '1px solid oklch(0.36 0.13 23)',
            color: 'oklch(0.63 0.24 26)',
            padding: '10px 14px',
            fontSize: '12px',
            fontFamily: '"Courier New", Courier, monospace',
            marginBottom: '1.5rem',
          }}
        >
          ✗ {error}
        </div>
      )}

      {/* Output */}
      {output && (
        <div style={{ marginTop: '1rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <div style={{ fontSize: '11px', color: 'oklch(0.53 0.02 56)', letterSpacing: '0.1em' }}>
              OUTPUT
            </div>
            <button
              onClick={handleCopy}
              style={{
                backgroundColor: copied ? 'oklch(0.36 0.09 157)' : 'transparent',
                color: copied ? 'oklch(0.87 0.15 162)' : 'oklch(0.67 0.01 57)',
                border: `1px solid ${copied ? 'oklch(0.42 0.11 157)' : 'oklch(0.32 0.01 293)'}`,
                padding: '4px 12px',
                fontFamily: '"Courier New", Courier, monospace',
                fontSize: '11px',
                cursor: 'pointer',
                letterSpacing: '0.05em',
                transition: 'all 0.1s ease',
              }}
            >
              {copied ? '[ COPIED ✓ ]' : '[ COPY ]'}
            </button>
          </div>
          <pre
            style={{
              backgroundColor: 'oklch(0.07 0 0)',
              border: '1px solid oklch(0.23 0.01 57)',
              color: 'oklch(0.91 0.01 57)',
              padding: '16px',
              overflowX: 'auto',
              fontFamily: '"Courier New", Courier, monospace',
              fontSize: '13px',
              lineHeight: '1.5',
              margin: 0,
              whiteSpace: 'pre',
            }}
          >
            {output}
          </pre>

          {/* Show CTA hint if this was the last turn */}
          {turnsUsed >= MAX_TURNS && (
            <div
              style={{
                marginTop: '1rem',
                padding: '12px 16px',
                border: '1px solid oklch(0.77 0.19 70)',
                backgroundColor: 'oklch(0.06 0 0)',
                fontSize: '12px',
                color: 'oklch(0.77 0.19 70)',
                fontFamily: '"Courier New", Courier, monospace',
              }}
            >
              ◆ That was your last free generation.{' '}
              <a
                href="https://github.com/the-sinner-king/glyph"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'oklch(0.83 0.19 84)', textDecoration: 'underline' }}
              >
                Get the full version — free, MIT, bring your own key.
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
