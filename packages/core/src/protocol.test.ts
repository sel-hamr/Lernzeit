import { describe, expect, it } from 'vitest'
import { BridgeError, toErrorBody } from './protocol'

describe('toErrorBody', () => {
  it('keeps the code of a BridgeError and calls anything else internal', () => {
    expect(toErrorBody(new BridgeError('invalid_input', 'Too slow'))).toEqual({ code: 'invalid_input', message: 'Too slow' })
    expect(toErrorBody(new Error('Boom'))).toEqual({ code: 'internal', message: 'Boom' })
    expect(toErrorBody('odd')).toEqual({ code: 'internal', message: 'odd' })
  })
})
