import crypto from 'node:crypto'
import express from 'express'
import { createOpaqueValue, createPkcePair, exchangeCode, getAuthorizationUrl } from './oauth.js'
import { getApplicationList, getMarkupStatistics } from './markupApi.js'

const app = express()
const port = Number(process.env.PORT || 8787)
const clientId = process.env.DERIV_APP_ID || process.env.REACT_APP_DERIV_APP_ID
const getRedirectUri = () => {
  if (process.env.DERIV_REDIRECT_URI) return process.env.DERIV_REDIRECT_URI
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/oauth/callback`
  if (process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}/oauth/callback`
  return `http://localhost:${port}/oauth/callback`
}
const redirectUri = getRedirectUri()
const cookieName = 'commission_main_session'
const oauthCookie = 'commission_main_oauth'

const key = () => crypto.createHash('sha256').update(`${clientId || 'missing_app_id'}:${redirectUri}:commission-main`).digest()
const seal = (value) => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64url')).join('.')
}
const open = (value) => {
  try {
    const [iv, tag, body] = value.split('.')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString())
  } catch { return null }
}
const getCookie = (request, name) => request.headers.cookie?.split(';').map((part) => part.trim().split('=')).find(([key]) => key === name)?.[1]
const setCookie = (name, value, maxAge = 3600) => {
  const base = `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${maxAge};`
  if (process.env.NODE_ENV === 'production') return `${base} SameSite=None; Secure;`
  return `${base} SameSite=Lax;`
}
const error = (response, status, message) => response.status(status).json({ error: message })
const requireConfig = () => { if (!clientId) throw new Error('DERIV_APP_ID is missing. Add the registered Deriv app ID in Vercel env vars.') }
const getSession = (request) => open(decodeURIComponent(getCookie(request, cookieName) || ''))

app.get(['/auth/login', '/api/auth/login'], (request, response) => {
  try {
    requireConfig()
    const state = createOpaqueValue()
    const { verifier, challenge } = createPkcePair()
    response.setHeader('Set-Cookie', setCookie(oauthCookie, seal({ state, verifier, createdAt: Date.now() }), 600))
    response.redirect(getAuthorizationUrl({ clientId, redirectUri, state, challenge }))
  } catch (requestError) { response.redirect(`/?auth_error=${encodeURIComponent(requestError.message)}`) }
})

app.get(['/auth/callback', '/api/auth/callback', '/oauth/callback'], async (request, response) => {
  try {
    const { code, state, error: authError, error_description: description } = request.query
    if (authError) return response.redirect(`/?auth_error=${encodeURIComponent(description || authError)}`)
    requireConfig()
    const pending = open(decodeURIComponent(getCookie(request, oauthCookie) || ''))
    if (!code || !state || !pending || pending.state !== state || Date.now() - pending.createdAt > 600000) return response.redirect('/?auth_error=Invalid%20or%20expired%20OAuth%20state.')
    const token = await exchangeCode({ code, clientId, redirectUri, verifier: pending.verifier })
    response.setHeader('Set-Cookie', setCookie(cookieName, seal(token)))
    response.redirect('/')
  } catch (requestError) { response.redirect(`/?auth_error=${encodeURIComponent(requestError.message)}`) }
})

app.get(['/auth/session', '/api/auth/session'], (request, response) => response.json({ authenticated: Boolean(getSession(request)) }))
app.post(['/auth/logout', '/api/auth/logout'], (request, response) => { response.setHeader('Set-Cookie', setCookie(cookieName, '', 0)); response.status(204).end() })
app.get('/api/markup/statistics', async (request, response) => {
  const session = getSession(request)
  if (!session?.access_token) return error(response, 401, 'Please sign in with Deriv first.')
  const { start_date: startDate, end_date: endDate } = request.query
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) return error(response, 400, 'Choose a valid date range.')
  try {
    const [stats, apps] = await Promise.all([getMarkupStatistics({ accessToken: session.access_token, dateFrom: `${startDate} 00:00:00`, dateTo: `${endDate} 23:59:59` }), getApplicationList({ accessToken: session.access_token })])
    response.json({ ...stats, app_list: apps.app_list || [] })
  } catch (requestError) { error(response, 502, requestError.message) }
})

if (process.env.NODE_ENV !== 'test') app.listen(port, () => console.log(`Commission server listening on ${port}`))
export default app
