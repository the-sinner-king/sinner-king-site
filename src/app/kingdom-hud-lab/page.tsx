import type { Metadata } from 'next'
import { KingdomHUDLab } from './client'

export const metadata: Metadata = {
  title: 'Kingdom HUD Lab — Sulphur Kawaii Staging',
  description: 'HUD redesign staging: new StatusBar, AgentPanel with faceplates, Radio, TokenHUD.',
}

export default function KingdomHUDLabPage() {
  return <KingdomHUDLab />
}
