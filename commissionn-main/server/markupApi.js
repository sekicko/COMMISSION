import WebSocket from 'ws'

const appId = process.env.DERIV_APP_ID || process.env.REACT_APP_DERIV_APP_ID || '1089'
const socketUrl = `wss://ws.derivws.com/websockets/v3?app_id=${appId}`

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

const call = async (accessToken, payload) => {
  const socket = new WebSocket(socketUrl)
  const timeout = setTimeout(() => socket.close(), 15000)
  try {
    await new Promise((resolve, reject) => {
      socket.once('open', resolve)
      socket.once('error', reject)
    })
    await request(socket, { authorize: accessToken, req_id: 1 }, 1)
    const response = await request(socket, { ...payload, req_id: 2 }, 2)
    return response
  } finally {
    clearTimeout(timeout)
    socket.close()
  }
}

export const getMarkupStatistics = ({ accessToken, dateFrom, dateTo }) => call(accessToken, { app_markup_statistics: 1, date_from: dateFrom, date_to: dateTo })
export const getApplicationList = ({ accessToken }) => call(accessToken, { app_list: 1 })
