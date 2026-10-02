// `npm run check-env`: tests every credential in backend/.env against the live services.
import { runChecks } from '../src/config/checkEnv.js'
import { configSummary } from '../src/config/summary.js'
import { closeQueues } from '../src/workers/queue.js'

const c = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', dim: '\x1b[2m', reset: '\x1b[0m' }

console.log(configSummary())
console.log('Live checks:')
const results = await runChecks()
for (const [name, r] of Object.entries(results)) {
  const mark = r.ok === true ? `${c.green}✔` : r.ok === false ? `${c.red}✘` : `${c.yellow}!`
  console.log(`  ${mark}${c.reset} ${name.padEnd(9)} ${r.detail}`)
  if (r.fix) console.log(`    ${c.dim}→ ${r.fix}${c.reset}`)
}

const failed = Object.values(results).filter((r) => r.ok === false).length
console.log(failed ? `\n${c.red}${failed} problem(s) to fix.${c.reset}\n` : `\n${c.green}Everything needed is working.${c.reset}\n`)
await closeQueues().catch(() => {})
process.exit(failed ? 1 : 0)
