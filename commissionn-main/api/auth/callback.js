import { callback } from '../../api/_lib.js'
export default async function handler(request, response) { try { await callback(request, response) } catch (error) { response.redirect(`/?auth_error=${encodeURIComponent(error.message)}`) } }
