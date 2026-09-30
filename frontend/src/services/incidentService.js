import { api, unwrap } from '@/lib/api'

export const listIncidents = (params = {}) =>
  api.get('/incidents', { params: Object.fromEntries(Object.entries(params).filter(([, v]) => v && v !== 'all')) }).then(unwrap)
export const getIncident = (id) => api.get(`/incidents/${id}`).then(unwrap)
export const updateIncidentStatus = (id, status) => api.patch(`/incidents/${id}/status`, { status }).then(unwrap)
export const createGithubIssue = (id) => api.post(`/incidents/${id}/github-issue`).then(unwrap)
