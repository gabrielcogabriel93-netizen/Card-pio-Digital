import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyWebhookSignature } from './mercadoPago'

function signManifest(dataId: string, requestId: string, ts: string, secret: string) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  return createHmac('sha256', secret).update(manifest).digest('hex')
}

describe('verifyWebhookSignature', () => {
  const secret = 'test-webhook-secret'
  const dataId = '123456789'
  const requestId = 'req-abc'
  const ts = '1700000000000'

  it('accepts a correctly signed webhook', () => {
    const v1 = signManifest(dataId, requestId, ts, secret)
    const xSignature = `ts=${ts},v1=${v1}`
    expect(verifyWebhookSignature({ xSignature, xRequestId: requestId, dataId, secret })).toBe(true)
  })

  it('lowercases data.id before signing, matching what Mercado Pago sends', () => {
    const v1 = signManifest(dataId, requestId, ts, secret)
    const xSignature = `ts=${ts},v1=${v1}`
    expect(verifyWebhookSignature({ xSignature, xRequestId: requestId, dataId: dataId.toUpperCase(), secret })).toBe(true)
  })

  it('rejects a tampered signature', () => {
    const v1 = signManifest(dataId, requestId, ts, secret)
    const tampered = v1.slice(0, -1) + (v1.at(-1) === '0' ? '1' : '0')
    const xSignature = `ts=${ts},v1=${tampered}`
    expect(verifyWebhookSignature({ xSignature, xRequestId: requestId, dataId, secret })).toBe(false)
  })

  it('rejects when signed with the wrong secret', () => {
    const v1 = signManifest(dataId, requestId, ts, 'a-different-secret')
    const xSignature = `ts=${ts},v1=${v1}`
    expect(verifyWebhookSignature({ xSignature, xRequestId: requestId, dataId, secret })).toBe(false)
  })

  it('rejects when the request-id used to sign does not match', () => {
    const v1 = signManifest(dataId, 'a-different-request-id', ts, secret)
    const xSignature = `ts=${ts},v1=${v1}`
    expect(verifyWebhookSignature({ xSignature, xRequestId: requestId, dataId, secret })).toBe(false)
  })

  it('rejects missing headers', () => {
    expect(verifyWebhookSignature({ xSignature: null, xRequestId: requestId, dataId, secret })).toBe(false)
    expect(verifyWebhookSignature({ xSignature: 'ts=1,v1=abc', xRequestId: null, dataId, secret })).toBe(false)
  })

  it('rejects a malformed x-signature header', () => {
    expect(verifyWebhookSignature({ xSignature: 'garbage', xRequestId: requestId, dataId, secret })).toBe(false)
  })
})
