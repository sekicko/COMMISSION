import WebSocket from 'ws'

const APP_ID = process.env.DERIV_APP_ID
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`

const request = (socket, payload, requestId) => new Promise((resolve, reject) => {
  const onMessage = (message) => {
    const response = JSON.parse(message.toString())
    if (response.req_id !== requestId) return
    socket.off('message', onMessage)
    if (response.error) reject(new Error(response.error.message || 'Deriv API request failed.'))
    else resolve(response)
  }
  socket.on('message', onMessage)
})

export const getMarkupStatistics = ({ accessToken, dateFrom, dateTo }) => new Promise((resolve, reject) => {
  const socket = new WebSocket(WS_URL)
  let requestId = 1
  const close = () => socket.close()
  const timeout = setTimeout(() => {
    close()
    reject(new Error('Deriv markup statistics request timed out.'))
  }, 15000)

  socket.once('open', async () => {
    try {
      await request(socket, { authorize: accessToken, req_id: requestId }, requestId++)
      const response = await request(socket, {
        app_markup_statistics: 1,
        date_from: dateFrom,
        date_to: dateTo,
        req_id: requestId,
      }, requestId)
      clearTimeout(timeout)
      close()
      resolve(response)
    } catch (error) {
      clearTimeout(timeout)
      close()
      reject(error)
    }
  })
  socket.once('error', (error) => {
    clearTimeout(timeout)
    reject(error)
  })
})