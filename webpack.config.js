const fs = require('fs');
const path = require('path');
const { merge } = require('webpack-merge');
const Dotenv = require('dotenv-webpack');
const { VueLoaderPlugin } = require('vue-loader');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const { app_env, browser } = require('./config/config.js');

const requireAllUrlsPermission = process.env.REQUIRE_ALL_URLS_PERMISSION !== 'false';

function manifestMerge(fileMain, fileBrowser) {
  const main = JSON.parse(fs.readFileSync(fileMain, 'utf8'));
  const browserManifest = JSON.parse(fs.readFileSync(fileBrowser, 'utf8'));
  const manifest = merge(main, browserManifest);

  if (requireAllUrlsPermission) {
    manifest.host_permissions = Array.from(new Set([
      ...(manifest.host_permissions || []),
      '<all_urls>',
    ]));
    delete manifest.optional_host_permissions;
  } else {
    manifest.optional_host_permissions = Array.from(new Set([
      ...(manifest.optional_host_permissions || []),
      '<all_urls>',
    ]));
    manifest.host_permissions = (manifest.host_permissions || []).filter((origin) => origin !== '<all_urls>');
    if (manifest.host_permissions.length === 0) {
      delete manifest.host_permissions;
    }
  }

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
        test: /\.(jpe?g|png)$/,
        loader: 'responsive-loader',
        options: {
          adapter: require('responsive-loader/sharp'),
          sizes: [480, 768, 1024],
          quality: 85,
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
          transform(path, content) {
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
