import crypto from 'node:crypto'

const encode = (value) => Buffer.from(value).toString('base64url')
export const createOpaqueValue = () => encode(crypto.randomBytes(32))
export const createPkcePair = () => {
  const verifier = encode(crypto.randomBytes(32))
  const challenge = encode(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export const getAuthorizationUrl = ({ clientId, redirectUri, state, challenge }) => {
  const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: 'application_read', state, code_challenge: challenge, code_challenge_method: 'S256' })
  return `https://auth.deriv.com/oauth2/auth?${params}`
}

export const exchangeCode = async ({ code, clientId, redirectUri, verifier }) => {
  const response = await fetch('https://auth.deriv.com/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: redirectUri, code_verifier: verifier }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error_description || payload.error || 'Deriv authorization failed.')
  return payload
}
