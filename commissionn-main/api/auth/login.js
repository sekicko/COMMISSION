import { login } from '../../api/_lib.js'
export default function handler(request, response) { try { login(response) } catch (error) { response.status(500).json({ error: error.message }) } }
