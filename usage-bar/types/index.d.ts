export type Limit = { kind: string; percent: number; resetsAt?: string }
export type Snapshot = {
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  limits: Limit[]
  costUsd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-bar': { snapshot: Snapshot | null }
  }
}
