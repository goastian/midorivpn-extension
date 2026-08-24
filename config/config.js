const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath, quiet: true });
}

const browser = process.env.BROWSER || 'firefox';
const app_env = process.env.APP_ENV;
const port = process.env.PORT;
const host = process.env.HOST;

module.exports = {
  browser,
  app_env,
  port,
  host
}
