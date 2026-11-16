import { expect, mock, test } from 'claude-code/testing'

const HINT = {
  plugin: 'usage-bar',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const

const BAND = {
  plugin: 'usage-bar',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
} as const

test('the usage line draws context, limits and cost beside the hint', async ($, on) => {
  on('clock.now', () => ({ value: 0 }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>? for shortcuts</Text>
  })
  on('state.get', () => ({
    value: {
      value: {
        contextPercent: 42, contextTokens: 84_000, contextWindow: 200_000,
        limits: [{ kind: 'five_hour', percent: 23 }, { kind: 'seven_day', percent: 91 }],
        costUsd: 1.234,
      },
      version: 1,
    },
  }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(surface === 'terminal' ? { ...HINT, surface } : { ...BAND, surface } as any)
    if (surface === 'terminal') expect((await ui.find({ type: 'Text', text: /shortcuts/ }))?.text).toBe('? for shortcuts')
    expect((await ui.find({ type: 'Text', text: /42%/ }))?.text).toBe(' 42%')
    expect((await ui.find({ type: 'Text', text: /84k/ }))?.text).toBe(' 84k/200k')
    expect((await ui.find({ type: 'Text', text: /91%/ }))?.text).toBe(' 91%')
    expect(await ui.find({ type: 'Text', text: /\$/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('before any stored reading, it asks the engine directly', async ($, on) => {
  on('clock.now', () => ({ value: 0 }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, percent: 7, tokens: 14_000 }, rateLimits: [], cost: { usd: 0.05 } } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  expect((await ui.find({ type: 'Text', text: /7%/ }))?.text).toBe(' 7%')
  await ui.unmount()
})

test('on desktop the hint line is left alone and the band yields to a survey', async ($, on) => {
  on('clock.now', () => ({ value: 0 }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, percent: 7, tokens: 14_000 }, rateLimits: [] } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const hint = await $.ui.mount({ ...HINT, surface: 'desktop' })
  expect(await hint.find({ type: 'Text', text: /7%/ })).toBeUndefined()
  await hint.unmount()
  const band = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'desktop' } as any)
  expect(await band.find({ type: 'Text', text: /7%/ })).toBeUndefined()
  await band.unmount()
})

// An in-memory home folder for the shared limits file.
const fakeFiles = (on: any, clock: { now: () => number }) => {
  const files = new Map<string, { text: string; mtimeMs: number }>()
  on('fs.write', (_: any, e: any) => { files.set(e.path, { text: e.text, mtimeMs: clock.now() + 1 }); return { value: undefined } })
  on('fs.read', (_: any, e: any) => {
    const f = files.get(e.path)
    if (!f) throw new Error('ENOENT')
    return { value: f.text }
  })
  on('fs.stat', (_: any, e: any) => {
    const f = files.get(e.path)
    if (!f) throw new Error('ENOENT')
    return { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } }
  })
  return files
}

const SHARED = '/home/me/.claude/usage-bar/limits.json'
const CTX = { window: 200_000, percent: 7, tokens: 14_000 }

test('a reading is shared with other terminals through the limits file', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  mock.env(on, { HOME: '/home/me' })
  const files = fakeFiles(on, clock)
  on('session.usage', () => ({ value: { startedAt: 0, context: CTX, rateLimits: [] } }))
  on('session.measure', (_: any, e: any) => e)
  await $.session.measure({ context: CTX, rateLimits: [{ kind: 'five_hour', percentUsed: 40 }], changed: ['rateLimits'] })
  const saved = JSON.parse(files.get(SHARED)!.text)
  expect(saved.limits).toEqual([{ kind: 'five_hour', percent: 40 }])
})

test('an idle terminal picks up newer limits from the file within seconds', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  mock.env(on, { HOME: '/home/me' })
  const files = fakeFiles(on, clock)
  on('session.usage', () => ({ value: { startedAt: 0, context: CTX, rateLimits: [{ kind: 'five_hour', percentUsed: 10 }] } }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', (_: any, e: any) => e)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: / 10%/ })).toBeDefined()

  // another terminal writes a newer reading
  files.set(SHARED, { text: JSON.stringify({ updatedAt: Date.now() + 60_000, limits: [{ kind: 'five_hour', percent: 55 }] }), mtimeMs: 5_000 })
  await clock.advance(2_100)
  expect(await ui.find({ type: 'Text', text: / 55%/ })).toBeDefined()
  await ui.unmount()
})

test('a window past its reset time shows 0%', async ($, on) => {
  on('clock.now', () => ({ value: Date.parse('2026-01-01T12:00:00Z') }))
  on('state.get', () => ({
    value: { value: { contextPercent: 1, contextWindow: 200_000, limits: [{ kind: 'five_hour', percent: 80, resetsAt: '2026-01-01T11:00:00Z' }] }, version: 1 },
  }))
  on('ui.render', ($, e) => { const { Text } = $.ui.resolve(e); return <Text>x</Text> })
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: / 0%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: / 80%/ })).toBeUndefined()
  await ui.unmount()
})
