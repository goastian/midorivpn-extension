'use strict'

// web-ext 10.6.0 -> addons-linter 10.10.0 uses image-size 2.0.2. The latest
// image-size release has unpatched infinite-loop advisories in its ICNS, JXL,
// and HEIF parsers. MidoriVPN store assets are PNG, so disable the affected
// formats before addons-linter loads the shared module instance.
const { disableTypes } = require('image-size')

disableTypes(['heif', 'icns', 'jxl', 'jxl-stream'])
