import assert from 'node:assert/strict'
import test from 'node:test'

import { validateAuditPolicy } from './audit-policy.mjs'

const exception = {
  id: 'GHSA-w3rx-r6r6-pgpr',
  component: 'web-ext image validation tooling',
  packages: ['image-size', 'addons-linter', 'web-ext'],
  scope: 'development',
  reason: 'Upstream has not published a compatible corrected release yet.',
  mitigation: 'The affected parser is disabled and tested to fail closed.',
  expires: '2026-10-04',
}

function report(overrides = {}) {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      'image-size': {
        severity: 'high',
        via: [{ url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr' }],
      },
      'addons-linter': { severity: 'high', via: ['image-size'] },
      'web-ext': { severity: 'high', via: ['addons-linter'] },
      ...overrides,
    },
  }
}

test('accepts only the exact reviewed development graph', () => {
  const result = validateAuditPolicy(
    report(),
    { schema_version: 1, exceptions: [exception] },
    '2026-09-04',
  )
  assert.deepEqual(result.advisories, ['GHSA-w3rx-r6r6-pgpr'])
  assert.deepEqual(result.packages, ['addons-linter', 'image-size', 'web-ext'])
})

test('rejects expired exceptions', () => {
  assert.throws(
    () =>
      validateAuditPolicy(
        report(),
        { schema_version: 1, exceptions: [{ ...exception, expires: '2026-09-03' }] },
        '2026-09-04',
      ),
    /expired/,
  )
})

test('rejects an unreviewed advisory', () => {
  assert.throws(
    () =>
      validateAuditPolicy(
        report({
          extra: {
            severity: 'critical',
            via: [{ url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }],
          },
        }),
        { schema_version: 1, exceptions: [exception] },
        '2026-09-04',
      ),
    /advisories do not exactly match/,
  )
})

test('rejects stale exceptions after the advisory is fixed', () => {
  assert.throws(
    () =>
      validateAuditPolicy(
        { auditReportVersion: 2, vulnerabilities: {} },
        { schema_version: 1, exceptions: [exception] },
        '2026-09-04',
      ),
    /advisories do not exactly match/,
  )
})
