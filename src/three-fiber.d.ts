/**
 * three-fiber.d.ts
 *
 * R3F v8 augments the OLD global JSX namespace.
 * React 19 uses React.JSX.IntrinsicElements (via jsx-runtime).
 * This bridges the gap so Three.js JSX elements type-check correctly.
 */
import { ThreeElements } from '@react-three/fiber'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
