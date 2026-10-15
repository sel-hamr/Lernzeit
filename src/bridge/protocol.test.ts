import { describe, expect, it } from 'vitest'
import { BridgeError, parseAppMessage, parseServerMessage, toErrorBody } from './protocol'

describe('parseServerMessage', () => {
  it('reads welcome, rejected and request messages', () => {
    expect(parseServerMessage('{"type":"welcome"}')).toEqual({ type: 'welcome' })
    expect(parseServerMessage('{"type":"rejected","reason":"wrong_token"}')).toEqual({ type: 'rejected', reason: 'wrong_token' })
    expect(parseServerMessage('{"type":"request","id":"r1","action":"list_decks","params":{}}')).toEqual({
      type: 'request',
      id: 'r1',
      action: 'list_decks',
      params: {},
    })
  })

  it('ignores broken JSON, unknown types and missing fields', () => {
    expect(parseServerMessage('not json')).toBeUndefined()
    expect(parseServerMessage('[1,2]')).toBeUndefined()
    expect(parseServerMessage('{"type":"hello"}')).toBeUndefined()
    expect(parseServerMessage('{"type":"request","id":"r1","action":"list_decks"}')).toBeUndefined()
  })

  it('keeps only the known fields', () => {
    expect(parseServerMessage('{"type":"welcome","extra":true}')).toEqual({ type: 'welcome' })
  })
})

describe('parseAppMessage', () => {
  it('reads hello and both kinds of response', () => {
    expect(parseAppMessage('{"type":"hello","version":1,"token":"t","name":"Edge","kind":"Edge"}')).toEqual({
      type: 'hello',
      version: 1,
      token: 't',
      name: 'Edge',
      kind: 'Edge',
    })
    expect(parseAppMessage('{"type":"response","id":"r1","ok":true,"result":[1]}')).toEqual({ type: 'response', id: 'r1', ok: true, result: [1] })
    expect(parseAppMessage('{"type":"response","id":"r1","ok":false,"error":{"code":"deck_not_found","message":"No deck"}}')).toEqual({
      type: 'response',
      id: 'r1',
      ok: false,
      error: { code: 'deck_not_found', message: 'No deck' },
    })
  })

  it('ignores a hello without a token and an error without a message', () => {
    expect(parseAppMessage('{"type":"hello","version":1,"name":"Edge","kind":"Edge"}')).toBeUndefined()
    expect(parseAppMessage('{"type":"response","id":"r1","ok":false,"error":{"code":"internal"}}')).toBeUndefined()
  })
})

describe('toErrorBody', () => {
  it('keeps the code of a BridgeError and calls anything else internal', () => {
    expect(toErrorBody(new BridgeError('timeout', 'Too slow'))).toEqual({ code: 'timeout', message: 'Too slow' })
    expect(toErrorBody(new Error('Boom'))).toEqual({ code: 'internal', message: 'Boom' })
    expect(toErrorBody('odd')).toEqual({ code: 'internal', message: 'odd' })
  })
})
