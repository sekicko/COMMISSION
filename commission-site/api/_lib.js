import { Redis } from '@upstash/redis'
import { createOpaqueValue, createPkcePair, exchangeCode, getAuthorizationUrl } from '../server/oauth.js'
import { getApplicationList, getMarkupStatistics } from '../server/markupApi.js'

const cookieName = 'commission_session'
const statePrefix = 'commission:oauth:'
const sessionPrefix = 'commission:session:'
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? Redis.fromEnv()
  : null
const localStore = new Map()

const store = {
  async get(key) {
    if (redis) return redis.get(key)
    return localStore.get(key) || null
  },
  async set(key, value, seconds) {
    if (redis) return redis.set(key, value, { ex: seconds })
    localStore.set(key, value)
  },
  async delete(key) {
    if (redis) return redis.del(key)
    localStore.delete(key)
  },
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
export const sessionCookie = (id, maxAge = 3600) => `${cookieName}=${encodeURIComponent(id)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}`
export const errorResponse = (response, status, message) => response.status(status).json({ error: message })

export const beginLogin = async (response) => {
  const config = getConfig()
  const state = createOpaqueValue()
  const { codeVerifier, codeChallenge } = createPkcePair()
  await store.set(`${statePrefix}${state}`, { codeVerifier, createdAt: Date.now() }, 600)
  response.redirect(getAuthorizationUrl({ ...config, state, codeChallenge }))
}

export const completeLogin = async (request, response) => {
  const { code, state, error, error_description: errorDescription } = request.query
  if (error) return response.redirect(`/?auth_error=${encodeURIComponent(errorDescription || error)}`)
  const requestData = state ? await store.get(`${statePrefix}${state}`) : null
  if (state) await store.delete(`${statePrefix}${state}`)
  if (!code || !state || !requestData || Date.now() - requestData.createdAt > 600000) return response.redirect('/?auth_error=Invalid%20or%20expired%20OAuth%20state.')

  const token = await exchangeCode({ ...getConfig(), code, codeVerifier: requestData.codeVerifier })
  const sessionId = createOpaqueValue()
  await store.set(`${sessionPrefix}${sessionId}`, token, 3600)
  response.setHeader('Set-Cookie', sessionCookie(sessionId))
  response.redirect('/')
}

export const getSession = async (request) => {
  const sessionId = getCookie(request, cookieName)
  return sessionId ? store.get(`${sessionPrefix}${sessionId}`) : null
}

export const logout = async (request, response) => {
  const sessionId = getCookie(request, cookieName)
  if (sessionId) await store.delete(`${sessionPrefix}${sessionId}`)
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
