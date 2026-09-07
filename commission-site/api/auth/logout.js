import { logout } from '../_lib.js'

export default async function handler(request, response) {
  await logout(request, response)
}
