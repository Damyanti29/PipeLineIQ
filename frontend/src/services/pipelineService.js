import { api, unwrap } from '@/lib/api'

export const listPipelineAlerts = (params = {}) =>
  api.get('/pipeline-alerts', { params: Object.fromEntries(Object.entries(params).filter(([, v]) => v && v !== 'all')) }).then(unwrap)
export const updatePipelineAlertStatus = (id, status) => api.patch(`/pipeline-alerts/${id}/status`, { status }).then(unwrap)
