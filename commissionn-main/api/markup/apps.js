import { appList } from '../../api/_lib.js'
export default async function handler(request, response) { await appList(request, response) }
