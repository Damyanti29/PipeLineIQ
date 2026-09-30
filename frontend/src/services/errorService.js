import { api, unwrap } from '@/lib/api'

// Drops empty filters so they are not sent as query params.
const clean = (params = {}) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== 'all'))

export const listErrors = (filters) => api.get('/errors', { params: clean(filters) }).then(unwrap)
export const getErrorStats = (params) => api.get('/errors/stats', { params: clean(params) }).then(unwrap)
export const getError = (id) => api.get(`/errors/${id}`).then(unwrap)
export const updateErrorStatus = (id, status) => api.patch(`/errors/${id}/status`, { status }).then(unwrap)
