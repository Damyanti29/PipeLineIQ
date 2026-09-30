import { api, unwrap } from '@/lib/api'

export const getGithubStatus = () => api.get('/github/status').then(unwrap)
export const listGithubRepositories = () => api.get('/github/repositories').then(unwrap)

// The backend returns the GitHub App install URL (with signed state); the browser follows it.
export async function connectGithub() {
  const { url } = await api.get('/github/connect').then(unwrap)
  window.location.assign(url)
}
