const fs = require('fs');
const path = require('path');
const { merge } = require('webpack-merge');
const Dotenv = require('dotenv-webpack');
const { VueLoaderPlugin } = require('vue-loader');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const { app_env, browser } = require('./config/config.js');

function manifestMerge(fileMain, fileBrowser) {
  const main = JSON.parse(fs.readFileSync(fileMain, 'utf8'));
  const browser = JSON.parse(fs.readFileSync(fileBrowser, 'utf8'));
  return JSON.stringify(merge(main, browser));
}

const config = {
  mode: app_env,
  entry: {
    popup: './src/main.js',
    background: path.join(__dirname, 'src', 'background', 'index.js'),
  },
  output: {
    path: path.join(__dirname, 'dist'),
    filename: ({chunk}) => {
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
          { loader: 'style-loader'},
          { loader: 'css-loader'},
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
          from: path.join(__dirname, 'public', 'icons'),
          to: path.join(__dirname, 'dist', 'icons')
        }
      ]
    })
  ],
  optimization: {
    splitChunks: {
      chunks: (chunk) => {
        return chunk.name !== 'background';
      },
      minSize: 30000,
      maxSize: 200000,
    },
  },
}

if(config.mode == 'development') {
  config.devtool = 'cheap-module-source-map'
}

module.exports = config;
