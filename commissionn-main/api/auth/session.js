import { authSession } from '../../api/_lib.js'
export default function handler(request, response) { authSession(request, response) }
