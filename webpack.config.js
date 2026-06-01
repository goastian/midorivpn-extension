const fs = require('fs');
const path = require('path');
const { merge } = require('webpack-merge');
const Dotenv = require('dotenv-webpack');
const { VueLoaderPlugin } = require('vue-loader');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const { app_env, browser } = require('./config/config.js');

function safeOrigin(value) {
  if (!value) return null;
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function buildExtensionPagesCsp() {
  const origins = new Set();
  [process.env.API_URL, process.env.ACCOUNT_URL, process.env.AUTHENTIK_ISSUER, process.env.AUTHENTIK_AUTHORIZATION_URL]
    .map(safeOrigin)
    .filter(Boolean)
    .forEach((o) => origins.add(o));

  const connectSrc = ["'self'", ...origins].join(' ');
  // In development the popup connects to webpack-dev-server (HMR / sockjs).
  const devSources = app_env === 'development'
    ? " http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*"
    : '';
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}${devSources}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function manifestMerge(fileMain, fileBrowser) {
  const main = JSON.parse(fs.readFileSync(fileMain, 'utf8'));
  const browserManifest = JSON.parse(fs.readFileSync(fileBrowser, 'utf8'));
  const manifest = merge(main, browserManifest);

  // All MidoriVPN permissions are required at install time. Promote anything
  // that may still live under optional_* into the required sets so the browser
  // prompts the user up front instead of running with a half-broken background
  // that crashes when proxy/webRequest/webNavigation are unavailable.
  if (Array.isArray(manifest.optional_permissions)) {
    manifest.permissions = Array.from(new Set([
      ...(manifest.permissions || []),
      ...manifest.optional_permissions,
    ]));
    delete manifest.optional_permissions;
  }

  manifest.host_permissions = Array.from(new Set([
    ...(manifest.host_permissions || []),
    ...(manifest.optional_host_permissions || []),
    '<all_urls>',
  ]));
  delete manifest.optional_host_permissions;

  manifest.content_security_policy = {
    ...(manifest.content_security_policy || {}),
    extension_pages: buildExtensionPagesCsp(),
  };

  return JSON.stringify(manifest, null, 2);
}

const config = {
  mode: app_env,
  entry: {
    popup: './src/main.js',
    background: path.join(__dirname, 'src', 'background', 'index.js'),
    welcome: path.join(__dirname, 'src', 'welcome.js'),
  },
  output: {
    path: path.join(__dirname, 'dist'),
    filename: ({ chunk }) => {
      if (chunk.name == 'background') {
        return '[name].js';
      }
      return '[name].[contenthash].js';
    },
    publicPath: '/',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          { loader: 'css-loader' },
        ]
      },
      {
        test: /\.vue$/,
        loader: 'vue-loader'
      },
      {
        test: /\.(js|ts)$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
      },
      {
        test: /\.(jpe?g|png|svg|webp)$/,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[name].[contenthash][ext]',
        },
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: [
    new Dotenv(),
    new VueLoaderPlugin(),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'public', 'index.html'),
      filename: 'popup.html',
      chunks: ['popup'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'public', 'welcome.html'),
      filename: 'welcome.html',
      chunks: ['welcome'],
      cache: false,
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.join(__dirname, 'manifest', 'main.json'),
          to: path.join(__dirname, 'dist', 'manifest.json'),
          force: true,
          transform(_path, _content) {
            return Buffer.from(
              manifestMerge(
                './manifest/main.json',
                `./manifest/${browser == 'firefox' ? 'firefox' : 'chrome'}.json`
              )
            )
          }
        },
        {
          from: path.join(__dirname, 'compressed-assets'),
          to: path.join(__dirname, 'dist', 'icons')
        }
      ]
    }),
    new MiniCssExtractPlugin({
      filename: '[name].[contenthash].css',
    }),
  ],
  optimization: {
    splitChunks: {
      chunks: (chunk) => {
        return chunk.name !== 'background' && chunk.name !== 'welcome';
      },
      minSize: 10000,
      maxSize: 50000,
    },
  },
}

if (config.mode == 'development') {
  config.devtool = 'cheap-module-source-map'
}

module.exports = config;
