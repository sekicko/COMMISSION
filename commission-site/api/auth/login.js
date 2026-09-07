import { beginLogin, errorResponse } from '../_lib.js'

export default async function handler(request, response) {
  try {
    await beginLogin(response)
  } catch (error) {
    errorResponse(response, 500, error.message)
  }
}
