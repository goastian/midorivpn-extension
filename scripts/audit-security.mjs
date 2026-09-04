import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { validateAuditPolicy } from './audit-policy.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '..')
const policyPath = path.join(repositoryRoot, 'security', 'vulnerability-exceptions.json')
const audit = spawnSync('npm', ['audit', '--json', '--audit-level=high'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
})

if (audit.error) {
  throw audit.error
}
if (audit.status !== 0 && audit.status !== 1) {
  process.stderr.write(audit.stderr)
  throw new Error(`npm audit failed operationally with status ${audit.status}`)
}

let report
try {
  report = JSON.parse(audit.stdout)
} catch (error) {
  process.stderr.write(audit.stderr)
  throw new Error(`npm audit did not return valid JSON: ${error.message}`, {
    cause: error,
  })
}

const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
const result = validateAuditPolicy(report, policy, new Date().toISOString().slice(0, 10))

const hardening = spawnSync('node', ['scripts/test-web-ext-image-hardening.cjs'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
})
process.stdout.write(hardening.stdout)
process.stderr.write(hardening.stderr)
if (hardening.status !== 0) {
  throw new Error('web-ext image parser hardening failed')
}

console.log(
  `Reviewed development-only audit exception passed: ${result.advisories.length} advisories across ${result.packages.length} packages`,
)
