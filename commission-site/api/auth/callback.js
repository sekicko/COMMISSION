import { completeLogin } from '../_lib.js'

export default async function handler(request, response) {
  try {
    await completeLogin(request, response)
  } catch (error) {
    response.redirect(`/?auth_error=${encodeURIComponent(error.message || 'OAuth login failed.')}`)
  }
}
