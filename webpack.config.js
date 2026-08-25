const fs = require('fs');
const path = require('path');
const { merge } = require('webpack-merge');
const { VueLoaderPlugin } = require('vue-loader');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const webpack = require('webpack');
const { app_env, browser } = require('./config/config.js');

const requiredEnvironment = [
  'APP_ENV',
  'API_URL',
  'ACCOUNT_URL',
  'PUBLIC_BASE_URL',
  'AUTHENTIK_ISSUER',
  'AUTHENTIK_AUTHORIZATION_URL',
  'AUTHENTIK_CLIENT_ID',
  'AUTHENTIK_REDIRECT_URI',
];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]?.trim());
if (missingEnvironment.length > 0) {
  throw new Error(`Missing required extension environment: ${missingEnvironment.join(', ')}`);
}

const API_URL = process.env.API_URL.trim();
const ACCOUNT_URL = process.env.ACCOUNT_URL.trim();
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL.trim();
const AUTHENTIK_ISSUER = process.env.AUTHENTIK_ISSUER.trim();
const AUTHENTIK_AUTHORIZATION_URL = process.env.AUTHENTIK_AUTHORIZATION_URL.trim();
const AUTHENTIK_CLIENT_ID = process.env.AUTHENTIK_CLIENT_ID.trim();
const AUTHENTIK_REDIRECT_URI = process.env.AUTHENTIK_REDIRECT_URI.trim();

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
  [API_URL, ACCOUNT_URL, AUTHENTIK_ISSUER, AUTHENTIK_AUTHORIZATION_URL]
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

  if (manifest.background && Array.isArray(manifest.background.scripts)) {
    manifest.background.scripts = Array.from(new Set(manifest.background.scripts));
  }

  if (browser === 'firefox') {
    delete manifest.background?.service_worker;
  } else {
    delete manifest.background?.scripts;
    delete manifest.browser_specific_settings;
  }

  // Network/proxy access is an explicit user decision. Keep these entries
  // optional in the built manifest so an install cannot silently receive
  // global browsing access before VPN mode is enabled.

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
    new webpack.DefinePlugin({
      'process.env.API_URL': JSON.stringify(API_URL),
      'process.env.ACCOUNT_URL': JSON.stringify(ACCOUNT_URL),
      'process.env.PUBLIC_BASE_URL': JSON.stringify(PUBLIC_BASE_URL),
      'process.env.AUTHENTIK_ISSUER': JSON.stringify(AUTHENTIK_ISSUER),
      'process.env.AUTHENTIK_CLIENT_ID': JSON.stringify(AUTHENTIK_CLIENT_ID),
      'process.env.AUTHENTIK_AUTHORIZATION_URL': JSON.stringify(AUTHENTIK_AUTHORIZATION_URL),
      'process.env.AUTHENTIK_REDIRECT_URI': JSON.stringify(AUTHENTIK_REDIRECT_URI),
      'process.env.APP_ENV': JSON.stringify(app_env),
      'process.env.BROWSER': JSON.stringify(browser),
    }),
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
