import WebSocket from 'ws'

const webSocketAppId = (process.env.DERIV_API_APP_ID || process.env.DERIV_WS_APP_ID || '1089').trim()
const appId = /^\d+$/.test(webSocketAppId) ? webSocketAppId : '1089'
const socketUrl = `wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(appId)}`

const request = (socket, payload, operation) => new Promise((resolve, reject) => {
  let settled = false
  const finish = (callback, value) => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    socket.off('message', onMessage)
    socket.off('close', onClose)
    socket.off('error', onError)
    callback(value)
  }
  const onMessage = (message) => {
    let response
    try { response = JSON.parse(message.toString()) } catch { return }
    if (response.error) finish(reject, new Error(response.error.message || 'Deriv API request failed.'))
    else finish(resolve, response)
  }
  const onClose = () => finish(reject, new Error('Deriv WebSocket closed before returning a response.'))
  const onError = (error) => finish(reject, error)
  const timeout = setTimeout(() => finish(reject, new Error(`Deriv ${operation} request timed out using WebSocket app ID ${appId}.`)), 15000)
  socket.on('message', onMessage)
  socket.once('close', onClose)
  socket.once('error', onError)
})

const call = async (accessToken, payload) => {
  if (!appId) throw new Error('DERIV_APP_ID is missing on the server.')
  const socket = new WebSocket(socketUrl)
  try {
    await new Promise((resolve, reject) => {
      socket.once('open', resolve)
      socket.once('error', reject)
      socket.once('unexpected-response', (_request, response) => reject(new Error(`Deriv WebSocket rejected the app ID with HTTP ${response.statusCode}. Check DERIV_APP_ID in Vercel.`)))
    })
    await request(socket, { authorize: accessToken }, 'authorize')
    const operation = payload.app_list ? 'app_list' : 'app_markup_statistics'
    const response = await request(socket, payload, operation)
    return response
  } finally {
    socket.close()
  }
}

export const getMarkupStatistics = ({ accessToken, dateFrom, dateTo }) => call(accessToken, { app_markup_statistics: 1, date_from: dateFrom, date_to: dateTo })
export const getApplicationList = ({ accessToken }) => call(accessToken, { app_list: 1 })
