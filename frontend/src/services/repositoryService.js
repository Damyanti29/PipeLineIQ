import { api, unwrap } from '@/lib/api'

export const listRepositories = () => api.get('/repositories').then(unwrap)
export const getRepository = (id) => api.get(`/repositories/${id}`).then(unwrap)
export const addRepository = (githubRepoId) => api.post('/repositories', { githubRepoId }).then(unwrap)
export const setMonitoring = (id, monitoringEnabled) => api.patch(`/repositories/${id}`, { monitoringEnabled }).then(unwrap)
export const listRepositoryEvents = (id) => api.get(`/repositories/${id}/events`).then(unwrap)
