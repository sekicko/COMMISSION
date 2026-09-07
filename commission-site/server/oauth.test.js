import test from 'node:test'
import assert from 'node:assert/strict'
import { createPkcePair, exchangeCode, getAuthorizationUrl } from './oauth.js'

test('creates an S256 PKCE pair and authorization URL with application_read', () => {
  const { codeVerifier, codeChallenge } = createPkcePair()
  const url = new URL(getAuthorizationUrl({
    clientId: 'app-123',
    redirectUri: 'http://localhost:8787/auth/callback',
    state: 'state-value',
    codeChallenge,
  }))

  assert.equal(url.origin, 'https://auth.deriv.com')
  assert.equal(url.pathname, '/oauth2/auth')
  assert.equal(url.searchParams.get('client_id'), 'app-123')
  assert.equal(url.searchParams.get('scope'), 'application_read')
  assert.equal(url.searchParams.get('state'), 'state-value')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.ok(codeVerifier.length >= 43)
})

test('exchanges a code using the documented PKCE form fields', async () => {
  let request
  const payload = { access_token: 'server-only-access-token', refresh_token: 'server-only-refresh-token' }
  const token = await exchangeCode({
    code: 'authorization-code',
    clientId: 'app-123',
    redirectUri: 'http://localhost:8787/auth/callback',
    codeVerifier: 'verifier-value',
    fetchImpl: async (...args) => {
      request = args
      return { ok: true, async json() { return payload } }
    },
  })

  assert.deepEqual(token, payload)
  assert.equal(request[0], 'https://auth.deriv.com/oauth2/token')
  const body = new URLSearchParams(request[1].body)
  assert.equal(body.get('grant_type'), 'authorization_code')
  assert.equal(body.get('client_id'), 'app-123')
  assert.equal(body.get('code_verifier'), 'verifier-value')
})