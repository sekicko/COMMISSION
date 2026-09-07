import { getSession } from '../_lib.js'

export default async function handler(request, response) {
  response.json({ authenticated: Boolean(await getSession(request)) })
}
