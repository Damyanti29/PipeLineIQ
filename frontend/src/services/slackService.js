import { api, unwrap } from '@/lib/api'

export const getSlackStatus = () => api.get('/slack/status').then(unwrap)
export const disconnectSlack = () => api.delete('/slack/disconnect')
export const sendSlackTest = () => api.post('/slack/test').then(unwrap)

export async function connectSlack() {
  const { url } = await api.get('/slack/connect').then(unwrap)
  window.location.assign(url)
}
