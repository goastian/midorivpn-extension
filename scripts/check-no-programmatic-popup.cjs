'use strict'

const fs = require('node:fs')
const path = require('node:path')

const sourceRoot = path.join(__dirname, '..', 'src')
const forbidden = /\b(?:chrome|browser)\.(?:action|browserAction)\.openPopup\s*\(/

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return []
      return sourceFiles(absolute)
    }
    return /\.(?:js|ts|vue)$/.test(entry.name) ? [absolute] : []
  })
}

const violations = sourceFiles(sourceRoot).filter((file) => forbidden.test(fs.readFileSync(file, 'utf8')))
if (violations.length > 0) {
  console.error('error: programmatic popup opening is forbidden')
  for (const file of violations) console.error(path.relative(sourceRoot, file))
  process.exit(1)
}

console.log('programmatic popup gate passed')
