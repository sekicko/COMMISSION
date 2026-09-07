import crypto from 'node:crypto'
import { createOpaqueValue, createPkcePair, exchangeCode, getAuthorizationUrl } from '../server/oauth.js'
import { getApplicationList, getMarkupStatistics } from '../server/markupApi.js'

const sessionName = 'commission_main_session'
const oauthName = 'commission_main_oauth'
const getRedirectUri = () => {
  if (process.env.DERIV_REDIRECT_URI) return process.env.DERIV_REDIRECT_URI
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/oauth/callback`
  if (process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}/oauth/callback`
  return `http://localhost:${process.env.PORT || 8787}/oauth/callback`
}
const key = () => crypto.createHash('sha256').update(`${process.env.DERIV_APP_ID || 'missing_app_id'}:${getRedirectUri()}:commission-main`).digest()
const seal = (value) => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64url')).join('.')
}
const open = (value) => { try { const [iv, tag, body] = value.split('.'); const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url')); decipher.setAuthTag(Buffer.from(tag, 'base64url')); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString()) } catch { return null } }
const config = () => {
  if (!process.env.DERIV_APP_ID) throw new Error('DERIV_APP_ID is missing. Add the registered Deriv app ID in Vercel env vars.')
  const redirectUri = getRedirectUri()
  if (!redirectUri) throw new Error('DERIV_REDIRECT_URI is missing. Add the exact callback URL in Vercel env vars.')
  return { clientId: process.env.DERIV_APP_ID, redirectUri }
}
const cookie = (name, value, age = 3600) => {
  const base = `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${age};`
  if (process.env.NODE_ENV === 'production') return `${base} SameSite=None; Secure;`
  return `${base} SameSite=Lax;`
}
const getCookie = (request, name) => { const value = request.headers.cookie?.split(';').map((part) => part.trim().split('=')).find(([key]) => key === name)?.[1]; return value ? decodeURIComponent(value) : '' }
const session = (request) => open(getCookie(request, sessionName))
export const login = (response) => {
  try {
    const { clientId, redirectUri } = config()
    const state = createOpaqueValue()
    const { verifier, challenge } = createPkcePair()
    response.setHeader('Set-Cookie', cookie(oauthName, seal({ state, verifier, createdAt: Date.now() }), 600))
    response.redirect(getAuthorizationUrl({ clientId, redirectUri, state, challenge }))
  } catch (error) {
    response.redirect(`/?auth_error=${encodeURIComponent(error.message)}`)
  }
}
export const callback = async (request, response) => {
  const { code, state, error, error_description: description } = request.query
  if (error) return response.redirect(`/?auth_error=${encodeURIComponent(description || error)}`)

  try {
    const { clientId, redirectUri } = config()
    const pending = open(getCookie(request, oauthName))
    if (!code || !state || !pending || pending.state !== state || Date.now() - pending.createdAt > 600000) return response.redirect('/?auth_error=Invalid%20or%20expired%20OAuth%20state.')
    const token = await exchangeCode({ clientId, redirectUri, code, verifier: pending.verifier })
    response.setHeader('Set-Cookie', cookie(sessionName, seal(token)))
    response.redirect('/')
  } catch (requestError) {
    response.redirect(`/?auth_error=${encodeURIComponent(requestError.message)}`)
  }
}
export const authSession = (request, response) => response.json({ authenticated: Boolean(session(request)) })
export const logout = (response) => { response.setHeader('Set-Cookie', cookie(sessionName, '', 0)); response.status(204).end() }
export const appList = async (request, response) => {
  const token = session(request)?.access_token
  if (!token) return response.status(401).json({ error: 'Please sign in with Deriv first.' })
  try {
    const apps = await getApplicationList({ accessToken: token })
    response.json({ app_list: apps.app_list || [] })
  } catch (error) {
    response.status(502).json({ error: error.message })
  }
}
export const markup = async (request, response) => { const token = session(request)?.access_token; if (!token) return response.status(401).json({ error: 'Please sign in with Deriv first.' }); const { start_date: startDate, end_date: endDate } = request.query; try { const [stats, apps] = await Promise.all([getMarkupStatistics({ accessToken: token, dateFrom: `${startDate} 00:00:00`, dateTo: `${endDate} 23:59:59` }), getApplicationList({ accessToken: token })]); response.json({ ...stats, app_list: apps.app_list || [] }) } catch (error) { response.status(502).json({ error: error.message }) } }
