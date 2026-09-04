const advisoryPattern = /^GHSA-[0-9A-Za-z-]+$/
const datePattern = /^\d{4}-\d{2}-\d{2}$/
const blockedSeverities = new Set(['high', 'critical'])

function requireText(value, field, minimumLength = 1) {
  if (typeof value !== 'string' || value.length < minimumLength) {
    throw new Error(`invalid vulnerability exception field: ${field}`)
  }
}

function equalSets(actual, expected) {
  return (
    actual.size === expected.size &&
    [...actual].every((value) => expected.has(value))
  )
}

export function validateAuditPolicy(report, policy, today) {
  if (policy?.schema_version !== 1 || !Array.isArray(policy.exceptions)) {
    throw new Error('invalid vulnerability exception policy schema')
  }
  if (!datePattern.test(today)) {
    throw new Error('invalid audit date')
  }

  const expectedAdvisories = new Set()
  const expectedPackages = new Set()
  for (const exception of policy.exceptions) {
    requireText(exception.id, 'id')
    if (!advisoryPattern.test(exception.id) || expectedAdvisories.has(exception.id)) {
      throw new Error(`invalid or duplicate vulnerability exception: ${exception.id}`)
    }
    requireText(exception.component, 'component')
    requireText(exception.reason, 'reason', 20)
    requireText(exception.mitigation, 'mitigation', 20)
    if (exception.scope !== 'development') {
      throw new Error(`vulnerability exception is not development-only: ${exception.id}`)
    }
    if (!datePattern.test(exception.expires) || exception.expires < today) {
      throw new Error(`vulnerability exception is expired: ${exception.id}`)
    }
    if (
      !Array.isArray(exception.packages) ||
      exception.packages.length === 0 ||
      new Set(exception.packages).size !== exception.packages.length
    ) {
      throw new Error(`invalid package list for vulnerability exception: ${exception.id}`)
    }
    for (const packageName of exception.packages) {
      requireText(packageName, `packages for ${exception.id}`)
      expectedPackages.add(packageName)
    }
    expectedAdvisories.add(exception.id)
  }

  const vulnerabilities = report?.vulnerabilities
  if (report?.auditReportVersion !== 2 || vulnerabilities === null || typeof vulnerabilities !== 'object') {
    throw new Error('invalid npm audit report')
  }

  const blockedEntries = Object.entries(vulnerabilities).filter(([, vulnerability]) =>
    blockedSeverities.has(vulnerability?.severity),
  )
  const actualPackages = new Set(blockedEntries.map(([packageName]) => packageName))
  const actualAdvisories = new Set()
  for (const [, vulnerability] of blockedEntries) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== 'object' || via === null || typeof via.url !== 'string') {
        continue
      }
      const advisory = via.url.split('/').at(-1)
      if (advisoryPattern.test(advisory)) {
        actualAdvisories.add(advisory)
      }
    }
  }

  if (!equalSets(actualAdvisories, expectedAdvisories)) {
    throw new Error('npm audit advisories do not exactly match the reviewed exceptions')
  }
  if (!equalSets(actualPackages, expectedPackages)) {
    throw new Error('npm audit package graph does not exactly match the reviewed exceptions')
  }

  return {
    advisories: [...actualAdvisories].sort(),
    packages: [...actualPackages].sort(),
  }
}
