import { atom, read, update } from 'claude-code'
import type { Register, RenderChildren, SessionContextUsage, SessionRateLimit, SessionCost } from 'claude-code'

import type { Limit, Snapshot } from '../types'

const snapshot = atom({ plugin: 'usage-bar', key: 'snapshot' } as const, null)

const LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'week', spend_limit: 'spend' }
const BAR_CELLS = 8

const toSnapshot = (u: { context: SessionContextUsage; rateLimits: SessionRateLimit[]; cost?: SessionCost }): Snapshot => ({
  contextPercent: u.context.percent,
  contextTokens: u.context.tokens,
  contextWindow: u.context.window,
  limits: u.rateLimits.map((r): Limit => ({ kind: r.kind, percent: r.percentUsed, resetsAt: r.resetsAt })),
  costUsd: u.cost?.usd,
})

// Blue & white palette: the bar brightens from deep blue toward ice blue as it fills.
const PALETTE = {
  barLow: '#2563EB', // royal blue, under 60%
  barMid: '#3B82F6', // brighter blue, 60–85%
  barHigh: '#BFDBFE', // ice blue, 85%+ (stands out as "nearly full")
  track: '#1E2A4A', // dark navy, the unfilled part
  label: '#7DA2D6', // soft steel blue for labels
  value: '#F8FAFC', // white for the numbers
  dim: '#4A6A9A', // muted blue for token counts and resets
  sep: '#1E3A8A', // dark blue separators
} as const

const tone = (p: number) => (p >= 85 ? PALETTE.barHigh : p >= 60 ? PALETTE.barMid : PALETTE.barLow)

const kTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`)

const untilReset = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000))
  if (mins >= 60 * 24) return `${Math.floor(mins / 1440)}d`
  if (mins >= 60) return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`
  return `${mins}m`
}

// Builds the usage readout (context bar plus one bar per rate limit).
async function usageParts($: any, e: any): Promise<RenderChildren[]> {
  // Read the stored snapshot (so new measurements redraw the line), and fall
  // back to asking the engine directly when nothing has been stored yet.
  const snap: Snapshot = (await read($, snapshot)) ?? toSnapshot(await $.session.usage())
  const { Box, Text } = $.ui.resolve(e)
  const now = await $.clock.now()

  const bar = (p: number) => {
    const filled = Math.max(0, Math.min(BAR_CELLS, Math.round((p / 100) * BAR_CELLS)))
    return [
      <Text key="on" color={tone(p)}>{'━'.repeat(filled)}</Text>,
      <Text key="off" color={PALETTE.track}>{'━'.repeat(BAR_CELLS - filled)}</Text>,
    ]
  }

  const sep = (key: string) => <Text key={key} color={PALETTE.sep}>{'  │  '}</Text>

  const parts: RenderChildren[] = []

  const ctx = snap.contextPercent ?? 0
  parts.push(
    <Box key="ctx" flexDirection="row">
      <Text color={PALETTE.label}>{'context '}</Text>
      {bar(ctx)}
      <Text color={PALETTE.value} bold>{` ${ctx}%`}</Text>
      {snap.contextTokens ? (
        <Text color={PALETTE.dim}>{` ${kTokens(snap.contextTokens)}/${kTokens(snap.contextWindow)}`}</Text>
      ) : null}
    </Box>,
  )

  for (const l of snap.limits) {
    const label = LABELS[l.kind] ?? l.kind
    const reset = untilReset(l.resetsAt, now)
    const pct = Math.round(l.percent)
    parts.push(sep(`s-${l.kind}`))
    parts.push(
      <Box key={l.kind} flexDirection="row">
        <Text color={PALETTE.label}>{`${label} `}</Text>
        {bar(pct)}
        <Text color={PALETTE.value} bold>{` ${pct}%`}</Text>
        {reset ? <Text color={PALETTE.dim}>{` ↻ ${reset}`}</Text> : null}
      </Box>,
    )
  }

  return parts
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-bar',
      description: 'Show what the usage-bar mod currently reads',
    })
    const result = await next(e)
    const u = await $.session.usage()
    await update($, snapshot, () => toSnapshot(u))
    return result
  })

  on('command.run', { command: 'usage-bar' }, async $ => {
    const u = await $.session.usage()
    await update($, snapshot, () => toSnapshot(u))
    const limits = u.rateLimits.map(r => `${LABELS[r.kind] ?? r.kind} ${r.percentUsed}%`).join(', ') || 'none reported yet'
    return {
      text: `usage-bar is loaded. Context ${u.context.percent ?? 0}% of ${u.context.window} tokens; limits: ${limits}.`,
    }
  })

  on('session.measure', async ($, e, next) => {
    await update($, snapshot, () => toSnapshot(e))
    return next(e)
  })

  // Terminal: the readout sits at the right of the hint line under the prompt.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)

    const { Box } = $.ui.resolve(e)
    const engineLine = await next(e)
    const parts = await usageParts($, e)

    return (
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexShrink={1} flexGrow={1}>
          {engineLine}
        </Box>
        <Box flexDirection="row" flexShrink={0}>
          {parts}
        </Box>
      </Box>
    )
  })

  // Desktop and other surfaces have no hint line, so the readout goes in the
  // band directly above the prompt (yielding to surveys).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface === 'terminal' || e.props.hasSurvey) return next(e)

    const { Box } = $.ui.resolve(e)
    const parts = await usageParts($, e)

    return (
      <Box flexDirection="row" flexWrap="wrap" justifyContent="center" width="100%">
        {parts}
      </Box>
    )
  })
}
