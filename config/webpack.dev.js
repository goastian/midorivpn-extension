const config = require('../webpack.config.js');
const { port, host } = require('./config.js');

const path = require('path');
const webpack = require('webpack');
const webpackDevServer = require('webpack-dev-server');

for (let name in config.entry) {
  config.entry[name] = [
    'webpack/hot/dev-server',
    `webpack-dev-server/client?hot=true&hostname=${host}&port=${port}`,
  ].concat(config.entry[name]);
}

const compiler = webpack(config);

const server = new webpackDevServer({
  hot: true,
  liveReload: false,
  client: {
    webSocketTransport: 'sockjs',
  },
  webSocketServer: 'sockjs',
  port: port,
  host: host,
  static: {
    directory: path.join(__dirname, '../dist')
  },
  devMiddleware: {
    publicPath: `${host}:${port}/`,
    writeToDisk: true
  },
  headers: {
    'Access-Control-Allow-Origin': '*',
  },
  allowedHosts: 'all',
}, compiler);

(async () => {
  await server.start();
})();
