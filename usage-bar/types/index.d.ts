export type Limit = { kind: string; percent: number; resetsAt?: string }
export type Snapshot = {
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  limits: Limit[]
  costUsd?: number
  limitsAt?: number // when the limits were read (ms), to pick the newest
  minute?: number // last minute redrawn, keeps the reset countdown moving
}

declare module 'claude-code' {
  interface PluginState {
    'usage-bar': { snapshot: Snapshot | null }
  }
}
