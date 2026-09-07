import { getMarkup } from '../_lib.js'

export default async function handler(request, response) {
  await getMarkup(request, response)
}
