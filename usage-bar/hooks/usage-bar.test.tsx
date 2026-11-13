import { expect, test } from 'claude-code/testing'

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
