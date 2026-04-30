/**
 * WorldDebugStore — module-level singleton for live debug state.
 *
 * Lives outside the React + R3F lifecycle so WorldDebugHUD (outside Canvas)
 * can read what DebugWriter (inside Canvas, in useFrame) writes every tick.
 */

export const WorldDebugStore = {
  pos:        { x: 0, z: 0 },
  zoom:       0.5,
  rotX:       -Math.PI / 2,
  frameCount: 0,
  fps:        0,
  tick:       0,
  errors:     [] as string[],

  addError(msg: string) {
    this.errors.push(`${new Date().toISOString().slice(11, 23)} ${msg}`)
    if (this.errors.length > 20) this.errors.shift()
  },
}
