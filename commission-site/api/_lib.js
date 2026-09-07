import crypto from 'node:crypto'
import { createOpaqueValue, createPkcePair, exchangeCode, getAuthorizationUrl } from '../server/oauth.js'
import { getApplicationList, getMarkupStatistics } from '../server/markupApi.js'

const sessionCookieName = 'commission_session'
const oauthCookieName = 'commission_oauth'

const getKey = () => crypto.createHash('sha256')
  .update(`${process.env.DERIV_APP_ID}:${process.env.DERIV_REDIRECT_URI}:commission-site-session`)
  .digest()

const encrypt = (value) => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.')
}

const decrypt = (value) => {
  try {
    const [ivValue, tagValue, ciphertextValue] = value.split('.')
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivValue, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertextValue, 'base64url')), decipher.final()]).toString('utf8'))
  } catch {
    return null
  }
}

export const getConfig = () => {
  if (!process.env.DERIV_APP_ID) throw new Error('DERIV_APP_ID is not configured.')
  if (!process.env.DERIV_REDIRECT_URI) throw new Error('DERIV_REDIRECT_URI is not configured.')
  return { clientId: process.env.DERIV_APP_ID, redirectUri: process.env.DERIV_REDIRECT_URI }
}

export const getCookie = (request, name) => {
  const value = request.headers.cookie?.split(';').map((part) => part.trim().split('='))
    .find(([key]) => key === name)?.[1]
  return value ? decodeURIComponent(value) : undefined
}

const cookie = (name, value, maxAge = 3600) => `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}`
export const sessionCookie = (value, maxAge = 3600) => cookie(sessionCookieName, value, maxAge)
export const errorResponse = (response, status, message) => response.status(status).json({ error: message })

export const beginLogin = async (response) => {
  const config = getConfig()
  const state = createOpaqueValue()
  const { codeVerifier, codeChallenge } = createPkcePair()
  response.setHeader('Set-Cookie', cookie(oauthCookieName, encrypt({ state, codeVerifier, createdAt: Date.now() }), 600))
  response.redirect(getAuthorizationUrl({ ...config, state, codeChallenge }))
}

export const completeLogin = async (request, response) => {
  const { code, state, error, error_description: errorDescription } = request.query
  if (error) return response.redirect(`/?auth_error=${encodeURIComponent(errorDescription || error)}`)
  const oauthState = decrypt(getCookie(request, oauthCookieName))
  if (!code || !state || !oauthState || oauthState.state !== state || Date.now() - oauthState.createdAt > 600000) return response.redirect('/?auth_error=Invalid%20or%20expired%20OAuth%20state.')

  const token = await exchangeCode({ ...getConfig(), code, codeVerifier: oauthState.codeVerifier })
  response.setHeader('Set-Cookie', [sessionCookie(encrypt(token)), cookie(oauthCookieName, '', 0)])
  response.redirect('/')
}

export const getSession = async (request) => {
  const value = getCookie(request, sessionCookieName)
  return value ? decrypt(value) : null
}

export const logout = async (request, response) => {
  response.setHeader('Set-Cookie', sessionCookie('', 0))
  response.status(204).end()
}

export const getMarkup = async (request, response) => {
  const session = await getSession(request)
  if (!session?.access_token) return errorResponse(response, 401, 'Please sign in with Deriv first.')
  const { start_date: startDate, end_date: endDate } = request.query
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) return errorResponse(response, 400, 'Choose a valid date range.')
  try {
    const [markupResult, applicationsResult] = await Promise.allSettled([
      getMarkupStatistics({ accessToken: session.access_token, dateFrom: `${startDate} 00:00:00`, dateTo: `${endDate} 23:59:59` }),
      getApplicationList({ accessToken: session.access_token }),
    ])
    if (markupResult.status === 'rejected') throw markupResult.reason
    response.json({ ...markupResult.value, app_list: applicationsResult.status === 'fulfilled' ? applicationsResult.value : [] })
  } catch (error) { errorResponse(response, 502, error.message || 'Unable to reach Deriv markup statistics.') }
}
