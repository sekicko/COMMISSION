import express from 'express'
import { createOpaqueValue, createPkcePair, exchangeCode, getAuthorizationUrl } from './oauth.js'
import { getMarkupStatistics } from './markupApi.js'

const app = express()
const port = Number(process.env.PORT || 8787)
const clientId = process.env.DERIV_APP_ID
const redirectUri = process.env.DERIV_REDIRECT_URI || `http://localhost:${port}/auth/callback`
const sessions = new Map()
const oauthRequests = new Map()
const cookieName = 'commission_session'
const cookieOptions = `HttpOnly; SameSite=Lax; Path=/; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}`

const parseCookies = (header = '') => Object.fromEntries(header.split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter(([key, value]) => key && value))
const sendError = (response, status, message) => response.status(status).json({ error: message })
const getSession = (request) => sessions.get(parseCookies(request.headers.cookie)[cookieName])

const requireConfig = () => {
  if (!clientId) throw new Error('DERIV_APP_ID is not configured on the server.')
}

app.use(express.json())

app.get('/auth/login', (request, response) => {
  try {
    requireConfig()
    const state = createOpaqueValue()
    const { codeVerifier, codeChallenge } = createPkcePair()
    oauthRequests.set(state, { codeVerifier, createdAt: Date.now() })
    const url = getAuthorizationUrl({ clientId, redirectUri, state, codeChallenge })
    response.redirect(url)
  } catch (error) { sendError(response, 500, error.message) }
})

app.get('/auth/callback', async (request, response) => {
  const { code, state, error, error_description: errorDescription } = request.query
  if (error) return response.redirect(`/?auth_error=${encodeURIComponent(errorDescription || error)}`)
  const requestData = oauthRequests.get(state)
  oauthRequests.delete(state)
  if (!code || !state || !requestData || Date.now() - requestData.createdAt > 10 * 60 * 1000) return response.redirect('/?auth_error=Invalid%20or%20expired%20OAuth%20state.')

  try {
    requireConfig()
    const token = await exchangeCode({ code, clientId, redirectUri, codeVerifier: requestData.codeVerifier })
    const sessionId = createOpaqueValue()
    sessions.set(sessionId, { ...token, createdAt: Date.now() })
    response.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(sessionId)}; ${cookieOptions}`)
    response.redirect('/')
  } catch (exchangeError) { response.redirect(`/?auth_error=${encodeURIComponent(exchangeError.message)}`) }
})

app.get('/auth/session', (request, response) => response.json({ authenticated: Boolean(getSession(request)) }))
app.get('/api/auth/session', (request, response) => response.json({ authenticated: Boolean(getSession(request)) }))

app.post('/auth/logout', (request, response) => {
  const cookies = parseCookies(request.headers.cookie)
  sessions.delete(cookies[cookieName])
  response.setHeader('Set-Cookie', `${cookieName}=; Max-Age=0; ${cookieOptions}`)
  response.status(204).end()
})
app.post('/api/auth/logout', (request, response) => {
  const cookies = parseCookies(request.headers.cookie)
  sessions.delete(cookies[cookieName])
  response.setHeader('Set-Cookie', `${cookieName}=; Max-Age=0; ${cookieOptions}`)
  response.status(204).end()
})

app.get('/api/markup/statistics', async (request, response) => {
  const session = getSession(request)
  if (!session?.access_token) return sendError(response, 401, 'Please sign in with Deriv first.')
  const { start_date: startDate, end_date: endDate } = request.query
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) return sendError(response, 400, 'Choose a valid date range.')

  try {
    const payload = await getMarkupStatistics({ accessToken: session.access_token, dateFrom: `${startDate} 00:00:00`, dateTo: `${endDate} 23:59:59` })
    response.json(payload)
  } catch (error) { sendError(response, 502, error.message || 'Unable to reach Deriv analytics.') }
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static('dist'))
  app.use((request, response) => response.sendFile('index.html', { root: 'dist' }))
}

if (process.env.NODE_ENV !== 'test') app.listen(port, () => console.log(`Commission server listening on http://localhost:${port}`))

export { app, oauthRequests, sessions }