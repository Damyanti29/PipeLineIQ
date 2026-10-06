import { api, unwrap } from '@/lib/api'

// Gemini can take a while (retries and model fallback), so this call gets a longer timeout.
export const askHelpline = (message) => api.post('/helpline/chat', { message }, { timeout: 60000 }).then(unwrap)
