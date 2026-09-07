import crypto from 'node:crypto'

const base64Url = (value) => Buffer.from(value).toString('base64url')

export const createPkcePair = () => {
  const codeVerifier = base64Url(crypto.randomBytes(32))
  const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest())
  return { codeVerifier, codeChallenge }
}

export const createOpaqueValue = (bytes = 32) => base64Url(crypto.randomBytes(bytes))

export const getAuthorizationUrl = ({ clientId, redirectUri, state, codeChallenge }) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'application_read',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `https://auth.deriv.com/oauth2/auth?${params}`
}

export const exchangeCode = async ({ code, clientId, redirectUri, codeVerifier, fetchImpl = fetch }) => {
  const response = await fetchImpl('https://auth.deriv.com/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  })

  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error_description || payload.error || 'Deriv token exchange failed.')
  return payload
}
