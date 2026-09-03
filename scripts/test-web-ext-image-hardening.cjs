'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

require('./web-ext-image-hardening.cjs')
const { imageSize } = require('image-size')

const icns = Buffer.alloc(8)
icns.write('icns', 0, 'ascii')
icns.writeUInt32BE(icns.length, 4)

const heif = Buffer.alloc(12)
heif.writeUInt32BE(heif.length, 0)
heif.write('ftyp', 4, 'ascii')
heif.write('avif', 8, 'ascii')

const jxl = Buffer.alloc(24)
jxl.writeUInt32BE(12, 0)
jxl.write('JXL ', 4, 'ascii')
jxl.writeUInt32BE(12, 12)
jxl.write('ftyp', 16, 'ascii')
jxl.write('jxl ', 20, 'ascii')

for (const [type, payload] of [
  ['icns', icns],
  ['heif', heif],
  ['jxl', jxl],
  ['jxl-stream', Buffer.from([0xff, 0x0a])],
]) {
  assert.throws(
    () => imageSize(payload),
    (error) =>
      error instanceof TypeError &&
      error.message === `disabled file type: ${type}`,
  )
}

const png = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'assets', 'icon16.png'),
)
assert.deepEqual(imageSize(png), { height: 16, width: 16, type: 'png' })

console.log('web-ext image parser hardening passed')
