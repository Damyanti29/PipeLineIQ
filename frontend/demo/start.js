// `npm run demo`: explore the full UI with sample data. No Supabase, backend or credentials needed.
import { spawn } from 'node:child_process'
import { startDemoServer } from './demoServer.js'

const API_PORT = 5199
const UI_PORT = 5180

await startDemoServer(API_PORT)
console.log(`\n  Demo API (mock)  → http://localhost:${API_PORT}`)
console.log(`  Demo UI          → http://localhost:${UI_PORT}  (sign in with any email and password)\n`)

// One command string: with shell: true, Node deprecates passing an args array.
const command = `npx vite --port ${UI_PORT} --strictPort${process.env.DEMO_NO_OPEN ? '' : ' --open'}`
const vite = spawn(command, {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    VITE_SUPABASE_URL: `http://localhost:${API_PORT}`,
    VITE_SUPABASE_ANON_KEY: 'demo-anon-key',
    VITE_API_URL: `http://localhost:${API_PORT}`,
    VITE_DEMO_MODE: 'true',
  },
})
vite.on('exit', (code) => process.exit(code ?? 0))
