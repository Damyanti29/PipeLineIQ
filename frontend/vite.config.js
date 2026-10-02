import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// One place to configure: when frontend/.env leaves a public value empty, it is taken from
// backend/.env. Only these public values are read; backend secrets never reach the bundle.
function publicFallbacks(mode) {
  const frontend = loadEnv(mode, __dirname, 'VITE_')
  const backend = loadEnv(mode, resolve(__dirname, '../backend'), ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'PORT'])
  const fallbacks = {
    VITE_SUPABASE_URL: backend.SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: backend.SUPABASE_ANON_KEY,
    // The browser talks to the local API directly, even when OAuth goes through a tunnel.
    VITE_API_URL: `http://localhost:${backend.PORT || 5000}`,
  }
  return Object.fromEntries(
    Object.entries(fallbacks)
      .filter(([name, value]) => !frontend[name] && value)
      .map(([name, value]) => [`import.meta.env.${name}`, JSON.stringify(value)]),
  )
}

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: publicFallbacks(mode),
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
}))
