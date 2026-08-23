require('dotenv').config();

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
