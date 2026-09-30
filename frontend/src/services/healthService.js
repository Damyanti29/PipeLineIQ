import { API_URL } from '@/lib/api'

// Public endpoint; bypasses the auth interceptor so it works before sign-in too.
export async function getHealth() {
  const response = await fetch(`${API_URL}/api/health`, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`API returned ${response.status}`)
  return response.json()
}
