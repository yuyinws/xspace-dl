import { describe, expect, it } from 'vitest'

import { ok } from '@shared/result'

import { invokeIpc } from './invoke-ipc'

describe('invokeIpc', () => {
  it('passes through successful handlers', async () => {
    const result = await invokeIpc(async () => ok({ done: true }))

    expect(result).toEqual({
      ok: true,
      data: { done: true }
    })
  })

  it('converts thrown errors into structured failures', async () => {
    const result = await invokeIpc(async () => {
      throw new Error('boom')
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'Error',
        message: 'boom'
      }
    })
  })
})
