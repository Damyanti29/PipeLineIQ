import axios from 'axios'
import { supabase } from './supabase'

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '')

export const api = axios.create({ baseURL: `${API_URL}/api`, timeout: 20000 })

// Every request carries the current Supabase access token.
api.interceptors.request.use(async (config) => {
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Normalizes the backend's { error: { code, message } } shape into Error objects.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = error.response?.data?.error
    const normalized = new Error(apiError?.message ?? (error.response ? `Request failed (${error.response.status})` : 'Cannot reach the PipelineIQ API'))
    normalized.status = error.response?.status
    normalized.code = apiError?.code
    normalized.details = apiError?.details
    return Promise.reject(normalized)
  },
)

// Backend responses are always { data: ... }.
export const unwrap = (response) => response.data?.data
