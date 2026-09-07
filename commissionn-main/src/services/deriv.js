const request = async (url, options) => {
  const response = await fetch(url, options)
  const payload = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new Error(payload?.error || 'Deriv request failed.')
  return payload
}

export const connectDeriv = async () => {
  const session = await request('/api/auth/session')
  if (!session.authenticated) throw new Error('Deriv session is not authorized.')
  return session
}

export const getCommission = (dateFrom, dateTo) => request(`/api/markup/statistics?start_date=${encodeURIComponent(dateFrom.slice(0, 10))}&end_date=${encodeURIComponent(dateTo.slice(0, 10))}`)
export const getAppList = async () => {
  const response = await request('/api/markup/apps')
  return { app_list: response.app_list || [] }
}
export const getAppDetails = () => Promise.reject(new Error('Application details are not available in the current OAuth markup API.'))
export const disconnectDeriv = () => undefined
export const isConnected = () => true
export const getAuthStatus = () => ({ isConnected: true, hasWS: false })
